-- Autonomous admission: facts that live research verified become approved claims
-- without a human reviewer.
--
-- The application decides *what* a claim says (extraction, deterministic checks and an
-- entailment check). This function decides *whether it may be published*: it takes the
-- identity and standing of every source from knowledge_sources, never from the caller,
-- and re-checks the evidence contract inside the publication transaction:
--   * two or more works from different publishers, each credible or trusted; or
--   * one trusted work from an authoritative publisher.
-- Every source must have been read within the last hour and must not be rejected.
--
-- Claims are stored in DCF's own words with a locator. No source text is retained
-- (approval_metadata.storage_mode = 'harvest_verified'). They carry the existing
-- 'automated_evidence_verification' origin, so the existing "Pause automatic admission"
-- switch (guard_demand_auto_admission) stops them too, and they expire after a year
-- unless a later answer verifies them again.
-- Additive: existing tables and rows are untouched; two harvest functions are replaced.

CREATE OR REPLACE FUNCTION public.admit_harvest_verified_claim(p_admission jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_personality uuid := (p_admission->>'personality_id')::uuid;
  v_text text := btrim(p_admission->>'claim_text');
  v_hash text := p_admission->>'claim_hash';
  v_policy text := p_admission->>'policy_version';
  v_item jsonb;
  v_ks knowledge_sources%ROWTYPE;
  v_existing record;
  v_source_id uuid;
  v_claim_id uuid;
  v_count integer;
  v_work_keys text[] := '{}';
  v_publishers text[] := '{}';
  v_ks_ids uuid[] := '{}';
  v_trusted_single boolean := false;
  v_locator text;
  v_valid_until timestamptz := now() + interval '365 days';
BEGIN
  IF v_personality IS NULL OR length(v_text) NOT BETWEEN 18 AND 350 OR v_hash !~ '^[0-9a-f]{64}$'
    OR v_policy <> 'harvest-admission/1'
    OR p_admission->>'epistemic_type' <> 'HISTORICAL_FACT'
    OR p_admission->>'category' NOT IN ('ordinary_fact', 'official_record_fact')
    OR jsonb_typeof(p_admission->'sources') <> 'array'
    OR jsonb_array_length(p_admission->'sources') NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Invalid harvest admission payload' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_admission->'sources');

  PERFORM pg_advisory_xact_lock(hashtextextended(v_personality::text || ':' || v_hash, 0));
  -- A runaway loop cannot flood the Library.
  IF (SELECT count(*) FROM demand_verification_decisions
      WHERE outcome = 'admitted' AND policy_version = v_policy AND created_at > now() - interval '24 hours') >= 200 THEN
    RAISE EXCEPTION 'Daily autonomous admission limit reached' USING ERRCODE = '54000';
  END IF;

  SELECT d.claim_id INTO v_claim_id FROM demand_verification_decisions d
    WHERE d.personality_id = v_personality AND d.claim_hash = v_hash AND d.outcome = 'admitted' LIMIT 1;
  IF v_claim_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM claims c WHERE c.id = v_claim_id AND c.review_status = 'approved') THEN
      RAISE EXCEPTION 'This claim was admitted before and later suspended' USING ERRCODE = '22023';
    END IF;
    -- Verified again by a new answer: extend its validity.
    UPDATE claims SET approval_metadata = jsonb_set(approval_metadata, '{valid_until}', to_jsonb(v_valid_until)), updated_at = now()
      WHERE id = v_claim_id AND approval_metadata->>'storage_mode' = 'harvest_verified';
    RETURN jsonb_build_object('claim_id', v_claim_id, 'created', false);
  END IF;
  SELECT id INTO v_claim_id FROM claims WHERE personality_id = v_personality
    AND btrim(regexp_replace(lower(claim_text), '[^a-z0-9]+', ' ', 'g')) = btrim(regexp_replace(lower(v_text), '[^a-z0-9]+', ' ', 'g'))
    AND review_status = 'approved' LIMIT 1;
  IF v_claim_id IS NOT NULL THEN RETURN jsonb_build_object('claim_id', v_claim_id, 'created', false); END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_admission->'sources') LOOP
    SELECT * INTO v_ks FROM knowledge_sources WHERE work_key = v_item->>'work_key';
    IF NOT FOUND THEN RAISE EXCEPTION 'Source was not harvested' USING ERRCODE = '22023'; END IF;
    IF v_ks.status = 'rejected' OR v_ks.credibility_tier NOT IN ('trusted', 'credible')
      OR v_ks.authority_level = 'general_web'
      OR v_ks.last_verified_at IS NULL OR v_ks.last_verified_at < now() - interval '1 hour' THEN
      RAISE EXCEPTION 'Source is not eligible for autonomous admission' USING ERRCODE = '22023';
    END IF;
    IF v_ks.work_key = ANY (v_work_keys) OR regexp_replace(v_ks.domain, '^www\.', '') = ANY (v_publishers) THEN
      RAISE EXCEPTION 'Corroborating works are not independent' USING ERRCODE = '22023';
    END IF;
    v_work_keys := array_append(v_work_keys, v_ks.work_key);
    v_publishers := array_append(v_publishers, regexp_replace(v_ks.domain, '^www\.', ''));
    v_ks_ids := array_append(v_ks_ids, v_ks.id);
    v_trusted_single := v_ks.credibility_tier = 'trusted' AND v_ks.authority_level = 'authoritative';
  END LOOP;
  IF NOT (v_count >= 2 OR v_trusted_single) THEN
    RAISE EXCEPTION 'Evidence contract failed: one source must be trusted and authoritative' USING ERRCODE = '22023';
  END IF;

  INSERT INTO claims (personality_id, claim_text, claim_kind, certainty, review_status, approval_origin, evidence_type,
    approved_at, approved_by_label, approval_note, approval_metadata)
  VALUES (v_personality, v_text, 'established_fact', CASE WHEN v_count >= 2 THEN 'high' ELSE 'medium' END, 'approved',
    'automated_evidence_verification', 'historical_fact', now(), 'automated_evidence_verification',
    'Verified autonomously from live research; no reviewer involved',
    jsonb_build_object('policy_version', v_policy, 'storage_mode', 'harvest_verified', 'machine_verified', true,
      'basis', CASE WHEN v_count >= 2 THEN 'independent_corroboration' ELSE 'trusted_single_source' END,
      'valid_until', v_valid_until, 'independent_work_keys', to_jsonb(v_work_keys),
      'knowledge_source_ids', to_jsonb(v_ks_ids), 'question_hash', left(p_admission->>'question_hash', 64)))
  RETURNING id INTO v_claim_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_admission->'sources') LOOP
    SELECT * INTO v_ks FROM knowledge_sources WHERE work_key = v_item->>'work_key';
    v_locator := coalesce(nullif(left(btrim(v_item->>'locator'), 300), ''), 'Page');
    SELECT id, source_status INTO v_existing FROM sources WHERE url = v_ks.canonical_url ORDER BY created_at LIMIT 1;
    IF v_existing.id IS NOT NULL AND v_existing.source_status <> 'approved' THEN
      -- A person left this source pending or rejected it. The machine does not overrule that.
      RAISE EXCEPTION 'Library source exists but is not approved' USING ERRCODE = '22023';
    END IF;
    v_source_id := coalesce(v_ks.library_source_id, v_existing.id);
    IF v_source_id IS NULL OR NOT EXISTS (SELECT 1 FROM sources WHERE id = v_source_id AND source_status = 'approved') THEN
      IF v_existing.id IS NOT NULL THEN v_source_id := v_existing.id;
      ELSE
        INSERT INTO sources (title, url, author, publisher_or_institution, publication_year, source_type, citation,
          source_status, ingestion_status, rights_or_access_note, approval_origin, approved_at, approved_by_label,
          approval_note, metadata)
        VALUES (v_ks.title, v_ks.canonical_url, v_ks.author, coalesce(v_ks.publisher, v_ks.journal, v_ks.domain),
          CASE WHEN v_ks.publication_date ~ '(1[0-9]{3}|20[0-9]{2})'
            THEN substring(v_ks.publication_date FROM '(1[0-9]{3}|20[0-9]{2})')::integer END,
          CASE v_ks.evidence_type
            WHEN 'primary_document' THEN 'primary_text' WHEN 'traditional_text' THEN 'primary_text'
            WHEN 'scholarly_interpretation' THEN 'scholarly_article' WHEN 'institutional_record' THEN 'institutional'
            ELSE 'other' END,
          v_ks.title || ' (' || v_ks.canonical_url || ')', 'approved', 'ready',
          'Pointer-only factual citation; no source text retained', 'automated_evidence_verification', now(),
          'automated_evidence_verification', 'Admitted autonomously on credibility score ' || v_ks.credibility_score,
          jsonb_build_object('independentWorkKey', v_ks.work_key, 'publicationDate', v_ks.publication_date,
            'knowledge_harvest', jsonb_build_object('knowledge_source_id', v_ks.id, 'credibility_score', v_ks.credibility_score,
              'credibility_tier', v_ks.credibility_tier, 'scoring_version', v_ks.scoring_version)))
        RETURNING id INTO v_source_id;
      END IF;
    END IF;
    INSERT INTO claim_sources (claim_id, source_id, relationship, evidence_excerpt, page_or_section)
      VALUES (v_claim_id, v_source_id, 'supports', NULL, v_locator);
    INSERT INTO source_personalities (source_id, personality_id, relationship, confidence, mapping_method)
      VALUES (v_source_id, v_personality, 'supports_claims', v_ks.credibility_score / 100.0, 'claim_link')
      ON CONFLICT (source_id, personality_id) DO NOTHING;
    UPDATE knowledge_sources SET library_source_id = v_source_id, status = 'promoted',
      reviewed_at = now(), reviewed_by = 'automated_evidence_verification' WHERE id = v_ks.id;
  END LOOP;

  INSERT INTO claim_epistemics (claim_id, personality_id, epistemic_type, proposed_type, type_origin, type_confidence,
    type_review_status, classifier_version, contract_status, contract_satisfied, contract_basis, contract_version, contract_detail)
  VALUES (v_claim_id, v_personality, 'HISTORICAL_FACT', 'HISTORICAL_FACT', 'deterministic', 0.7, 'auto_assigned',
    p_admission->>'classifier_version', 'SUPPORTED', true, 'fact', p_admission->>'contract_version',
    jsonb_build_object('policy_version', v_policy, 'work_keys', to_jsonb(v_work_keys), 'storage_mode', 'harvest_verified'));
  INSERT INTO demand_verification_decisions (personality_id, claim_hash, claim_id, outcome, support, epistemic_type,
    policy_version, reason_codes, source_work_keys, research_request_id)
  VALUES (v_personality, v_hash, v_claim_id, 'admitted', 'SUPPORTED', 'HISTORICAL_FACT', v_policy,
    ARRAY['all_gates_passed', CASE WHEN v_count >= 2 THEN 'independent_corroboration' ELSE 'trusted_single_source' END],
    v_work_keys, left(p_admission->>'question_hash', 64));
  RETURN jsonb_build_object('claim_id', v_claim_id, 'created', true);
