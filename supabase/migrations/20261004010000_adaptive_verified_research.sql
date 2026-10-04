-- Discovery records are audit data, never evidence. Existing RLS remains server-only.
create table if not exists public.research_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.external_research_runs(id) on delete set null,
  candidate_url text not null,
  canonical_url text not null,
  domain text not null,
  title text,
  author text,
  editor text,
  translator text,
  institution text,
  publisher text,
  journal text,
  publication_year text,
  doi text,
  isbn text,
  edition text,
  work_title text,
  source_family text,
  source_type text,
  textual_layer text,
  full_text_status text,
  independent_work_key text,
  credibility_signals jsonb not null default '[]'::jsonb,
  credibility_failures jsonb not null default '[]'::jsonb,
  verification_status text not null default 'DISCOVERED',
  verification_reason text,
  approval_origin text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, canonical_url)
);
create index if not exists research_candidates_family_idx on public.research_candidates(domain, source_family, verification_status);
alter table public.research_candidates enable row level security;
revoke all on public.research_candidates from anon, authenticated;

create table if not exists public.verified_source_families (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  path_prefix text not null,
  institution text not null,
  project_label text not null,
  supporting_urls jsonb not null,
  verified_at timestamptz not null default now(),
  unique (domain, path_prefix)
);
alter table public.verified_source_families enable row level security;
revoke all on public.verified_source_families from anon, authenticated;
comment on table public.verified_source_families is 'Institution verification inheritance only. Each child work still needs separate evidence verification and exact URL approval.';

alter table public.external_research_runs
  add column if not exists mode text not null default 'guided',
  add column if not exists stop_reason text,
  add column if not exists round_reports jsonb not null default '[]'::jsonb,
  add column if not exists depth_report jsonb not null default '{}'::jsonb,
  add column if not exists verified_sources integer not null default 0,
  add column if not exists bibliographic_sources integer not null default 0,
  add column if not exists independent_works integer not null default 0;

alter table public.sources drop constraint if exists sources_approval_origin_check;
alter table public.sources add constraint sources_approval_origin_check
  check (approval_origin in ('human_manual', 'mentor_review', 'system_test_bulk', 'imported_existing', 'ai_candidate', 'verified_auto'));
alter table public.approved_source_access drop constraint if exists approved_source_access_approval_origin_check;
alter table public.approved_source_access add constraint approved_source_access_approval_origin_check
  check (approval_origin in ('human_manual', 'mentor_review', 'system_test_bulk', 'imported_existing', 'ai_candidate', 'verified_auto'));

comment on table public.research_candidates is 'Untrusted Brave discoveries and explicit verification outcomes; never used for retrieval or citation.';
