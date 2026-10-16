-- Versioned, reproducible quality evaluations. Additive only; this migration does not
-- alter claims, source approvals, review decisions, or existing evidence.
create table if not exists public.quality_evaluation_suites (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  description text not null,
  question_count integer not null check (question_count > 0),
  dataset_sha256 text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.quality_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.quality_evaluation_suites(id) on delete restrict,
  mode text not null check (mode in ('static', 'local_pipeline', 'provider_capped')),
  configuration jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  question_limit integer not null check (question_limit > 0),
  external_search_cap integer not null default 0 check (external_search_cap >= 0),
  model_call_cap integer not null default 0 check (model_call_cap >= 0),
  notes text
);

create table if not exists public.quality_evaluation_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.quality_evaluation_runs(id) on delete cascade,
  personality_id uuid not null references public.personalities(id) on delete cascade,
  question_key text not null,
  outcome text not null check (outcome in ('answered', 'qualified', 'declined', 'error', 'not_run')),
  passed boolean not null default false,
  citation_valid boolean not null default false,
  citation_supported boolean not null default false,
  retrieval_sufficient boolean not null default false,
  factual_accuracy text not null default 'not_model_graded' check (factual_accuracy in ('pass', 'fail', 'needs_human_review', 'not_model_graded')),
  failure_reasons text[] not null default '{}',
  response jsonb not null default '{}'::jsonb,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  token_usage integer check (token_usage is null or token_usage >= 0),
  external_search_calls integer not null default 0 check (external_search_calls >= 0),
  model_calls integer not null default 0 check (model_calls >= 0),
  created_at timestamptz not null default now(),
  unique (run_id, question_key)
);

create index if not exists quality_evaluation_results_personality_idx on public.quality_evaluation_results(personality_id, created_at desc);
alter table public.quality_evaluation_suites enable row level security;
alter table public.quality_evaluation_runs enable row level security;
alter table public.quality_evaluation_results enable row level security;
