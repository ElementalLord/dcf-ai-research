-- Use only after pausing demand research and rolling back the application.
-- Restores the original public claim and passage records from the guarded
-- snapshot made by 20261020010000. Demand audit tables remain intact.
BEGIN;

DO $$ BEGIN
  IF (SELECT count(*) FROM corpus_verification_audit.original_claims) <> 1585
     OR (SELECT count(*) FROM corpus_verification_audit.original_sources) <> 473
     OR (SELECT count(*) FROM corpus_verification_audit.original_source_chunks) <> 2854
     OR (SELECT count(*) FROM public.claims) <> 1585
     OR (SELECT count(*) FROM public.sources) <> 473
  THEN RAISE EXCEPTION 'rollback guard failed: unexpected original or current row counts';
  END IF;
END $$;

UPDATE public.demand_budget_policy
SET research_paused=true, auto_admission_paused=true, updated_at=now()
WHERE id=true;

DROP TRIGGER IF EXISTS prevent_held_claim_approval ON public.claims;
DROP TRIGGER IF EXISTS prevent_held_chunk_activation ON public.source_chunks;

UPDATE public.claims c SET
  personality_id=o.personality_id, parameter_field_id=o.parameter_field_id,
  claim_text=o.claim_text, claim_kind=o.claim_kind, certainty=o.certainty,
  review_status=o.review_status, researcher_notes=o.researcher_notes,
  created_at=o.created_at, updated_at=o.updated_at,
  approval_metadata=o.approval_metadata, approval_origin=o.approval_origin,
  approval_batch_id=o.approval_batch_id, approval_note=o.approval_note,
  approved_at=o.approved_at, approved_by_label=o.approved_by_label,
  evidence_type=o.evidence_type, parent_claim_id=o.parent_claim_id
FROM corpus_verification_audit.original_claims o WHERE c.id=o.id;

UPDATE public.claim_epistemics e SET
  personality_id=o.personality_id, epistemic_type=o.epistemic_type,
  proposed_type=o.proposed_type, type_origin=o.type_origin,
  type_confidence=o.type_confidence, type_review_status=o.type_review_status,
  classifier_version=o.classifier_version,
  classification_signals=o.classification_signals,
  is_compound=o.is_compound, proposition_count=o.proposition_count,
  contract_status=o.contract_status, contract_satisfied=o.contract_satisfied,
  contract_basis=o.contract_basis, contract_version=o.contract_version,
  contract_detail=o.contract_detail, evaluated_at=o.evaluated_at,
  reviewer=o.reviewer, reviewer_kind=o.reviewer_kind,
  review_note=o.review_note, reviewed_at=o.reviewed_at,
  created_at=o.created_at, updated_at=o.updated_at
FROM corpus_verification_audit.original_claim_epistemics o
WHERE e.claim_id=o.claim_id;

DELETE FROM public.claim_sources cs USING corpus_verification_audit.original_claims o
WHERE cs.claim_id=o.id;
INSERT INTO public.claim_sources SELECT * FROM corpus_verification_audit.original_claim_sources;

DELETE FROM public.claim_chunks cc USING corpus_verification_audit.original_claims o
WHERE cc.claim_id=o.id;
INSERT INTO public.claim_chunks SELECT * FROM corpus_verification_audit.original_claim_chunks;

UPDATE public.source_chunks sc SET is_active=o.is_active
FROM corpus_verification_audit.original_source_chunks o WHERE sc.id=o.id;

TRUNCATE public.answer_cache, public.live_research_cache, public.web_search_cache;

DO $$ BEGIN
  IF (SELECT md5(string_agg(id::text||E'\t'||claim_text||E'\t'||review_status||E'\t'||coalesce(approval_origin,''),E'\n' order by id)) FROM public.claims)
     <> (SELECT md5(string_agg(id::text||E'\t'||claim_text||E'\t'||review_status||E'\t'||coalesce(approval_origin,''),E'\n' order by id)) FROM corpus_verification_audit.original_claims)
     OR (SELECT count(*) FROM public.claim_sources) <> (SELECT count(*) FROM corpus_verification_audit.original_claim_sources)
     OR (SELECT count(*) FROM public.claim_chunks) <> (SELECT count(*) FROM corpus_verification_audit.original_claim_chunks)
     OR EXISTS (SELECT 1 FROM public.source_chunks sc JOIN corpus_verification_audit.original_source_chunks o ON o.id=sc.id WHERE sc.is_active IS DISTINCT FROM o.is_active)
  THEN RAISE EXCEPTION 'rollback verification failed';
  END IF;
END $$;

COMMIT;
