alter table public.external_research_runs
  add column if not exists primary_passages integer not null default 0,
  add column if not exists scholarly_sources integer not null default 0,
  add column if not exists exact_claim_links integer not null default 0;
comment on column public.external_research_runs.primary_passages is 'Newly indexed original chunks with exact verse or passage locations during this run.';
comment on column public.external_research_runs.exact_claim_links is 'Current personality-wide approved claims with exact chunk links after the latest coverage recalculation.';
