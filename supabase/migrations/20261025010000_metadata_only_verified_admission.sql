-- An explicit, human-reviewed terms decision is required for each original URL.
-- This is not permission to copy the work or a replacement for source access checks.
create table public.metadata_admission_permissions (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique check (source_url ~ '^https://[^ /]+'),
  publisher text not null check (length(btrim(publisher)) >= 2),
  terms_url text not null check (terms_url ~ '^https://[^ /]+'),
  decision_basis text not null check (length(btrim(decision_basis)) >= 20),
  reviewed_by text not null check (length(btrim(reviewed_by)) >= 2),
  reviewed_at timestamptz not null default now(),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.metadata_claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete restrict,
  permission_id uuid not null references public.metadata_admission_permissions(id) on delete restrict,
  work_key text not null check (length(btrim(work_key)) >= 5),
  locator text not null check (length(btrim(locator)) >= 1),
  accessed_at timestamptz not null,
  verified_at timestamptz not null default now(),
  valid_until timestamptz not null,
  validity_status text not null default 'valid' check (validity_status in ('valid','suspended')),
  invalid_reason text check (invalid_reason in ('inaccessible','material_change','contradiction','terms_restricted','verification_expired')),
  unique (claim_id, source_id)
);
create index metadata_claim_evidence_validity_idx on public.metadata_claim_evidence(claim_id, validity_status, valid_until);

create table public.metadata_claim_validity_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  reason text not null check (reason in ('inaccessible','material_change','contradiction','terms_restricted','verification_expired')),
  recorded_at timestamptz not null default now()
);

alter table public.metadata_admission_permissions enable row level security;
alter table public.metadata_claim_evidence enable row level security;
alter table public.metadata_claim_validity_events enable row level security;
revoke all on public.metadata_admission_permissions, public.metadata_claim_evidence, public.metadata_claim_validity_events from anon, authenticated;
grant select, insert, update on public.metadata_admission_permissions to service_role;
grant select on public.metadata_claim_evidence, public.metadata_claim_validity_events to service_role;

