-- Undo the 2026-11-13 upgrade-only epistemics refresh.
-- 348 approved claims were blocked from answers because their claim-type records were never re-evaluated
-- after the 2026-11-10 AI-review transition. They were re-evaluated with the repository's own deterministic
-- classifier and evidence contracts (refreshBlockedEpistemics) and updated only where that made them usable.
-- The prior rows are in corpus_verification_audit.epistemics_refresh_2026_11_13. This restores them exactly.
BEGIN;
UPDATE public.claim_epistemics e SET
  epistemic_type = s.epistemic_type, proposed_type = s.proposed_type, type_origin = s.type_origin,
  type_confidence = s.type_confidence, type_review_status = s.type_review_status, classifier_version = s.classifier_version,
  classification_signals = s.classification_signals, is_compound = s.is_compound, proposition_count = s.proposition_count,
  contract_status = s.contract_status, contract_satisfied = s.contract_satisfied, contract_basis = s.contract_basis,
  contract_version = s.contract_version, contract_detail = s.contract_detail, evaluated_at = s.evaluated_at, updated_at = now()
FROM corpus_verification_audit.epistemics_refresh_2026_11_13 s
WHERE e.claim_id = s.claim_id AND e.contract_detail->>'refreshed' = 'upgrade-only autonomous refresh';
COMMIT;
