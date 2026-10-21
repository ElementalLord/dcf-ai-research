-- Distinct provenance for individually assessed historical-corpus decisions.
-- This does not approve any claim; application requires the separate, guarded
-- decision ledger and source-passage review.
alter table public.claims drop constraint if exists claims_approval_origin_check;
alter table public.claims add constraint claims_approval_origin_check check (approval_origin in
  ('human_manual','mentor_review','system_test_bulk','imported_existing','ai_candidate',
   'automated_evidence_verification','corpus_evidence_review'));
comment on column public.claims.approval_origin is
  'corpus_evidence_review denotes an individually assessed historical claim; automatic demand admission remains automated_evidence_verification.';
