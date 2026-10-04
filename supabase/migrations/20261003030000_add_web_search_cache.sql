create table if not exists public.web_search_cache (
  provider text not null,
  normalized_query text not null,
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  hit_count integer not null default 0 check (hit_count >= 0),
  primary key (provider, normalized_query)
);
create index if not exists web_search_cache_expiry_idx on public.web_search_cache(expires_at);
alter table public.web_search_cache enable row level security;
revoke all on public.web_search_cache from anon, authenticated;
comment on table public.web_search_cache is 'Server-only discovery metadata; results are never evidence or citation sources.';
