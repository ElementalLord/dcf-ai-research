-- Knowledge harvest: every Ask that uses live search also records what it read.
--
--   knowledge_sources       one row per work (DOI, ISBN, title/author or page), with a
--                           multi-signal credibility score and a usage track record
--   knowledge_findings      one row per supporting passage, per source and personality
--   knowledge_harvest_runs  one row per harvesting Ask, for oversight
--
-- Retention: a passage's words are stored only when the page declares an open licence
-- (retention = 'licensed_excerpt'). Otherwise the finding is a pointer: locator, a hash
-- of the passage and its topic terms, enough to find and re-read the page later.
-- No question text and no user identifier is stored; a question is kept only as a
-- hash of its topic terms, to count distinct questions.
--
-- Nothing here is approved Library knowledge. Promotion creates an ordinary candidate
-- source that follows the existing human review workflow.
-- Additive only: no existing table, function or row is changed.

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_key text NOT NULL UNIQUE CHECK (length(work_key) BETWEEN 3 AND 600),
  canonical_url text NOT NULL CHECK (canonical_url ~ '^https://' AND length(canonical_url) <= 2000),
  domain text NOT NULL CHECK (length(domain) BETWEEN 3 AND 253),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  author text,
  publisher text,
  publication_date text,
  journal text,
  doi text,
  isbn text,
  evidence_type text NOT NULL CHECK (evidence_type IN
    ('primary_document','traditional_text','scholarly_interpretation','institutional_record','edited_secondary','general_web')),
  authority_level text NOT NULL CHECK (authority_level IN ('authoritative','credible_secondary','general_web')),
  authority_basis text,
  rights_declaration text,
  retention text NOT NULL DEFAULT 'pointer_only' CHECK (retention IN ('pointer_only','licensed_excerpt')),
  credibility_score smallint NOT NULL CHECK (credibility_score BETWEEN 0 AND 100),
  credibility_tier text NOT NULL CHECK (credibility_tier IN ('trusted','credible','provisional','unverified')),
  credibility_signals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(credibility_signals) = 'array'),
  scoring_version text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','promotion_ready','promoted','rejected')),
  library_source_id uuid REFERENCES public.sources(id) ON DELETE SET NULL,
  discovery_provider text,
  times_seen integer NOT NULL DEFAULT 1 CHECK (times_seen >= 0),
  times_cited integer NOT NULL DEFAULT 0 CHECK (times_cited >= 0),
  question_hashes text[] NOT NULL DEFAULT '{}',
  distinct_questions integer NOT NULL DEFAULT 0 CHECK (distinct_questions >= 0),
  recall_hits integer NOT NULL DEFAULT 0 CHECK (recall_hits >= 0),
  recall_failures integer NOT NULL DEFAULT 0 CHECK (recall_failures >= 0),
  consecutive_recall_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_recall_failures >= 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text
);
COMMENT ON TABLE public.knowledge_sources IS
  'Works read during live Ask research, scored for credibility. Never approved Library records; promotion creates a candidate source for human review.';

