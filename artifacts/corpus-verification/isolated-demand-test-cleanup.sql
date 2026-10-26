BEGIN;
DO $$ DECLARE fixture_id uuid; BEGIN
  SELECT id INTO fixture_id FROM public.personalities
  WHERE canonical_name LIKE 'Anika % Sen';
  IF fixture_id IS NULL OR
    (SELECT count(*) FROM public.personalities WHERE canonical_name LIKE 'Anika % Sen') <> 1 OR
    (SELECT count(*) FROM public.claims WHERE personality_id = fixture_id) <> 2
  THEN RAISE EXCEPTION 'unexpected synthetic demand fixture'; END IF;
  DELETE FROM public.demand_research_needs WHERE personality_id = fixture_id;
  DELETE FROM public.external_research_runs WHERE personality_id = fixture_id;
  DELETE FROM public.personalities WHERE id = fixture_id;
  DELETE FROM public.categories WHERE slug = 'local-test-' || fixture_id::text;
  DELETE FROM public.sources WHERE url LIKE 'https://archive.example.org/%';
END $$;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.claims) <> 1585 OR
    EXISTS (SELECT 1 FROM public.personalities WHERE canonical_name LIKE 'Anika % Sen') OR
    EXISTS (SELECT 1 FROM public.sources WHERE url LIKE 'https://archive.example.org/%')
  THEN RAISE EXCEPTION 'synthetic fixture cleanup incomplete'; END IF;
END $$;
COMMIT;
