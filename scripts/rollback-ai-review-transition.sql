-- Undo supabase/migrations/20261110010000_ai_review_claim_transition.sql.
-- Restores each transitioned claim (and its epistemics reviewer fields) from the
-- snapshot, deactivates the passages that transition reactivated, and removes its
-- claim_reviews rows. Claims edited again after the transition are restored too,
-- so run this before any further review work on them.
BEGIN;

UPDATE public.claims c SET
  review_status = s.review_status,
  approval_origin = s.approval_origin,
  approval_note = s.approval_note,
  approval_metadata = s.approval_metadata,
  approval_batch_id = s.approval_batch_id,
  approved_at = s.approved_at,
  approved_by_label = s.approved_by_label,
  updated_at = now()
FROM corpus_verification_audit.ai_review_transition_snapshot s
WHERE s.claim_id = c.id;

UPDATE public.claim_epistemics e SET
  reviewer = s.epistemics_reviewer,
  reviewer_kind = s.epistemics_reviewer_kind,
  review_note = s.epistemics_review_note,
  reviewed_at = s.epistemics_reviewed_at,
  updated_at = now()
FROM corpus_verification_audit.ai_review_transition_snapshot s
WHERE s.claim_id = e.claim_id AND e.reviewer = 'AI review';

UPDATE public.source_chunks sc SET is_active = false
FROM corpus_verification_audit.ai_review_transition_chunks t
WHERE t.chunk_id = sc.id;

DELETE FROM public.claim_reviews r
USING corpus_verification_audit.ai_review_transition_snapshot s
WHERE r.claim_id = s.claim_id AND r.reviewer_name = 'AI review'
  AND r.notes LIKE 'AI review transition (2026-11-10)%';

TRUNCATE public.answer_cache;
DROP TABLE corpus_verification_audit.ai_review_transition_chunks;
DROP TABLE corpus_verification_audit.ai_review_transition_snapshot;

COMMIT;
