-- Human-readable audit state for request-scoped source discovery. These fields do
-- not approve a source for the permanent Library.
alter table public.discovered_search_sources
  add column if not exists authority_level text check (authority_level in ('authoritative', 'credible_secondary', 'general_web')),
  add column if not exists authority_reason text,
  add column if not exists evidence_type text,
  add column if not exists accessibility text not null default 'unreadable' check (accessibility in ('readable', 'bibliographic_only', 'unreadable')),
  add column if not exists admission_status text not null default 'discovered' check (admission_status in ('discovered', 'admitted', 'rejected')),
  add column if not exists match_reason text,
  add column if not exists usable_evidence boolean not null default false,
  add column if not exists work_key text;

comment on column public.discovered_search_sources.accessibility is 'Whether DCF read the original source; bibliographic_only means metadata/search discovery only.';
comment on column public.discovered_search_sources.admission_status is 'Request-scoped evidence admission state, never permanent Library approval.';
comment on column public.discovered_search_sources.work_key is 'Best-effort bibliographic family key used to avoid treating mirrors as independent works.';
