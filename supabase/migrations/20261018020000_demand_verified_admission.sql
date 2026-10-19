-- Server-only, additive admission ledger and one-transaction publication into the existing corpus.
alter table public.claims drop constraint if exists claims_approval_origin_check;
alter table public.claims add constraint claims_approval_origin_check check (approval_origin in
  ('human_manual','mentor_review','system_test_bulk','imported_existing','ai_candidate','automated_evidence_verification'));
alter table public.sources drop constraint if exists sources_approval_origin_check;
alter table public.sources add constraint sources_approval_origin_check check (approval_origin in
  ('human_manual','mentor_review','system_test_bulk','imported_existing','ai_candidate','verified_auto','citation_alternate','automated_evidence_verification'));
alter table public.claims drop constraint if exists claims_evidence_type_check;
alter table public.claims add constraint claims_evidence_type_check check (evidence_type in
  ('direct_primary_text','traditional_narrative','scholarly_interpretation','modern_spiritual_interpretation','historical_inference','historical_fact','contested','uncertain'));
alter table public.claim_epistemics drop constraint if exists claim_epistemics_epistemic_type_check;
alter table public.claim_epistemics add constraint claim_epistemics_epistemic_type_check check (epistemic_type in
  ('TEXTUAL_ASSERTION','TRADITIONAL_NARRATIVE','HISTORICAL_FACT','CONTEMPORARY_OBSERVATION','SCIENTIFIC_PRIORITY','CAUSAL_SIGNIFICANCE',
   'HISTORICAL_INFERENCE','SCHOLARLY_ATTRIBUTION','SCHOLARLY_INTERPRETATION','SYNTHETIC_INTERPRETATION',
   'MODERN_RECEPTION','NORMATIVE_RELEVANCE','CONTESTED','METHODOLOGICAL'));

