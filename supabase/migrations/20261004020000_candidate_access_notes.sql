alter table public.research_candidates
  add column if not exists access_notes text;
comment on column public.research_candidates.access_notes is 'Original-page license or access statement; may be null when unavailable.';