create function public.admit_metadata_verified_claim(p_admission jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_personality uuid := (p_admission->>'personality_id')::uuid;
  v_text text := btrim(p_admission->>'claim_text');
  v_hash text := p_admission->>'claim_hash';
  v_source jsonb;
  v_source_id uuid;
  v_claim_id uuid;
  v_permission public.metadata_admission_permissions%rowtype;
  v_existing record;
  v_work_keys text[] := '{}';
  v_domains text[] := '{}';
  v_url text;
  v_accessed timestamptz;
  v_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if length(v_text) not between 18 and 350 or v_hash !~ '^[0-9a-f]{64}$'
    or p_admission->>'epistemic_type' <> 'HISTORICAL_FACT'
    or p_admission->>'contract_status' <> 'SUPPORTED'
    or p_admission->>'policy_version' <> 'demand-admission/1'
    or p_admission->>'storage_mode' <> 'metadata_only'
    or p_admission ? 'excerpt' or p_admission ? 'passage'
    or jsonb_typeof(p_admission->'sources') <> 'array'
    or jsonb_array_length(p_admission->'sources') not between 1 and 4 then
    raise exception 'Invalid metadata-only admission payload';
  end if;
  v_count := jsonb_array_length(p_admission->'sources');
  if not ((v_count >= 2 and p_admission->>'category' = 'ordinary_fact'
      and p_admission->>'independent_documents' = 'true')
    or (v_count = 1 and p_admission->>'category' = 'official_record_fact'
      and p_admission->>'official_issuer' = 'true'
      and v_text ~* '\m(awarded|award|appointed|appointment|elected)\M')) then
    raise exception 'Metadata-only evidence contract failed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_personality::text || ':' || v_hash, 0));
  select d.claim_id into v_claim_id from public.demand_verification_decisions d
    where d.personality_id=v_personality and d.claim_hash=v_hash and d.outcome='admitted' limit 1;
  if v_claim_id is not null then
    if not exists (select 1 from public.claims c where c.id=v_claim_id and c.review_status='approved')
      then raise exception 'Prior admitted claim is suspended; review required'; end if;
    return jsonb_build_object('claim_id',v_claim_id,'created',false);
  end if;
  select id into v_claim_id from public.claims where personality_id=v_personality
    and btrim(regexp_replace(lower(claim_text),'[^a-z0-9]+',' ','g')) = btrim(regexp_replace(lower(v_text),'[^a-z0-9]+',' ','g'))
    and review_status='approved'
    and approval_origin in ('human_manual','mentor_review','automated_evidence_verification','corpus_evidence_review') limit 1;
  if v_claim_id is not null then return jsonb_build_object('claim_id',v_claim_id,'created',false); end if;

  -- Reject unknown keys: publisher text cannot hide in notes or extra JSON fields.
  for v_source in select value from jsonb_array_elements(p_admission->'sources') loop
    if exists (select 1 from jsonb_object_keys(v_source) k where k not in
      ('url','title','author','publisher','publication_date','evidence_type','work_key','locator','accessed_at')) then
      raise exception 'Metadata-only source contains unapproved fields';
    end if;
    v_url := v_source->>'url';
    if coalesce(v_url,'') !~ '^https://[^ /]+' or length(v_url) > 2000
      or length(btrim(coalesce(v_source->>'title',''))) not between 5 and 500
      or length(btrim(coalesce(v_source->>'publisher',''))) not between 2 and 300
      or length(coalesce(v_source->>'author','')) > 300
      or length(btrim(coalesce(v_source->>'work_key',''))) not between 5 and 500
      or length(btrim(coalesce(v_source->>'locator',''))) not between 1 and 300
      or length(coalesce(v_source->>'publication_date','')) > 80 then
      raise exception 'Incomplete metadata-only source identity';
    end if;
    begin v_accessed := (v_source->>'accessed_at')::timestamptz;
      exception when others then raise exception 'Invalid source access date'; end;
    if v_accessed is null or v_accessed > now() + interval '5 minutes'
      or v_accessed < now() - interval '1 hour' then raise exception 'Source access date is stale'; end if;
    select * into v_permission from public.metadata_admission_permissions
      where source_url=v_url and publisher=v_source->>'publisher' and is_active=true
        and reviewed_at <= v_accessed limit 1;
    if not found then raise exception 'Metadata-only source terms are not approved'; end if;
    if v_source->>'work_key' = any(v_work_keys) or substring(v_url from '^https://([^/]+)') = any(v_domains) then
      raise exception 'Duplicate metadata-only work';
    end if;
    v_work_keys := array_append(v_work_keys, v_source->>'work_key');
    v_domains := array_append(v_domains, substring(v_url from '^https://([^/]+)'));
  end loop;
  if v_count > 1 and array_length(array(select distinct x from unnest(v_domains) x),1) <> v_count
    then raise exception 'Corroborating publishers are not independent'; end if;

  insert into public.claims(personality_id,claim_text,claim_kind,certainty,review_status,approval_origin,
    evidence_type,approved_at,approved_by_label,approval_note,approval_metadata)
  values(v_personality,v_text,'established_fact','high','approved','automated_evidence_verification',
    'historical_fact',now(),'automated_evidence_verification','Demand-driven metadata-only evidence verification',
    jsonb_build_object('policy_version',p_admission->>'policy_version','storage_mode','metadata_only',
      'research_work_id',p_admission->>'research_work_id','machine_verified',true,
      'independent_work_keys',to_jsonb(v_work_keys))) returning id into v_claim_id;

  for v_source in select value from jsonb_array_elements(p_admission->'sources') loop
    v_url := v_source->>'url';
    v_accessed := (v_source->>'accessed_at')::timestamptz;
    select * into v_permission from public.metadata_admission_permissions where source_url=v_url and is_active=true;
    select id,source_status,title,publisher_or_institution into v_existing from public.sources where url=v_url limit 1;
    if v_existing.id is not null and (v_existing.source_status <> 'approved'
      or lower(v_existing.title) <> lower(v_source->>'title')
      or lower(coalesce(v_existing.publisher_or_institution,'')) <> lower(v_source->>'publisher')) then
      raise exception 'Existing source identity differs from verified work'; end if;
    v_source_id := v_existing.id;
    if v_source_id is null then
      insert into public.sources(title,url,author,publisher_or_institution,source_type,citation,source_status,
        ingestion_status,rights_or_access_note,approval_origin,approved_at,approved_by_label,approval_note,metadata)
      values(v_source->>'title',v_url,nullif(v_source->>'author',''),v_source->>'publisher',
        case v_source->>'evidence_type' when 'institutional_record' then 'institutional'
          when 'primary_document' then 'archival' when 'scholarly_interpretation' then 'scholarly_article'
          else 'other' end,(v_source->>'title') || ' (' || v_url || ')','approved','ready',
        'Metadata-only factual citation; no source text retained','automated_evidence_verification',now(),
        'automated_evidence_verification','Publisher terms reviewed for metadata-only use',
        jsonb_build_object('independentWorkKey',v_source->>'work_key','publicationDate',v_source->>'publication_date'))
      returning id into v_source_id;
    end if;
    insert into public.claim_sources(claim_id,source_id,relationship,evidence_excerpt,page_or_section)
      values(v_claim_id,v_source_id,'supports',null,v_source->>'locator');
    insert into public.source_personalities(source_id,personality_id,relationship,confidence,mapping_method)
      values(v_source_id,v_personality,'supports_claims',1,'claim_link')
      on conflict (source_id,personality_id) do nothing;
    insert into public.metadata_claim_evidence(claim_id,source_id,permission_id,work_key,locator,accessed_at,valid_until)
      values(v_claim_id,v_source_id,v_permission.id,v_source->>'work_key',v_source->>'locator',
        v_accessed,v_accessed + interval '30 days');
  end loop;
  insert into public.claim_epistemics(claim_id,personality_id,epistemic_type,proposed_type,type_origin,type_confidence,
    type_review_status,classifier_version,contract_status,contract_satisfied,contract_basis,contract_version,contract_detail)
  values(v_claim_id,v_personality,'HISTORICAL_FACT','HISTORICAL_FACT','deterministic',0.7,'auto_assigned',
    p_admission->>'classifier_version','SUPPORTED',true,'fact',p_admission->>'contract_version',
    jsonb_build_object('policy_version',p_admission->>'policy_version','work_keys',to_jsonb(v_work_keys),
      'storage_mode','metadata_only'));
  insert into public.demand_verification_decisions(personality_id,claim_hash,claim_id,outcome,support,epistemic_type,
    policy_version,reason_codes,source_work_keys,research_request_id)
  values(v_personality,v_hash,v_claim_id,'admitted','SUPPORTED','HISTORICAL_FACT',p_admission->>'policy_version',
    array['all_gates_passed','metadata_only'],v_work_keys,p_admission->>'research_request_id');
  return jsonb_build_object('claim_id',v_claim_id,'created',true);
end $$;

create function public.suspend_metadata_verified_claim(p_claim_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if p_reason not in ('inaccessible','material_change','contradiction','terms_restricted','verification_expired')
    then raise exception 'Invalid suspension reason'; end if;
  if not exists (select 1 from public.claims where id=p_claim_id and approval_origin='automated_evidence_verification'
    and approval_metadata->>'storage_mode'='metadata_only') then raise exception 'Not a metadata-only claim'; end if;
  update public.claims set review_status='needs_review',updated_at=now() where id=p_claim_id;
  update public.metadata_claim_evidence set validity_status='suspended',invalid_reason=p_reason where claim_id=p_claim_id;
  insert into public.metadata_claim_validity_events(claim_id,reason) values(p_claim_id,p_reason);
  return true;
end $$;

revoke execute on function public.admit_metadata_verified_claim(jsonb) from public, anon, authenticated;
revoke execute on function public.suspend_metadata_verified_claim(uuid,text) from public, anon, authenticated;
grant execute on function public.admit_metadata_verified_claim(jsonb) to service_role;
grant execute on function public.suspend_metadata_verified_claim(uuid,text) to service_role;
