create table if not exists public.answer_cache (
  id text primary key,
  personality_scope uuid[] not null,
  normalized_question text not null,
  evidence_signature text not null,
  policy_mode text not null,
  answer_text text not null,
  provider text not null,
  model text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_accessed_at timestamptz,
  hit_count bigint not null default 0
);
alter table public.answer_cache enable row level security;
revoke all on public.answer_cache from anon, authenticated;
grant all on public.answer_cache to service_role;
create index if not exists answer_cache_expiry on public.answer_cache(expires_at);
create or replace function public.touch_answer_cache(cache_id text) returns void
language sql set search_path = public as $$
  update answer_cache set hit_count = hit_count + 1, last_accessed_at = now() where id = cache_id;
$$;
revoke all on function public.touch_answer_cache(text) from public, anon, authenticated;
grant execute on function public.touch_answer_cache(text) to service_role;

create table if not exists public.ai_work_checkpoints (
  id text primary key,
  operation text not null,
  status text not null check (status in ('pending','processing','complete','failed_quota','failed_transient','failed_permanent')),
  payload jsonb,
  error_category text,
  updated_at timestamptz not null default now()
);
alter table public.ai_work_checkpoints enable row level security;
revoke all on public.ai_work_checkpoints from anon, authenticated;
grant all on public.ai_work_checkpoints to service_role;
