-- Remove the claims still pending after 20261110010000_ai_review_claim_transition
-- (94 on launch hold, 7 citing unapproved sources) and the unapproved sources that
-- only those claims used (4 candidate, 1 rejected). Approved sources are kept, even
-- when they now back no claims. Every personality keeps its approved sources.
-- Everything deleted is copied first into schema removed_unconfirmed_2026_11_10.
BEGIN;

CREATE SCHEMA IF NOT EXISTS removed_unconfirmed_2026_11_10;
CREATE TABLE removed_unconfirmed_2026_11_10.claims AS
  SELECT * FROM public.claims WHERE review_status IN ('draft','needs_review');
CREATE TABLE removed_unconfirmed_2026_11_10.sources AS
  SELECT s.* FROM public.sources s
  WHERE s.source_status <> 'approved'
    AND EXISTS (SELECT 1 FROM public.claim_sources cs JOIN removed_unconfirmed_2026_11_10.claims c ON c.id = cs.claim_id WHERE cs.source_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM public.claim_sources cs JOIN public.claims c ON c.id = cs.claim_id WHERE cs.source_id = s.id AND c.review_status = 'approved');
CREATE TABLE removed_unconfirmed_2026_11_10.claim_sources AS
  SELECT * FROM public.claim_sources WHERE claim_id IN (SELECT id FROM removed_unconfirmed_2026_11_10.claims)
     OR source_id IN (SELECT id FROM removed_unconfirmed_2026_11_10.sources);
CREATE TABLE removed_unconfirmed_2026_11_10.claim_chunks AS
  SELECT * FROM public.claim_chunks WHERE claim_id IN (SELECT id FROM removed_unconfirmed_2026_11_10.claims);
CREATE TABLE removed_unconfirmed_2026_11_10.claim_epistemics AS
  SELECT * FROM public.claim_epistemics WHERE claim_id IN (SELECT id FROM removed_unconfirmed_2026_11_10.claims);
CREATE TABLE removed_unconfirmed_2026_11_10.claim_reviews AS
  SELECT * FROM public.claim_reviews WHERE claim_id IN (SELECT id FROM removed_unconfirmed_2026_11_10.claims);
CREATE TABLE removed_unconfirmed_2026_11_10.launch_holds AS
  SELECT * FROM corpus_verification_audit.launch_holds WHERE claim_id IN (SELECT id FROM removed_unconfirmed_2026_11_10.claims);
CREATE TABLE removed_unconfirmed_2026_11_10.source_chunks AS
  SELECT * FROM public.source_chunks WHERE source_id IN (SELECT id FROM removed_unconfirmed_2026_11_10.sources);
CREATE TABLE removed_unconfirmed_2026_11_10.source_personalities AS
  SELECT * FROM public.source_personalities WHERE source_id IN (SELECT id FROM removed_unconfirmed_2026_11_10.sources);

DELETE FROM corpus_verification_audit.launch_holds WHERE claim_id IN (SELECT id FROM removed_unconfirmed_2026_11_10.claims);
DELETE FROM public.claims WHERE id IN (SELECT id FROM removed_unconfirmed_2026_11_10.claims);
DELETE FROM public.sources WHERE id IN (SELECT id FROM removed_unconfirmed_2026_11_10.sources);
TRUNCATE public.answer_cache;

COMMIT;