END;
$$;

-- Why a candidate was not admitted. Outcomes other than 'admitted' only.
CREATE OR REPLACE FUNCTION public.record_harvest_decision(p_decision jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_decision->>'outcome' NOT IN ('quarantined', 'rejected', 'duplicate')
    OR p_decision->>'policy_version' <> 'harvest-admission/1'
    OR p_decision->>'claim_hash' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid harvest decision' USING ERRCODE = '22023';
  END IF;
  INSERT INTO demand_verification_decisions (personality_id, claim_hash, outcome, support, epistemic_type, policy_version,
    reason_codes, source_work_keys, research_request_id)
  VALUES ((p_decision->>'personality_id')::uuid, p_decision->>'claim_hash', p_decision->>'outcome', p_decision->>'support',
    p_decision->>'epistemic_type', p_decision->>'policy_version',
    ARRAY(SELECT left(value, 160) FROM jsonb_array_elements_text(coalesce(p_decision->'reason_codes', '[]'::jsonb)) LIMIT 6),
    ARRAY(SELECT left(value, 600) FROM jsonb_array_elements_text(coalesce(p_decision->'source_work_keys', '[]'::jsonb)) LIMIT 4),
    left(p_decision->>'question_hash', 64));
END;
$$;

-- Withdraw an autonomously admitted claim from answers. It is kept, marked for attention.
CREATE OR REPLACE FUNCTION public.suspend_harvest_claim(p_claim_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_reason NOT IN ('contradiction', 'source_rejected', 'verification_expired') THEN
    RAISE EXCEPTION 'Invalid suspension reason' USING ERRCODE = '22023';
  END IF;
  UPDATE claims SET review_status = 'needs_review', updated_at = now(),
      approval_metadata = approval_metadata || jsonb_build_object('suspended_reason', p_reason, 'suspended_at', now())
    WHERE id = p_claim_id AND review_status = 'approved' AND approval_origin = 'automated_evidence_verification'
      AND approval_metadata->>'storage_mode' = 'harvest_verified';
  RETURN FOUND;
END;
$$;

-- Rejecting a harvested source now also withdraws the claims that rested on it.
CREATE OR REPLACE FUNCTION public.review_knowledge_source(p_source_id uuid, p_action text, p_reviewer text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row knowledge_sources%ROWTYPE;
  v_library uuid;
  v_suspended integer := 0;
BEGIN
  SELECT * INTO v_row FROM knowledge_sources WHERE id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Harvested source not found' USING ERRCODE = 'P0002'; END IF;

  IF p_action = 'reject' THEN
    UPDATE knowledge_sources SET status = 'rejected', reviewed_at = now(), reviewed_by = left(p_reviewer, 120),
      review_note = left(p_note, 1000) WHERE id = p_source_id;
    UPDATE knowledge_findings SET status = 'rejected' WHERE source_id = p_source_id;
    SELECT count(*) INTO v_suspended FROM claims c
      WHERE c.review_status = 'approved' AND c.approval_metadata->>'storage_mode' = 'harvest_verified'
        AND c.approval_metadata->'knowledge_source_ids' ? p_source_id::text
        AND suspend_harvest_claim(c.id, 'source_rejected');
    RETURN jsonb_build_object('status', 'rejected', 'suspended_claims', v_suspended);
  ELSIF p_action = 'restore' THEN
    IF v_row.status <> 'rejected' THEN RAISE EXCEPTION 'Only a rejected source can be restored' USING ERRCODE = '22023'; END IF;
    UPDATE knowledge_sources SET status = CASE WHEN library_source_id IS NULL THEN 'active' ELSE 'promoted' END,
      reviewed_at = now(), reviewed_by = left(p_reviewer, 120), review_note = left(p_note, 1000) WHERE id = p_source_id;
    UPDATE knowledge_findings SET status = 'active' WHERE source_id = p_source_id;
    RETURN jsonb_build_object('status', CASE WHEN v_row.library_source_id IS NULL THEN 'active' ELSE 'promoted' END);
  ELSIF p_action = 'promote' THEN
    IF v_row.status = 'rejected' THEN RAISE EXCEPTION 'A rejected source cannot be promoted' USING ERRCODE = '22023'; END IF;
    v_library := v_row.library_source_id;
    IF v_library IS NULL THEN
      SELECT id INTO v_library FROM sources WHERE url = v_row.canonical_url ORDER BY created_at LIMIT 1;
    END IF;
    IF v_library IS NULL THEN
      INSERT INTO sources (title, author, publisher_or_institution, publication_year, source_type, url, source_status,
        approval_origin, rights_or_access_note, notes, metadata)
      VALUES (v_row.title, v_row.author, coalesce(v_row.publisher, v_row.journal, v_row.domain),
        CASE WHEN v_row.publication_date ~ '(1[0-9]{3}|20[0-9]{2})'
          THEN substring(v_row.publication_date FROM '(1[0-9]{3}|20[0-9]{2})')::integer END,
        CASE v_row.evidence_type
          WHEN 'primary_document' THEN 'primary_text' WHEN 'traditional_text' THEN 'primary_text'
          WHEN 'scholarly_interpretation' THEN 'scholarly_article' WHEN 'institutional_record' THEN 'institutional'
          ELSE 'other' END,
        v_row.canonical_url, 'candidate', 'ai_candidate', v_row.rights_declaration,
        'Found by live Ask research and promoted from the knowledge harvest for review.',
        jsonb_build_object('knowledge_harvest', jsonb_build_object('knowledge_source_id', v_row.id, 'work_key', v_row.work_key,
          'credibility_score', v_row.credibility_score, 'credibility_tier', v_row.credibility_tier,
          'scoring_version', v_row.scoring_version, 'doi', v_row.doi, 'isbn', v_row.isbn,
          'distinct_questions', v_row.distinct_questions, 'times_cited', v_row.times_cited)))
      RETURNING id INTO v_library;
    END IF;
    INSERT INTO source_personalities (source_id, personality_id, relationship, confidence, mapping_method, metadata)
    SELECT v_library, f.personality_id, 'relevant', v_row.credibility_score / 100.0, 'ai',
      jsonb_build_object('knowledge_harvest', true, 'findings', count(*))
    FROM knowledge_findings f WHERE f.source_id = p_source_id AND f.status = 'active'
    GROUP BY f.personality_id
    ON CONFLICT (source_id, personality_id) DO NOTHING;
    UPDATE knowledge_sources SET status = 'promoted', library_source_id = v_library, reviewed_at = now(),
      reviewed_by = left(p_reviewer, 120), review_note = left(p_note, 1000) WHERE id = p_source_id;
    RETURN jsonb_build_object('status', 'promoted', 'library_source_id', v_library);
  END IF;
  RAISE EXCEPTION 'Unknown review action' USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION public.knowledge_harvest_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'sources', (SELECT count(*) FROM knowledge_sources),
    'trusted', (SELECT count(*) FROM knowledge_sources WHERE credibility_tier = 'trusted' AND status <> 'rejected'),
    'credible', (SELECT count(*) FROM knowledge_sources WHERE credibility_tier = 'credible' AND status <> 'rejected'),
    'promotionReady', (SELECT count(*) FROM knowledge_sources WHERE status = 'promotion_ready'),
    'promoted', (SELECT count(*) FROM knowledge_sources WHERE status = 'promoted'),
    'rejected', (SELECT count(*) FROM knowledge_sources WHERE status = 'rejected'),
    'findings', (SELECT count(*) FROM knowledge_findings WHERE status = 'active'),
    'licensedFindings', (SELECT count(*) FROM knowledge_findings WHERE excerpt IS NOT NULL),
    'runs30d', (SELECT count(*) FROM knowledge_harvest_runs WHERE created_at > now() - interval '30 days'),
    'recallHits30d', (SELECT coalesce(sum(recall_hits), 0) FROM knowledge_harvest_runs WHERE created_at > now() - interval '30 days'),
    'searchesSaved30d', (SELECT count(*) FROM knowledge_harvest_runs WHERE search_saved AND created_at > now() - interval '30 days'),
    'autoClaims', (SELECT count(*) FROM claims WHERE review_status = 'approved' AND approval_metadata->>'storage_mode' = 'harvest_verified'),
    'autoClaims30d', (SELECT count(*) FROM demand_verification_decisions WHERE outcome = 'admitted'
      AND policy_version = 'harvest-admission/1' AND created_at > now() - interval '30 days'),
    'autoHeld30d', (SELECT count(*) FROM demand_verification_decisions WHERE outcome IN ('quarantined', 'rejected')
      AND policy_version = 'harvest-admission/1' AND created_at > now() - interval '30 days'),
    'autoSuspended', (SELECT count(*) FROM claims WHERE review_status = 'needs_review' AND approval_metadata->>'storage_mode' = 'harvest_verified'));
$$;

REVOKE EXECUTE ON FUNCTION public.admit_harvest_verified_claim(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_harvest_decision(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.suspend_harvest_claim(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admit_harvest_verified_claim(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_harvest_decision(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.suspend_harvest_claim(uuid, text) TO service_role;
