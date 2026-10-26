BEGIN;
ALTER TABLE corpus_verification_audit.publication_holds
  ADD COLUMN IF NOT EXISTS resolution_status text NOT NULL DEFAULT 'quarantined';
ALTER TABLE corpus_verification_audit.publication_holds
  ADD COLUMN IF NOT EXISTS resolution_note text;
ALTER TABLE corpus_verification_audit.publication_holds
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

DO $$ BEGIN
  IF (SELECT count(*) FROM public.claims WHERE id IN
    ('61e944ef-a848-4865-b28b-7ab1b56dc7eb', '0d6e0dc3-6b43-453e-b1f3-8b8abf08e8ab')
    AND review_status = 'needs_review' AND approval_origin = 'corpus_evidence_review') <> 2
  THEN RAISE EXCEPTION 'Academy citation repair baseline mismatch'; END IF;
  IF (SELECT count(*) FROM public.claim_sources WHERE claim_id IN
    ('61e944ef-a848-4865-b28b-7ab1b56dc7eb', '0d6e0dc3-6b43-453e-b1f3-8b8abf08e8ab')
    AND source_id = '119d6b37-13d5-4af9-8f21-ad2252084141') <> 2
  THEN RAISE EXCEPTION 'Academy source relationship missing'; END IF;
END $$;

UPDATE public.claim_sources
SET page_or_section = '1991 (64th), Honorary Award, Satyajit Ray',
    evidence_excerpt = 'To Satyajit Ray, in recognition of his rare mastery of the art of motion pictures, and of his profound humanitarian outlook, which has had an indelible influence on filmmakers and audiences throughout the world.'
WHERE claim_id IN ('61e944ef-a848-4865-b28b-7ab1b56dc7eb', '0d6e0dc3-6b43-453e-b1f3-8b8abf08e8ab')
  AND source_id = '119d6b37-13d5-4af9-8f21-ad2252084141';

UPDATE public.claims
SET review_status = 'approved',
    approval_note = 'Existing Academy awards-database source relationship checked against its Satyajit Ray Honorary Award citation; 64th ceremony year confirmed on Academy 1992 ceremony page.'
WHERE id IN ('61e944ef-a848-4865-b28b-7ab1b56dc7eb', '0d6e0dc3-6b43-453e-b1f3-8b8abf08e8ab');

UPDATE corpus_verification_audit.publication_holds
SET resolution_status = 'repaired',
    resolution_note = 'Original Academy awards database directly names Ray and gives the Honorary Award citation. Academy 64th ceremony page establishes the 1992 ceremony year. Existing claim-source relationship retained; excerpt replaced with exact supporting passage.',
    resolved_at = now()
WHERE claim_id IN ('61e944ef-a848-4865-b28b-7ab1b56dc7eb', '0d6e0dc3-6b43-453e-b1f3-8b8abf08e8ab');

UPDATE public.source_chunks sc
SET is_active = EXISTS (
  SELECT 1 FROM public.claim_chunks cc JOIN public.claims c ON c.id = cc.claim_id
  WHERE cc.chunk_id = sc.id AND c.review_status = 'approved'
    AND c.approval_origin = 'corpus_evidence_review'
);
TRUNCATE public.answer_cache, public.live_research_cache, public.web_search_cache;

DO $$ BEGIN
  IF (SELECT count(*) FROM public.claims WHERE review_status = 'approved' AND approval_origin = 'corpus_evidence_review') <> 271
    OR (SELECT count(*) FROM corpus_verification_audit.publication_holds WHERE resolution_status = 'quarantined') <> 44
  THEN RAISE EXCEPTION 'Academy citation repair postcondition mismatch'; END IF;
END $$;
COMMIT;
