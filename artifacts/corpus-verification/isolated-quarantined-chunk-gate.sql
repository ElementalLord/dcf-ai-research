BEGIN;
UPDATE public.source_chunks sc
SET is_active = false
WHERE EXISTS (
  SELECT 1 FROM public.claim_chunks cc
  JOIN corpus_verification_audit.publication_holds h ON h.claim_id = cc.claim_id
  WHERE cc.chunk_id = sc.id AND h.resolution_status = 'quarantined'
);
TRUNCATE public.answer_cache, public.live_research_cache, public.web_search_cache;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM corpus_verification_audit.publication_holds h
    JOIN public.claim_chunks cc ON cc.claim_id = h.claim_id
    JOIN public.source_chunks sc ON sc.id = cc.chunk_id
    WHERE h.resolution_status = 'quarantined' AND sc.is_active
  ) THEN RAISE EXCEPTION 'quarantined source chunk still active'; END IF;
END $$;
COMMIT;