CREATE INDEX IF NOT EXISTS knowledge_sources_review_idx
  ON public.knowledge_sources (status, credibility_score DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_sources_domain_idx ON public.knowledge_sources (domain);
CREATE INDEX IF NOT EXISTS knowledge_sources_library_idx
  ON public.knowledge_sources (library_source_id) WHERE library_source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.knowledge_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  personality_id uuid NOT NULL REFERENCES public.personalities(id) ON DELETE CASCADE,
  passage_hash text NOT NULL CHECK (passage_hash ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL DEFAULT 'answer_evidence' CHECK (kind IN ('answer_evidence','deep_harvest')),
  locator text,
  -- Null unless the source row has retention = 'licensed_excerpt' (enforced by record_knowledge_harvest).
  excerpt text CHECK (excerpt IS NULL OR length(excerpt) <= 600),
  topic_terms text[] NOT NULL DEFAULT '{}',
  support_level text CHECK (support_level IN ('EXACT','STRONG','PARTIAL')),
  support_reason text,
  corroboration smallint NOT NULL DEFAULT 0 CHECK (corroboration >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','rejected')),
  times_seen integer NOT NULL DEFAULT 1 CHECK (times_seen >= 0),
  times_cited integer NOT NULL DEFAULT 0 CHECK (times_cited >= 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, personality_id, passage_hash)
);
COMMENT ON TABLE public.knowledge_findings IS
  'Passages that supported a question, per harvested source and personality. Pointer-only unless the source is openly licensed.';

CREATE INDEX IF NOT EXISTS knowledge_findings_recall_idx ON public.knowledge_findings USING gin (topic_terms);
CREATE INDEX IF NOT EXISTS knowledge_findings_personality_idx
  ON public.knowledge_findings (personality_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.knowledge_harvest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  personality_id uuid REFERENCES public.personalities(id) ON DELETE CASCADE,
  question_hash text NOT NULL,
  providers text[] NOT NULL DEFAULT '{}',
  sources_seen integer NOT NULL DEFAULT 0,
  findings_seen integer NOT NULL DEFAULT 0,
  new_sources integer NOT NULL DEFAULT 0,
  new_findings integer NOT NULL DEFAULT 0,
  cited_findings integer NOT NULL DEFAULT 0,
  recall_attempted integer NOT NULL DEFAULT 0,
  recall_hits integer NOT NULL DEFAULT 0,
  search_saved boolean NOT NULL DEFAULT false,
  duration_ms integer NOT NULL DEFAULT 0
);
COMMENT ON TABLE public.knowledge_harvest_runs IS
  'One row per Ask that harvested live research. Metadata only: no question text, URL or user identifier.';
CREATE INDEX IF NOT EXISTS knowledge_harvest_runs_created_idx ON public.knowledge_harvest_runs (created_at DESC);

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_harvest_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_sources, public.knowledge_findings, public.knowledge_harvest_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.knowledge_sources, public.knowledge_findings, public.knowledge_harvest_runs TO service_role;

-- Store one harvest atomically. The application supplies the credibility score; this
-- function owns counters, retention enforcement and status transitions.
CREATE OR REPLACE FUNCTION public.record_knowledge_harvest(p_harvest jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_personality uuid := (p_harvest->>'personality_id')::uuid;
  v_question text := left(coalesce(p_harvest->>'question_hash', ''), 64);
  v_source jsonb;
  v_finding jsonb;
  v_source_id uuid;
  v_inserted boolean;
  v_retention text;
  v_status text;
  v_cited integer;
  v_new_sources integer := 0;
  v_new_findings integer := 0;
  v_sources integer := 0;
  v_findings integer := 0;
  v_cited_findings integer := 0;
  v_ready integer := 0;
  v_run uuid;
BEGIN
  IF v_personality IS NULL OR v_question !~ '^[0-9a-f]{16,64}$' THEN
    RAISE EXCEPTION 'Invalid harvest payload' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_harvest->'sources', '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(coalesce(p_harvest->'sources', '[]'::jsonb)) > 40 THEN
    RAISE EXCEPTION 'Invalid harvest sources' USING ERRCODE = '22023';
  END IF;

  FOR v_source IN SELECT value FROM jsonb_array_elements(coalesce(p_harvest->'sources', '[]'::jsonb)) LOOP
    v_cited := CASE WHEN (v_source->>'cited')::boolean THEN 1 ELSE 0 END;
    v_retention := CASE WHEN v_source->>'retention' = 'licensed_excerpt' THEN 'licensed_excerpt' ELSE 'pointer_only' END;
    INSERT INTO knowledge_sources AS s (work_key, canonical_url, domain, title, author, publisher, publication_date, journal,
      doi, isbn, evidence_type, authority_level, authority_basis, rights_declaration, retention, credibility_score,
      credibility_tier, credibility_signals, scoring_version, discovery_provider, times_cited, question_hashes,
      distinct_questions, last_verified_at)
    VALUES (v_source->>'work_key', v_source->>'url', v_source->>'domain', left(v_source->>'title', 300),
      nullif(left(v_source->>'author', 300), ''), nullif(left(v_source->>'publisher', 300), ''),
      nullif(left(v_source->>'publication_date', 40), ''), nullif(left(v_source->>'journal', 300), ''),
      nullif(left(v_source->>'doi', 200), ''), nullif(left(v_source->>'isbn', 40), ''),
      v_source->>'evidence_type', v_source->>'authority_level', left(v_source->>'authority_basis', 300),
      nullif(left(v_source->>'rights', 300), ''), v_retention, (v_source->>'score')::smallint, v_source->>'tier',
      coalesce(v_source->'signals', '[]'::jsonb), v_source->>'scoring_version', left(v_source->>'provider', 40),
      v_cited, ARRAY[v_question], 1, now())
    ON CONFLICT (work_key) DO UPDATE SET
      -- Never downgrade identity: keep what is known and fill only the gaps.
      author = coalesce(s.author, excluded.author),
      publisher = coalesce(s.publisher, excluded.publisher),
      publication_date = coalesce(s.publication_date, excluded.publication_date),
      journal = coalesce(s.journal, excluded.journal),
      doi = coalesce(s.doi, excluded.doi),
      isbn = coalesce(s.isbn, excluded.isbn),
      rights_declaration = coalesce(excluded.rights_declaration, s.rights_declaration),
      retention = CASE WHEN excluded.retention = 'licensed_excerpt' THEN 'licensed_excerpt' ELSE s.retention END,
      authority_level = excluded.authority_level,
      authority_basis = excluded.authority_basis,
      credibility_score = excluded.credibility_score,
      credibility_tier = excluded.credibility_tier,
      credibility_signals = excluded.credibility_signals,
      scoring_version = excluded.scoring_version,
      times_seen = s.times_seen + 1,
      times_cited = s.times_cited + excluded.times_cited,
      question_hashes = CASE WHEN v_question = ANY (s.question_hashes) THEN s.question_hashes
        ELSE (s.question_hashes || v_question)[greatest(1, cardinality(s.question_hashes) - 48):] END,
      distinct_questions = s.distinct_questions + CASE WHEN v_question = ANY (s.question_hashes) THEN 0 ELSE 1 END,
      recall_hits = s.recall_hits + CASE WHEN excluded.discovery_provider = 'recall' THEN 1 ELSE 0 END,
      consecutive_recall_failures = 0,
      last_seen_at = now(),
      last_verified_at = now()
    RETURNING s.id, (xmax = 0), s.retention, s.status INTO v_source_id, v_inserted, v_retention, v_status;
    v_sources := v_sources + 1;
    IF v_inserted THEN v_new_sources := v_new_sources + 1; END IF;

    FOR v_finding IN SELECT value FROM jsonb_array_elements(coalesce(v_source->'findings', '[]'::jsonb)) LIMIT 12 LOOP
      INSERT INTO knowledge_findings AS f (source_id, personality_id, passage_hash, kind, locator, excerpt, topic_terms,
        support_level, support_reason, corroboration, times_cited, status)
      VALUES (v_source_id, v_personality, v_finding->>'passage_hash',
        CASE WHEN v_finding->>'kind' = 'deep_harvest' THEN 'deep_harvest' ELSE 'answer_evidence' END,
        nullif(left(v_finding->>'locator', 300), ''),
        CASE WHEN v_retention = 'licensed_excerpt' THEN nullif(left(v_finding->>'excerpt', 600), '') END,
        ARRAY(SELECT DISTINCT left(term, 40) FROM jsonb_array_elements_text(coalesce(v_finding->'topic_terms', '[]'::jsonb)) AS term LIMIT 40),
        nullif(v_finding->>'support_level', ''), nullif(left(v_finding->>'support_reason', 300), ''),
        coalesce((v_finding->>'corroboration')::smallint, 0),
        CASE WHEN (v_finding->>'cited')::boolean THEN 1 ELSE 0 END,
        CASE WHEN v_status = 'rejected' THEN 'rejected' ELSE 'active' END)
      ON CONFLICT (source_id, personality_id, passage_hash) DO UPDATE SET
        kind = CASE WHEN excluded.kind = 'answer_evidence' THEN 'answer_evidence' ELSE f.kind END,
        locator = coalesce(excluded.locator, f.locator),
        excerpt = coalesce(excluded.excerpt, f.excerpt),
        topic_terms = ARRAY(SELECT DISTINCT term FROM unnest(f.topic_terms || excluded.topic_terms) AS term LIMIT 60),
        support_level = CASE
          WHEN 'EXACT' IN (f.support_level, excluded.support_level) THEN 'EXACT'
          WHEN 'STRONG' IN (f.support_level, excluded.support_level) THEN 'STRONG'
          ELSE coalesce(excluded.support_level, f.support_level) END,
        support_reason = coalesce(excluded.support_reason, f.support_reason),
        corroboration = greatest(f.corroboration, excluded.corroboration),
        times_seen = f.times_seen + 1,
        times_cited = f.times_cited + excluded.times_cited,
        last_seen_at = now(),
        last_verified_at = now()
      RETURNING (xmax = 0) INTO v_inserted;
      v_findings := v_findings + 1;
      IF v_inserted THEN v_new_findings := v_new_findings + 1; END IF;
      IF (v_finding->>'cited')::boolean THEN v_cited_findings := v_cited_findings + 1; END IF;
    END LOOP;

    -- A trusted work that answered more than one distinct question, and was cited more
    -- than once, is worth a reviewer's time. Reviewed rows are never reopened here.
    UPDATE knowledge_sources SET status = 'promotion_ready'
      WHERE id = v_source_id AND status = 'active' AND credibility_tier = 'trusted'
        AND distinct_questions >= 2 AND times_cited >= 2;
    IF FOUND THEN v_ready := v_ready + 1; END IF;
  END LOOP;

  -- A remembered source that could not be re-read is tried less, then not at all.
  UPDATE knowledge_sources SET recall_failures = recall_failures + 1,
      consecutive_recall_failures = consecutive_recall_failures + 1
    WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_harvest->'recall_failures', '[]'::jsonb)) LIMIT 10);

  INSERT INTO knowledge_harvest_runs (personality_id, question_hash, providers, sources_seen, findings_seen, new_sources,
    new_findings, cited_findings, recall_attempted, recall_hits, search_saved, duration_ms)
  VALUES (v_personality, v_question,
    ARRAY(SELECT DISTINCT left(value, 40) FROM jsonb_array_elements_text(coalesce(p_harvest->'providers', '[]'::jsonb)) LIMIT 8),
    v_sources, v_findings, v_new_sources, v_new_findings, v_cited_findings,
    coalesce((p_harvest->>'recall_attempted')::integer, 0), coalesce((p_harvest->>'recall_hits')::integer, 0),
    coalesce((p_harvest->>'search_saved')::boolean, false), coalesce((p_harvest->>'duration_ms')::integer, 0))
  RETURNING id INTO v_run;

  RETURN jsonb_build_object('run_id', v_run, 'sources', v_sources, 'findings', v_findings,
    'new_sources', v_new_sources, 'new_findings', v_new_findings, 'promotion_ready', v_ready);
