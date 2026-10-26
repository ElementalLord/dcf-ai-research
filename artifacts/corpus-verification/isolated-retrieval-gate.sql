-- Local isolated Supabase only. Preserve the baseline, then remove unreviewed
-- passages and stale answer caches from active public retrieval.
BEGIN;
CREATE TABLE IF NOT EXISTS corpus_verification_audit.original_source_chunks AS SELECT * FROM public.source_chunks;
CREATE TABLE IF NOT EXISTS corpus_verification_audit.original_answer_cache AS SELECT * FROM public.answer_cache;
CREATE TABLE IF NOT EXISTS corpus_verification_audit.original_live_research_cache AS SELECT * FROM public.live_research_cache;
CREATE TABLE IF NOT EXISTS corpus_verification_audit.original_web_search_cache AS SELECT * FROM public.web_search_cache;
UPDATE public.source_chunks sc SET is_active = false
WHERE NOT EXISTS (
  SELECT 1 FROM public.claim_chunks cc
  JOIN public.claims c ON c.id = cc.claim_id
  WHERE cc.chunk_id = sc.id AND c.review_status = 'approved'
    AND c.approval_origin = 'corpus_evidence_review'
);
TRUNCATE public.answer_cache, public.live_research_cache, public.web_search_cache;
COMMIT;
