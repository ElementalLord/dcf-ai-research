alter table public.external_research_runs
  add column if not exists query_reports jsonb not null default '[]'::jsonb,
  add column if not exists strategy_performance jsonb not null default '{}'::jsonb,
  add column if not exists integration_report jsonb not null default '{}'::jsonb;
comment on column public.external_research_runs.query_reports is 'Per-query discovery, source, passage and provenance yield; cache hits and paid calls are separate.';
