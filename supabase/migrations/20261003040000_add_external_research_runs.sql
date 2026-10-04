create table if not exists public.external_research_runs (
  id uuid primary key default gen_random_uuid(),
  personality_id uuid not null references public.personalities(id) on delete restrict,
  provider text not null,
  status text not null default 'paused' check (status in ('paused','running','stopped','complete')),
  queries jsonb not null,
  next_query_index integer not null default 0,
  max_search_requests integer not null check (max_search_requests between 1 and 100),
  search_calls integer not null default 0,
  cache_hits integer not null default 0,
  candidate_urls integer not null default 0,
  accepted_urls integer not null default 0,
  rejected_urls integer not null default 0,
  pages_fetched integer not null default 0,
  pages_cache_hits integer not null default 0,
  chunks_added integer not null default 0,
  duplicate_urls integer not null default 0,
  saturated_steps integer not null default 0,
  seen_urls jsonb not null default '[]'::jsonb,
  error_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists external_research_runs_personality_idx on public.external_research_runs(personality_id, created_at desc);
alter table public.external_research_runs enable row level security;
revoke all on public.external_research_runs from anon, authenticated;
comment on table public.external_research_runs is 'Server-only bounded web discovery runs. Approval and ingestion remain governed by approved_source_access.';
