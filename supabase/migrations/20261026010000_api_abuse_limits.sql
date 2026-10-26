-- Shared, atomic limits for public endpoints and outbound paid providers.
create table public.api_rate_policies (
  action text not null,
  scope text not null check (scope in ('actor', 'global')),
  window_seconds integer not null check (window_seconds between 1 and 2592000),
  max_count integer not null check (max_count > 0),
  primary key (action, scope, window_seconds)
);
create table public.api_rate_counters (
  action text not null,
  scope text not null,
  subject text not null,
  window_seconds integer not null,
  window_start timestamptz not null,
  count integer not null check (count > 0),
  primary key (action, scope, subject, window_seconds, window_start)
);
create index api_rate_counters_expiry_idx on public.api_rate_counters(window_start);
alter table public.api_rate_policies enable row level security;
alter table public.api_rate_counters enable row level security;
revoke all on public.api_rate_policies, public.api_rate_counters from public, anon, authenticated;
grant select on public.api_rate_policies to service_role;
grant select, insert, update, delete on public.api_rate_counters to service_role;

insert into public.api_rate_policies(action, scope, window_seconds, max_count) values
  ('ask', 'actor', 60, 20), ('ask', 'actor', 86400, 200),
  ('ask', 'global', 3600, 300), ('ask', 'global', 86400, 2000),
  ('feedback', 'actor', 3600, 30), ('feedback', 'actor', 86400, 100),
  ('feedback', 'global', 86400, 1000),
  ('login', 'actor', 900, 12), ('login', 'actor', 86400, 50),
  ('login', 'global', 900, 300),
  ('gemini', 'global', 60, 20), ('gemini', 'global', 86400, 600),
  ('gemini', 'global', 2592000, 10000),
  ('brave', 'global', 1, 1), ('brave', 'global', 86400, 200),
  ('brave', 'global', 2592000, 2000);

create function public.reserve_api_rate_slot(p_action text, p_actor text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  policy public.api_rate_policies%rowtype;
  subject_key text;
  period_start timestamptz;
  used_count integer;
  wait_seconds integer;
  checked_at timestamptz := clock_timestamp();
  policy_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if p_action not in ('ask', 'feedback', 'login', 'gemini', 'brave') then raise exception 'invalid action'; end if;
  if p_action in ('ask', 'feedback', 'login') and coalesce(p_actor, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid actor';
  end if;
  -- One transaction lock per action makes the global and actor checks atomic across instances.
  perform pg_advisory_xact_lock(hashtextextended('api_rate:' || p_action, 0));
  select count(*) into policy_count from public.api_rate_policies where action = p_action;
  if policy_count = 0 then raise exception 'rate policy missing'; end if;
  for policy in select * from public.api_rate_policies where action = p_action order by scope, window_seconds loop
    subject_key := case when policy.scope = 'global' then 'global' else p_actor end;
    period_start := to_timestamp(floor(extract(epoch from checked_at) / policy.window_seconds) * policy.window_seconds);
    select counter.count into used_count from public.api_rate_counters counter
      where counter.action = p_action and counter.scope = policy.scope and counter.subject = subject_key
        and counter.window_seconds = policy.window_seconds and counter.window_start = period_start;
    if coalesce(used_count, 0) >= policy.max_count then
      wait_seconds := greatest(1, ceil(extract(epoch from period_start + make_interval(secs => policy.window_seconds) - checked_at))::integer);
      return jsonb_build_object('allowed', false, 'retry_after', wait_seconds);
    end if;
  end loop;
  for policy in select * from public.api_rate_policies where action = p_action order by scope, window_seconds loop
    subject_key := case when policy.scope = 'global' then 'global' else p_actor end;
    period_start := to_timestamp(floor(extract(epoch from checked_at) / policy.window_seconds) * policy.window_seconds);
    insert into public.api_rate_counters(action, scope, subject, window_seconds, window_start, count)
      values(p_action, policy.scope, subject_key, policy.window_seconds, period_start, 1)
      on conflict (action, scope, subject, window_seconds, window_start)
      do update set count = public.api_rate_counters.count + 1;
  end loop;
  -- Bound storage growth without a separate scheduled job.
  if random() < 0.01 then
    delete from public.api_rate_counters where window_start < clock_timestamp() - interval '31 days';
  end if;
  return jsonb_build_object('allowed', true);
end $$;
revoke all on function public.reserve_api_rate_slot(text, text) from public, anon, authenticated;
grant execute on function public.reserve_api_rate_slot(text, text) to service_role;