END;
$$;

-- Remembered works for one personality whose findings share topic terms with a new
-- question. Only credible, non-rejected, still-readable works are returned.
CREATE OR REPLACE FUNCTION public.recall_knowledge_sources(p_personality_id uuid, p_terms text[], p_limit integer DEFAULT 3)
RETURNS TABLE (source_id uuid, canonical_url text, title text, domain text, evidence_type text,
  credibility_score smallint, credibility_tier text, matched_terms integer, findings integer)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.canonical_url, s.title, s.domain, s.evidence_type, s.credibility_score, s.credibility_tier,
    max(cardinality(ARRAY(SELECT unnest(f.topic_terms) INTERSECT SELECT unnest(p_terms))))::integer AS matched_terms,
    count(*)::integer AS findings
  FROM knowledge_findings f
  JOIN knowledge_sources s ON s.id = f.source_id
  WHERE f.personality_id = p_personality_id
    AND f.status = 'active'
    AND f.topic_terms && p_terms
    AND s.status <> 'rejected'
    AND s.credibility_tier IN ('trusted', 'credible')
    AND s.consecutive_recall_failures < 3
  GROUP BY s.id
  HAVING max(cardinality(ARRAY(SELECT unnest(f.topic_terms) INTERSECT SELECT unnest(p_terms))))
    >= least(2, cardinality(p_terms))
  ORDER BY matched_terms DESC, s.credibility_score DESC, s.times_cited DESC, s.last_verified_at DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 3), 6));
