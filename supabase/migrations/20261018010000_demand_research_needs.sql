-- One user-triggered evidence need owns at most one active external search across instances.
-- Outcome stores counters and failure categories only, never provider snippets or document text.
create table if not exists public.demand_research_needs (
  need_id text primary key check (need_id ~ '^[a-f0-9]{64}$'),
  personality_id uuid not null references public.personalities(id) on delete restrict,
  status text not null check (status in ('running','complete','insufficient','failed')),
  lease_owner uuid,
  lease_until timestamptz,
  retry_after timestamptz,
  search_calls integer not null default 0 check (search_calls between 0 and 1),
  outcome jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists demand_research_needs_retry_idx on public.demand_research_needs(retry_after);
alter table public.demand_research_needs enable row level security;
revoke all on public.demand_research_needs from anon, authenticated;

create or replace function public.claim_demand_research_need(p_need_id text, p_personality_id uuid, p_owner uuid)
returns text language plpgsql security definer set search_path = public as $$
declare r public.demand_research_needs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if p_need_id !~ '^[a-f0-9]{64}$' then raise exception 'invalid need ID'; end if;
  insert into public.demand_research_needs(need_id, personality_id, status)
    values (p_need_id, p_personality_id, 'failed') on conflict (need_id) do nothing;
  select * into r from public.demand_research_needs where need_id = p_need_id for update;
  if r.personality_id <> p_personality_id then raise exception 'need identity collision'; end if;
  if r.status = 'running' and r.lease_until > now() then return 'active'; end if;
  if r.status in ('insufficient','failed') and r.retry_after > now() then return 'cooldown'; end if;
  update public.demand_research_needs set status = 'running', lease_owner = p_owner,
    lease_until = now() + interval '180 seconds', retry_after = null, outcome = '{}'::jsonb, search_calls = 0,
    updated_at = now() where need_id = p_need_id;
  return 'acquired';
end $$;

create or replace function public.finish_demand_research_need(p_need_id text, p_owner uuid,
  p_status text, p_search_calls integer, p_outcome jsonb, p_cooldown_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if p_status not in ('complete','insufficient','failed') or p_search_calls not between 0 and 1
    or p_cooldown_seconds not between 0 and 86400 then raise exception 'invalid research outcome'; end if;
  update public.demand_research_needs set status = p_status, lease_owner = null, lease_until = null,
    search_calls = p_search_calls, outcome = coalesce(p_outcome, '{}'::jsonb),
    retry_after = now() + make_interval(secs => p_cooldown_seconds), updated_at = now()
    where need_id = p_need_id and lease_owner = p_owner and status = 'running';
  return found;
end $$;
revoke execute on function public.claim_demand_research_need(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.finish_demand_research_need(text, uuid, text, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.claim_demand_research_need(text, uuid, uuid) to service_role;
grant execute on function public.finish_demand_research_need(text, uuid, text, integer, jsonb, integer) to service_role;
