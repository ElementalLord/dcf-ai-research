-- Citation-first evidence completion: the missing-evidence queue, the admin document cache,
-- and the relationship between a cited source and the access copy that actually supplied its passage.

create table if not exists public.evidence_requirements (
  id uuid primary key default gen_random_uuid(),
  personality_id uuid not null references public.personalities(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete cascade,
  claim_source_id uuid not null references public.claim_sources(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  location_key text not null,
  locator_raw text,
  locator jsonb not null default '{}'::jsonb,
  locator_kind text not null check (locator_kind in ('canonical', 'page', 'doi', 'section', 'note')),
  work_title text,
  parameter_field_id uuid references public.parameter_fields(id) on delete set null,
  certainty text,
  support_level text not null check (support_level in ('NONE', 'PARTIAL', 'STRONG')),
  source_availability text not null,
  priority numeric not null default 0,
  status text not null default 'open' check (status in (
    'open', 'linked_exact', 'linked_strong', 'linked_partial', 'unresolved', 'inaccessible', 'not_addressable')),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  resolution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (claim_source_id)
);
create index if not exists evidence_requirements_queue_idx on public.evidence_requirements(personality_id, status, priority desc);
create index if not exists evidence_requirements_location_idx on public.evidence_requirements(personality_id, location_key);

-- Large documents are downloaded once by corpus administration, never by Ask.
create table if not exists public.corpus_documents (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  final_url text,
  source_id uuid references public.sources(id) on delete set null,
  sha256 text,
  sha1 text,
  byte_size bigint,
  content_type text,
  cache_path text,
  page_count integer,
  text_layer text not null default 'unknown' check (text_layer in ('present', 'absent', 'unknown')),
  status text not null check (status in ('ready', 'failed')),
  error text,
  metadata jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

-- A URL is an access copy, not a work. This records which copy supplied a cited source's passage.
create table if not exists public.source_access_copies (
  id uuid primary key default gen_random_uuid(),
  original_source_id uuid not null references public.sources(id) on delete cascade,
  access_source_id uuid not null references public.sources(id) on delete cascade,
  relation text not null check (relation in (
    'identical_document', 'same_catalogue_record', 'same_work_alternate_edition', 'same_work_sibling_page')),
  underlying_work text,
  edition_note text,
  verification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (original_source_id, access_source_id)
);

alter table public.evidence_requirements enable row level security;
alter table public.corpus_documents enable row level security;
alter table public.source_access_copies enable row level security;

alter table public.sources drop constraint if exists sources_approval_origin_check;
alter table public.sources add constraint sources_approval_origin_check
  check (approval_origin in ('human_manual', 'mentor_review', 'system_test_bulk', 'imported_existing', 'ai_candidate', 'verified_auto', 'citation_alternate'));
alter table public.approved_source_access drop constraint if exists approved_source_access_approval_origin_check;
alter table public.approved_source_access add constraint approved_source_access_approval_origin_check
  check (approval_origin in ('human_manual', 'mentor_review', 'system_test_bulk', 'imported_existing', 'ai_candidate', 'verified_auto', 'citation_alternate'));

comment on table public.evidence_requirements is 'Approved claims lacking EXACT passage support, keyed by their own citation; drives citation-first acquisition.';
comment on table public.source_access_copies is 'Original cited source → access copy that supplied the passage, with how identity was verified.';