$$;

-- Prior track record for scoring, in one round trip.
CREATE OR REPLACE FUNCTION public.knowledge_source_track_records(p_work_keys text[])
RETURNS TABLE (work_key text, status text, distinct_questions integer, times_cited integer,
  consecutive_recall_failures integer, question_hashes text[])
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT s.work_key, s.status, s.distinct_questions, s.times_cited, s.consecutive_recall_failures, s.question_hashes
  FROM knowledge_sources s WHERE s.work_key = ANY (p_work_keys[1:60]);
$$;

-- A reviewer's decision. Promotion registers the work as a candidate Library source
-- mapped to every personality it has findings for; approval stays a separate human step.
CREATE OR REPLACE FUNCTION public.review_knowledge_source(p_source_id uuid, p_action text, p_reviewer text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row knowledge_sources%ROWTYPE;
  v_library uuid;
BEGIN
  SELECT * INTO v_row FROM knowledge_sources WHERE id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Harvested source not found' USING ERRCODE = 'P0002'; END IF;

  IF p_action = 'reject' THEN
    UPDATE knowledge_sources SET status = 'rejected', reviewed_at = now(), reviewed_by = left(p_reviewer, 120),
      review_note = left(p_note, 1000) WHERE id = p_source_id;
    UPDATE knowledge_findings SET status = 'rejected' WHERE source_id = p_source_id;
    RETURN jsonb_build_object('status', 'rejected');
  ELSIF p_action = 'restore' THEN
    IF v_row.status <> 'rejected' THEN RAISE EXCEPTION 'Only a rejected source can be restored' USING ERRCODE = '22023'; END IF;
    UPDATE knowledge_sources SET status = 'active', reviewed_at = now(), reviewed_by = left(p_reviewer, 120),
      review_note = left(p_note, 1000) WHERE id = p_source_id;
    UPDATE knowledge_findings SET status = 'active' WHERE source_id = p_source_id;
    RETURN jsonb_build_object('status', 'active');
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
    'searchesSaved30d', (SELECT count(*) FROM knowledge_harvest_runs WHERE search_saved AND created_at > now() - interval '30 days'));
$$;

REVOKE EXECUTE ON FUNCTION public.record_knowledge_harvest(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recall_knowledge_sources(uuid, text[], integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.knowledge_source_track_records(text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_knowledge_source(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.knowledge_harvest_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_knowledge_harvest(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.recall_knowledge_sources(uuid, text[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_source_track_records(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_knowledge_source(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_harvest_snapshot() TO service_role;
