alter table public.research_candidates
  add column if not exists relevant_parameters text[] not null default '{}';
comment on column public.research_candidates.relevant_parameters is 'Search-gap parameter codes that led to this candidate; not a claim that its content proves the parameter.';
