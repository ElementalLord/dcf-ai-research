-- Cross-instance research reservations. Amounts are estimated micro-USD, never provider invoices.
create table if not exists public.demand_budget_policy (
  id boolean primary key default true check (id),
  request_limit_micro integer not null default 50000 check (request_limit_micro > 0),
  daily_limit_micro integer not null default 2000000 check (daily_limit_micro > 0),
  monthly_limit_micro integer not null default 25000000 check (monthly_limit_micro > 0),
  search_estimate_micro integer not null default 10000 check (search_estimate_micro >= 0),
  model_input_micro_per_1k integer not null default 1500 check (model_input_micro_per_1k >= 0),
  model_output_micro_per_1k integer not null default 3000 check (model_output_micro_per_1k >= 0),
  model_fallback_micro integer not null default 8000 check (model_fallback_micro >= 0),
  max_paid_calls integer not null default 8 check (max_paid_calls between 1 and 8),
  max_concurrent_jobs integer not null default 4 check (max_concurrent_jobs between 1 and 100),
  research_paused boolean not null default false,
  auto_admission_paused boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.demand_budget_policy(id) values(true) on conflict (id) do nothing;

create table if not exists public.demand_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  status text not null check (status in ('reserved','settled')),
  reserved_micro integer not null check (reserved_micro > 0),
  actual_micro integer check (actual_micro >= 0),
  planned_calls integer not null check (planned_calls between 1 and 8),
  search_calls integer not null default 0 check (search_calls between 0 and 1),
  model_calls integer not null default 0 check (model_calls between 0 and 7),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  settlement_reason text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists demand_budget_time_idx on public.demand_budget_reservations(created_at desc);
create index if not exists demand_budget_active_idx on public.demand_budget_reservations(expires_at) where status='reserved';

create table if not exists public.demand_question_activity (
  id uuid primary key default gen_random_uuid(),
  personality_ids uuid[] not null default '{}',
  need_id text,
  resolution_state text,
  research_status text,
  search_calls integer not null default 0,
  source_fetches integer not null default 0,
  verification_model_calls integer not null default 0,
  admitted_count integer not null default 0,
  quarantined_count integer not null default 0,
  rejected_count integer not null default 0,
  budget_exhausted boolean not null default false,
  estimated_cost_micro integer not null default 0,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists demand_question_activity_time_idx on public.demand_question_activity(created_at desc);
alter table public.demand_budget_policy enable row level security;
alter table public.demand_budget_reservations enable row level security;
alter table public.demand_question_activity enable row level security;
revoke all on public.demand_budget_policy, public.demand_budget_reservations, public.demand_question_activity from public, anon, authenticated;

create or replace function public.reserve_demand_budget(p_request_id uuid, p_planned_calls integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.demand_budget_policy%rowtype;
  active_count integer;
  day_spend bigint;
  month_spend bigint;
  existing public.demand_budget_reservations%rowtype;
  reservation_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  select * into p from public.demand_budget_policy where id=true for update;
  if not found then raise exception 'budget policy missing'; end if;
  if p.research_paused then return jsonb_build_object('status','paused'); end if;
  if p_planned_calls < 1 or p_planned_calls > p.max_paid_calls then return jsonb_build_object('status','call_limit'); end if;
  select * into existing from public.demand_budget_reservations where request_id=p_request_id;
  if found then return jsonb_build_object('status','duplicate','reservation_id',existing.id); end if;
  -- An abandoned operation may have been billed. Account for its full reservation.
  update public.demand_budget_reservations set status='settled', actual_micro=reserved_micro,
    settlement_reason='expired_unreconciled', settled_at=now()
    where status='reserved' and expires_at <= now();
  select count(*) into active_count from public.demand_budget_reservations where status='reserved';
  if active_count >= p.max_concurrent_jobs then return jsonb_build_object('status','concurrency_limit'); end if;
  select coalesce(sum(case when status='reserved' then reserved_micro else actual_micro end),0) into day_spend
    from public.demand_budget_reservations where created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  select coalesce(sum(case when status='reserved' then reserved_micro else actual_micro end),0) into month_spend
    from public.demand_budget_reservations where created_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  if day_spend+p.request_limit_micro > p.daily_limit_micro then return jsonb_build_object('status','daily_limit'); end if;
  if month_spend+p.request_limit_micro > p.monthly_limit_micro then return jsonb_build_object('status','monthly_limit'); end if;
  insert into public.demand_budget_reservations(request_id,status,reserved_micro,planned_calls,expires_at)
    values(p_request_id,'reserved',p.request_limit_micro,p_planned_calls,now()+interval '180 seconds') returning id into reservation_id;
  return jsonb_build_object('status','reserved','reservation_id',reservation_id,'reserved_micro',p.request_limit_micro,
    'search_estimate_micro',p.search_estimate_micro,'model_input_micro_per_1k',p.model_input_micro_per_1k,
    'model_output_micro_per_1k',p.model_output_micro_per_1k,'model_fallback_micro',p.model_fallback_micro);
end $$;

create or replace function public.settle_demand_budget(p_reservation_id uuid, p_search_calls integer,
  p_model_calls integer, p_input_tokens integer, p_output_tokens integer, p_unmetered_calls integer)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.demand_budget_policy%rowtype;
  r public.demand_budget_reservations%rowtype;
  charge bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  select * into p from public.demand_budget_policy where id=true;
  select * into r from public.demand_budget_reservations where id=p_reservation_id for update;
  if not found then raise exception 'reservation missing'; end if;
  if r.status='settled' then return r.actual_micro; end if;
  if p_search_calls not between 0 and 1 or p_model_calls not between 0 and 7 or p_search_calls+p_model_calls > r.planned_calls
    or p_input_tokens < 0 or p_output_tokens < 0 or p_unmetered_calls not between 0 and p_model_calls then raise exception 'invalid usage'; end if;
  charge := p_search_calls::bigint*p.search_estimate_micro
    + ceil(p_input_tokens::numeric/1000*p.model_input_micro_per_1k)::bigint
    + ceil(p_output_tokens::numeric/1000*p.model_output_micro_per_1k)::bigint
    + p_unmetered_calls::bigint*p.model_fallback_micro;
  update public.demand_budget_reservations set status='settled', actual_micro=least(charge,2147483647)::integer,
    search_calls=p_search_calls, model_calls=p_model_calls, input_tokens=p_input_tokens, output_tokens=p_output_tokens,
    settlement_reason='reported_usage', settled_at=now() where id=p_reservation_id;
  return least(charge,2147483647)::integer;
end $$;

-- A completed but unadmitted source search remains a negative-result memory for its cooldown.
create or replace function public.claim_demand_research_need(p_need_id text, p_personality_id uuid, p_owner uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.demand_research_needs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if p_need_id !~ '^[a-f0-9]{64}$' then raise exception 'invalid need ID'; end if;
  insert into public.demand_research_needs(need_id,personality_id,status)
    values(p_need_id,p_personality_id,'failed') on conflict (need_id) do nothing;
  select * into r from public.demand_research_needs where need_id=p_need_id for update;
  if r.personality_id <> p_personality_id then raise exception 'need identity collision'; end if;
  if r.status='running' and r.lease_until>now() then return 'active'; end if;
  if r.retry_after>now() then return 'cooldown'; end if;
  update public.demand_research_needs set status='running',lease_owner=p_owner,lease_until=now()+interval '180 seconds',
    retry_after=null,outcome='{}'::jsonb,search_calls=0,updated_at=now() where need_id=p_need_id;
  return 'acquired';
end $$;

-- Administrative pause is checked inside the publication transaction itself.
create or replace function public.guard_demand_auto_admission()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.approval_origin='automated_evidence_verification'
    and (select auto_admission_paused from public.demand_budget_policy where id=true) then
    raise exception 'Automatic admission is paused';
  end if;
  return new;
end $$;
drop trigger if exists guard_demand_auto_admission_trigger on public.claims;
create trigger guard_demand_auto_admission_trigger before insert on public.claims
  for each row execute function public.guard_demand_auto_admission();

revoke execute on function public.reserve_demand_budget(uuid,integer) from public, anon, authenticated;
revoke execute on function public.settle_demand_budget(uuid,integer,integer,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.reserve_demand_budget(uuid,integer) to service_role;
grant execute on function public.settle_demand_budget(uuid,integer,integer,integer,integer,integer) to service_role;

create or replace function public.demand_oversight_snapshot()
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'totalQuestions', (select count(*) from public.demand_question_activity),
    'localAnswers', (select count(*) from public.demand_question_activity where resolution_state='local_sufficient' and research_status is null),
    'researchAttempts', (select count(*) from public.demand_question_activity where research_status in ('complete','insufficient','failed')),
    'successfulResearch', (select count(*) from public.demand_question_activity where research_status='complete'),
    'unsuccessfulResearch', (select count(*) from public.demand_question_activity where research_status in ('insufficient','failed')),
    'budgetExhaustions', (select count(*) from public.demand_question_activity where budget_exhausted),
    'machineApproved', (select count(*) from public.claims where approval_origin='automated_evidence_verification' and review_status='approved'),
    'humanApproved', (select count(*) from public.claims where approval_origin in ('human_manual','mentor_review') and review_status='approved'),
    'suspendedMachine', (select count(*) from public.claims where approval_origin='automated_evidence_verification' and review_status<>'approved'),
    'quarantined', (select count(*) from public.demand_verification_decisions where outcome='quarantined'),
    'rejected', (select count(*) from public.demand_verification_decisions where outcome='rejected'),
    'searchCalls', (select coalesce(sum(search_calls),0) from public.demand_budget_reservations where status='settled'),
    'modelCalls', (select coalesce(sum(model_calls),0) from public.demand_budget_reservations where status='settled'),
    'dailyCostMicro', (select coalesce(sum(actual_micro),0) from public.demand_budget_reservations
      where status='settled' and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),
    'monthlyCostMicro', (select coalesce(sum(actual_micro),0) from public.demand_budget_reservations
      where status='settled' and created_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),
    'monthlyAdmissions', (select count(*) from public.claims where approval_origin='automated_evidence_verification'
      and review_status='approved' and approved_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')
  );
$$;
revoke execute on function public.demand_oversight_snapshot() from public, anon, authenticated;
grant execute on function public.demand_oversight_snapshot() to service_role;
