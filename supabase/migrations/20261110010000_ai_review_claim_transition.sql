-- Transition pending claims (draft / needs_review) to approved, recorded as an AI review.
--
-- Scope: a claim is transitioned only when
--   * review_status is 'draft' or 'needs_review' (rejected and approved claims are untouched);
--   * it has no unresolved launch hold (corpus_verification_audit.launch_holds; the
--     prevent_held_claim_approval trigger would refuse those anyway);
--   * at least one linked source is approved, so the claim can be cited.
-- Everything else is left as it is. Preview with the queries at the bottom first.
--
-- The origin is corpus_evidence_review, the origin the earlier AI-assisted corpus
-- review used, so the claims are eligible in strict evidence mode. Each claim keeps
-- an audit trail: approved_by_label 'AI review', approval_metadata.ai_reviewed = true,
-- the approval batch below, and a claim_reviews row. Before values are saved in
-- corpus_verification_audit.ai_review_transition_snapshot; undo with
-- scripts/rollback-ai-review-transition.sql.
BEGIN;

INSERT INTO public.corpus_change_batches (batch_key, purpose, actor, metadata)
VALUES ('ai-review-claim-transition-2026-11-10',
        'Transition pending claims with an approved source to approved (AI review)',
        'AI review',
        '{"approval_origin":"corpus_evidence_review","reviewer_kind":"ai_assisted"}'::jsonb)
