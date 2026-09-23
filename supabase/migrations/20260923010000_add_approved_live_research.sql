create table if not exists public.approved_source_access (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  domain text not null,
  scope_type text not null,
  allowed_path_prefix text,
  exact_url text,
  include_subdomains boolean not null default false,
  allow_live_search boolean not null default false,
  allow_live_fetch boolean not null default false,
  allow_ingestion boolean not null default false,
  evidence_use_status text not null default 'candidate',
  priority integer not null default 100,
  default_textual_layer text,
  default_source_type text,
  cache_ttl_hours integer not null default 168,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope_type in ('DOMAIN', 'PATH_PREFIX', 'EXACT_URL')),
  check (evidence_use_status in ('candidate', 'approved', 'rejected')),
  check (cache_ttl_hours between 1 and 8760),
  check (priority between 0 and 10000),
  check (domain = lower(domain)),
  check (domain !~ '[/@:?#]'),
  check (
    (scope_type = 'DOMAIN' and allowed_path_prefix is null and exact_url is null) or
    (scope_type = 'PATH_PREFIX' and allowed_path_prefix is not null and exact_url is null) or
    (scope_type = 'EXACT_URL' and exact_url is not null)
  )
);

create unique index if not exists approved_source_access_scope_unique
  on public.approved_source_access (
    domain,
    scope_type,
    coalesce(allowed_path_prefix, ''),
    coalesce(exact_url, '')
  );
create index if not exists approved_source_access_lookup_idx
  on public.approved_source_access (domain, is_active, priority);

create table if not exists public.live_research_cache (
  id uuid primary key default gen_random_uuid(),
  access_id uuid not null references public.approved_source_access(id) on delete restrict,
  source_id uuid references public.sources(id) on delete set null,
  requested_url text not null,
  final_url text not null,
  canonical_url text not null unique,
  title text,
  etag text,
  last_modified text,
  content_hash text,
  retrieved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_accessed_at timestamptz not null default now(),
  hit_count integer not null default 0,
  http_status integer,
  content_type text,
  extracted_text text,
  fetch_status text not null default 'ready',
  fetch_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(extracted_text, '')), 'B')
  ) stored,
  check (fetch_status in ('ready', 'failed', 'not_modified')),
  check (hit_count >= 0)
);

create index if not exists live_research_cache_expiry_idx
  on public.live_research_cache (expires_at, fetch_status);
create index if not exists live_research_cache_source_idx
  on public.live_research_cache (source_id) where source_id is not null;
create index if not exists live_research_cache_search_idx
  on public.live_research_cache using gin(search_document);

drop trigger if exists approved_source_access_set_updated_at on public.approved_source_access;
create trigger approved_source_access_set_updated_at
before update on public.approved_source_access
for each row execute function public.set_updated_at();

drop trigger if exists live_research_cache_set_updated_at on public.live_research_cache;
create trigger live_research_cache_set_updated_at
before update on public.live_research_cache
for each row execute function public.set_updated_at();

alter table public.approved_source_access enable row level security;
alter table public.live_research_cache enable row level security;

revoke all on public.approved_source_access from anon, authenticated;
revoke all on public.live_research_cache from anon, authenticated;

comment on table public.approved_source_access is
  'Server-only network authorization. evidence_use_status is distinct from sources.source_status and claims.review_status.';
comment on table public.live_research_cache is
  'Bounded cache for content fetched through approved_source_access. Useful passages are also chunked into source_chunks.';
