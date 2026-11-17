-- Explore settings for people added through Resources → People.
-- The 25 Phase 1 profiles keep coming from the curated export; this column only describes people added
-- later: which Explore group they belong to, how their era and region read, the Wikipedia article that
-- supplies their portrait, optional reading angles, and whether the profile is published.
-- A null value means the person has no Explore settings and is not shown there.
alter table public.personalities add column if not exists explore_profile jsonb;

comment on column public.personalities.explore_profile is
  'Explore presentation settings for people added after Phase 1: {published, group, shortName, era, region, wikipediaTitle, angles, publishedAt}. Null = not on Explore.';