create table if not exists public.demand_verification_decisions (
  id uuid primary key default gen_random_uuid(),
  personality_id uuid not null references public.personalities(id) on delete cascade,
  claim_hash text not null,
  claim_id uuid references public.claims(id) on delete set null,
  outcome text not null check (outcome in ('admitted','quarantined','rejected','duplicate','shadow')),
  support text not null check (support in ('SUPPORTED','PARTIALLY_SUPPORTED','CONTRADICTED','INSUFFICIENT_EVIDENCE','INVALID_SOURCE','UNRESOLVED')),
  epistemic_type text,
  policy_version text not null,
  reason_codes text[] not null default '{}',
  source_work_keys text[] not null default '{}',
  research_request_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists demand_admitted_claim_identity on public.demand_verification_decisions(personality_id,claim_hash) where outcome='admitted';
create index if not exists demand_decisions_recent on public.demand_verification_decisions(personality_id,created_at desc);
alter table public.demand_verification_decisions enable row level security;
revoke all on public.demand_verification_decisions from public, anon, authenticated;

create or replace function public.record_demand_verification_decision(p_decision jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if p_decision->>'outcome' not in ('quarantined','rejected','duplicate','shadow') then raise exception 'Invalid non-publication decision'; end if;
  insert into public.demand_verification_decisions(personality_id,claim_hash,claim_id,outcome,support,epistemic_type,policy_version,reason_codes,source_work_keys,research_request_id)
  values ((p_decision->>'personality_id')::uuid, left(p_decision->>'claim_hash',64), null,
    p_decision->>'outcome', p_decision->>'support', left(p_decision->>'epistemic_type',80),
    left(p_decision->>'policy_version',80), array(select left(value,120) from jsonb_array_elements_text(p_decision->'reason_codes') value limit 8),
    array(select left(value,250) from jsonb_array_elements_text(p_decision->'source_work_keys') value limit 4),
    left(p_decision->>'research_request_id',100));
end $$;

create or replace function public.admit_demand_verified_claim(p_admission jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_personality uuid := (p_admission->>'personality_id')::uuid;
  v_text text := btrim(p_admission->>'claim_text');
  v_hash text := p_admission->>'claim_hash';
  v_source jsonb;
  v_source_id uuid;
  v_chunk_id uuid;
  v_claim_id uuid;
  v_existing text;
  v_existing_title text;
  v_existing_publisher text;
  v_index integer := 0;
  v_work_keys text[] := '{}';
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if length(v_text) not between 18 and 350 or v_hash !~ '^[0-9a-f]{64}$'
    or p_admission->>'epistemic_type' <> 'HISTORICAL_FACT'
    or p_admission->>'contract_status' <> 'SUPPORTED'
    or p_admission->>'policy_version' <> 'demand-admission/1'
    or jsonb_typeof(p_admission->'sources') <> 'array'
    or jsonb_array_length(p_admission->'sources') not between 1 and 4 then
    raise exception 'Invalid verified admission payload';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_personality::text || ':' || v_hash, 0));
  select claim_id into v_claim_id from public.demand_verification_decisions
    where personality_id=v_personality and claim_hash=v_hash and outcome='admitted' limit 1;
  if v_claim_id is not null then return jsonb_build_object('claim_id',v_claim_id,'created',false); end if;
  select id into v_claim_id from public.claims where personality_id=v_personality
    and btrim(regexp_replace(lower(claim_text),'[^a-z0-9]+',' ','g')) = btrim(regexp_replace(lower(v_text),'[^a-z0-9]+',' ','g'))
    and review_status='approved' limit 1;
  if v_claim_id is not null then return jsonb_build_object('claim_id',v_claim_id,'created',false); end if;

  -- Validate every source before any publication. Mere web availability or "open access" is insufficient.
  for v_source in select value from jsonb_array_elements(p_admission->'sources') loop
    if v_source->>'url' !~ '^https://[^ /]+' or length(v_source->>'url') > 2000
      or length(btrim(v_source->>'title')) < 5 or length(btrim(v_source->>'publisher')) < 2
      or length(btrim(v_source->>'work_key')) < 5 or length(btrim(v_source->>'locator')) < 1
      or length(btrim(v_source->>'excerpt')) < 20 or length(v_source->>'excerpt') > 240
      or coalesce(v_source->>'rights','') !~* '(public domain|cc0|creativecommons\.org/(licenses|publicdomain)/)' then
      raise exception 'Incomplete source identity or retention rights';
    end if;
    v_work_keys := array_append(v_work_keys, v_source->>'work_key');
  end loop;

  insert into public.claims(personality_id,claim_text,claim_kind,certainty,review_status,approval_origin,
    evidence_type,approved_at,approved_by_label,approval_note,approval_metadata)
  values(v_personality,v_text,'established_fact','high','approved','automated_evidence_verification',
    'historical_fact',now(),'automated_evidence_verification','Demand-driven evidence verification',
    jsonb_build_object('policy_version',p_admission->>'policy_version','research_work_id',p_admission->>'research_work_id',
      'machine_verified',true,'independent_work_keys',to_jsonb(v_work_keys))) returning id into v_claim_id;

  for v_source in select value from jsonb_array_elements(p_admission->'sources') loop
    select id, source_status, title, publisher_or_institution
      into v_source_id, v_existing, v_existing_title, v_existing_publisher
      from public.sources where url=v_source->>'url' limit 1;
    if v_source_id is not null and v_existing <> 'approved' then raise exception 'Existing source is not approved'; end if;
    if v_source_id is not null and (lower(v_existing_title) <> lower(v_source->>'title')
      or lower(coalesce(v_existing_publisher,'')) <> lower(v_source->>'publisher')) then
      raise exception 'Existing source identity differs from retrieved document';
    end if;
    if v_source_id is null then
      insert into public.sources(title,url,author,publisher_or_institution,source_type,citation,source_status,
        ingestion_status,rights_or_access_note,approval_origin,approved_at,approved_by_label,approval_note,metadata)
      values(v_source->>'title',v_source->>'url',nullif(v_source->>'author',''),v_source->>'publisher',
        v_source->>'evidence_type',v_source->>'title' || ' (' || v_source->>'url' || ')','approved','ready',
        v_source->>'rights','automated_evidence_verification',now(),'automated_evidence_verification',
        'Source identity and permitted excerpt checked for demand claim',
        jsonb_build_object('independentWorkKey',v_source->>'work_key','publicationDate',v_source->>'publication_date'))
      returning id into v_source_id;
    end if;
    insert into public.source_chunks(source_id,chunk_index,chunk_text,page_or_section,content_hash,token_estimate,metadata)
    values(v_source_id,v_index,v_source->>'excerpt',v_source->>'locator',md5(v_source->>'excerpt'),
      greatest(1,length(v_source->>'excerpt')/4),jsonb_build_object('origin','demand_verified','policy_version',p_admission->>'policy_version'))
    on conflict (source_id,content_hash) do update set updated_at=now() returning id into v_chunk_id;
    insert into public.claim_sources(claim_id,source_id,relationship,evidence_excerpt,page_or_section)
    values(v_claim_id,v_source_id,'supports',v_source->>'excerpt',v_source->>'locator');
    insert into public.claim_chunks(claim_id,chunk_id,relationship,link_method,metadata)
    values(v_claim_id,v_chunk_id,'supports','demand_verified',jsonb_build_object('policy_version',p_admission->>'policy_version'));
    insert into public.chunk_personalities(chunk_id,personality_id,relationship,relevance_score,tagging_method)
    values(v_chunk_id,v_personality,'supports',1,'rule') on conflict (chunk_id,personality_id) do nothing;
    insert into public.source_personalities(source_id,personality_id,relationship,confidence,mapping_method)
    values(v_source_id,v_personality,'supports_claims',1,'claim_link') on conflict (source_id,personality_id) do nothing;
    v_index := v_index+1;
  end loop;
  insert into public.claim_epistemics(claim_id,personality_id,epistemic_type,proposed_type,type_origin,type_confidence,
    type_review_status,classifier_version,contract_status,contract_satisfied,contract_basis,contract_version,contract_detail)
  values(v_claim_id,v_personality,'HISTORICAL_FACT','HISTORICAL_FACT','deterministic',0.7,'auto_assigned',
    p_admission->>'classifier_version','SUPPORTED',true,'fact',p_admission->>'contract_version',
    jsonb_build_object('policy_version',p_admission->>'policy_version','work_keys',to_jsonb(v_work_keys)));
  insert into public.demand_verification_decisions(personality_id,claim_hash,claim_id,outcome,support,epistemic_type,
    policy_version,reason_codes,source_work_keys,research_request_id)
  values(v_personality,v_hash,v_claim_id,'admitted','SUPPORTED','HISTORICAL_FACT',p_admission->>'policy_version',
    array['all_gates_passed'],v_work_keys,p_admission->>'research_request_id');
  return jsonb_build_object('claim_id',v_claim_id,'created',true);
end $$;

revoke execute on function public.record_demand_verification_decision(jsonb) from public, anon, authenticated;
revoke execute on function public.admit_demand_verified_claim(jsonb) from public, anon, authenticated;
grant execute on function public.record_demand_verification_decision(jsonb) to service_role;
grant execute on function public.admit_demand_verified_claim(jsonb) to service_role;

-- Suspending an automated claim removes its exclusive passage from local retrieval.
-- Answer-cache identities are recomputed from currently retrieved evidence on every lookup.
create or replace function public.suspend_demand_claim_passages()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.approval_origin = 'automated_evidence_verification' and old.review_status = 'approved'
    and new.review_status <> 'approved' then
    update public.source_chunks sc set is_active = false, updated_at = now()
    from public.claim_chunks cc
    where cc.claim_id = new.id and cc.chunk_id = sc.id
      and not exists (
        select 1 from public.claim_chunks other_link
        join public.claims other_claim on other_claim.id=other_link.claim_id
        where other_link.chunk_id=sc.id and other_claim.id<>new.id and other_claim.review_status='approved'
      );
  end if;
  return new;
end $$;
drop trigger if exists suspend_demand_claim_passages_trigger on public.claims;
create trigger suspend_demand_claim_passages_trigger after update of review_status on public.claims
for each row execute function public.suspend_demand_claim_passages();
