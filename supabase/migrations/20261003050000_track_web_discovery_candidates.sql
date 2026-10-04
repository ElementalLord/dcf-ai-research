alter table public.external_research_runs
  add column if not exists discovered_candidates jsonb not null default '[]'::jsonb;
comment on column public.external_research_runs.discovered_candidates is 'Candidate URLs and policy decisions only; Brave snippets are excluded.';
