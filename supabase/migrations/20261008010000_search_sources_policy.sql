-- Search permissions are separate from permanent Library source approval.
create table public.search_policy (
  id boolean primary key default true check (id),
  mode text not null default 'credible_web' check (mode in ('credible_web', 'approved_domains_only', 'custom')),
  updated_at timestamptz not null default now()
);
insert into public.search_policy (id, mode) values (true, 'credible_web');

create table public.search_source_rules (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  display_name text not null,
  status text not null check (status in ('allowed', 'blocked', 'disabled')),
  category text not null default 'other',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  check (domain = lower(domain) and domain ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$')
);

create table public.discovered_search_sources (
  domain text primary key,
  example_url text not null,
  display_name text not null,
  category text not null default 'other',
  state text not null default 'new' check (state in ('new', 'ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count integer not null default 1
);

alter table public.search_policy enable row level security;
alter table public.search_source_rules enable row level security;
alter table public.discovered_search_sources enable row level security;
comment on table public.search_source_rules is 'Admin search-domain decisions, independent of permanent source and claim approval.';
comment on table public.discovered_search_sources is 'Request-scoped Ask discovery candidates; never approved Library records.';