ON CONFLICT (batch_key) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS corpus_verification_audit;
CREATE TABLE IF NOT EXISTS corpus_verification_audit.launch_holds (
  claim_id uuid PRIMARY KEY REFERENCES public.claims(id),
  category text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS corpus_verification_audit.ai_review_transition_snapshot (
  claim_id uuid PRIMARY KEY REFERENCES public.claims(id) ON DELETE CASCADE,
  review_status text NOT NULL,
  approval_origin text,
  approval_note text,
  approval_metadata jsonb,
  approval_batch_id uuid,
  approved_at timestamptz,
  approved_by_label text,
  epistemics_reviewer text,
  epistemics_reviewer_kind text,
  epistemics_review_note text,
  epistemics_reviewed_at timestamptz,
  transitioned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TEMP TABLE ai_transition_targets ON COMMIT DROP AS
SELECT c.id
FROM public.claims c
WHERE c.review_status IN ('draft', 'needs_review')
  AND NOT EXISTS (SELECT 1 FROM corpus_verification_audit.launch_holds h WHERE h.claim_id = c.id)
  AND EXISTS (
    SELECT 1 FROM public.claim_sources cs
    JOIN public.sources s ON s.id = cs.source_id
    WHERE cs.claim_id = c.id AND s.source_status = 'approved'
  );

INSERT INTO corpus_verification_audit.ai_review_transition_snapshot (
  claim_id, review_status, approval_origin, approval_note, approval_metadata, approval_batch_id,
  approved_at, approved_by_label, epistemics_reviewer, epistemics_reviewer_kind,
  epistemics_review_note, epistemics_reviewed_at)
SELECT c.id, c.review_status, c.approval_origin, c.approval_note, c.approval_metadata, c.approval_batch_id,
       c.approved_at, c.approved_by_label, e.reviewer, e.reviewer_kind, e.review_note, e.reviewed_at
FROM public.claims c
JOIN ai_transition_targets t ON t.id = c.id
LEFT JOIN public.claim_epistemics e ON e.claim_id = c.id
ON CONFLICT (claim_id) DO NOTHING;

UPDATE public.claims c SET
  review_status = 'approved',
  approval_origin = 'corpus_evidence_review',
  approval_note = 'Approved in the AI review transition; content assessed as sound and linked to an approved source.',
  approval_metadata = coalesce(c.approval_metadata, '{}'::jsonb)
    || '{"ai_reviewed": true, "transition": "ai-review-claim-transition-2026-11-10"}'::jsonb,
  approval_batch_id = (SELECT id FROM public.corpus_change_batches WHERE batch_key = 'ai-review-claim-transition-2026-11-10'),
  approved_at = now(),
  approved_by_label = 'AI review',
  updated_at = now()
FROM ai_transition_targets t
WHERE t.id = c.id;

UPDATE public.claim_epistemics e SET
  reviewer = 'AI review',
  reviewer_kind = 'ai_assisted',
  review_note = 'Claim approved in the AI review transition (2026-11-10).',
  reviewed_at = now(),
  updated_at = now()
FROM ai_transition_targets t
WHERE t.id = e.claim_id
  AND coalesce(e.reviewer_kind, 'ai_assisted') = 'ai_assisted';  -- never overwrite a human or mentor review

-- The 2026-10-20 retrieval gate deactivated passages whose only claims were pending.
-- Reactivate the passages linked to the claims approved here (held passages stay off).
CREATE TABLE IF NOT EXISTS corpus_verification_audit.ai_review_transition_chunks (
  chunk_id uuid PRIMARY KEY REFERENCES public.source_chunks(id) ON DELETE CASCADE,
  transitioned_at timestamptz NOT NULL DEFAULT now()
);
WITH reactivated AS (
  UPDATE public.source_chunks sc SET is_active = true
  WHERE sc.is_active = false
    AND EXISTS (SELECT 1 FROM public.claim_chunks cc JOIN ai_transition_targets t ON t.id = cc.claim_id
                WHERE cc.chunk_id = sc.id)
    AND NOT EXISTS (SELECT 1 FROM public.claim_chunks cc
                    JOIN corpus_verification_audit.launch_holds h ON h.claim_id = cc.claim_id
                    WHERE cc.chunk_id = sc.id)
  RETURNING sc.id
)
INSERT INTO corpus_verification_audit.ai_review_transition_chunks (chunk_id)
SELECT id FROM reactivated ON CONFLICT (chunk_id) DO NOTHING;

-- Cached answers were built from the smaller approved set.
TRUNCATE public.answer_cache;

INSERT INTO public.claim_reviews (claim_id, reviewer_name, decision, notes)
SELECT t.id, 'AI review', 'approved', 'AI review transition (2026-11-10): pending claim with an approved source.'
FROM ai_transition_targets t;

DO $$
DECLARE moved integer; still_pending integer;
BEGIN
  SELECT count(*) INTO moved FROM ai_transition_targets;
  SELECT count(*) INTO still_pending FROM public.claims WHERE review_status IN ('draft', 'needs_review');
  RAISE NOTICE 'AI review transition: % claims approved; % claims still pending (launch hold or no approved source).',
    moved, still_pending;
END $$;

COMMIT;

-- Preview (run on its own before applying; read-only):
--
-- SELECT
--   count(*) FILTER (WHERE eligible)                    AS will_approve,
--   count(*) FILTER (WHERE held)                        AS skipped_launch_hold,
--   count(*) FILTER (WHERE NOT held AND NOT has_source) AS skipped_no_approved_source
-- FROM (
--   SELECT
--     EXISTS (SELECT 1 FROM corpus_verification_audit.launch_holds h WHERE h.claim_id = c.id) AS held,
--     EXISTS (SELECT 1 FROM public.claim_sources cs JOIN public.sources s ON s.id = cs.source_id
--             WHERE cs.claim_id = c.id AND s.source_status = 'approved') AS has_source,
--     NOT EXISTS (SELECT 1 FROM corpus_verification_audit.launch_holds h WHERE h.claim_id = c.id)
--       AND EXISTS (SELECT 1 FROM public.claim_sources cs JOIN public.sources s ON s.id = cs.source_id
--                   WHERE cs.claim_id = c.id AND s.source_status = 'approved') AS eligible
--   FROM public.claims c
--   WHERE c.review_status IN ('draft', 'needs_review')
-- ) x;
