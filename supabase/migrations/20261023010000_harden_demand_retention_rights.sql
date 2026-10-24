-- Keep the transactional admission gate aligned with the application's explicit rights check.
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
  if exists (select 1 from public.demand_verification_decisions
    where personality_id=v_personality and claim_hash=v_hash and outcome='admitted') then
    select d.claim_id into v_claim_id from public.demand_verification_decisions d
    join public.claims c on c.id=d.claim_id
    where d.personality_id=v_personality and d.claim_hash=v_hash and d.outcome='admitted'
      and c.review_status='approved'
      and c.approval_origin in ('human_manual','mentor_review','automated_evidence_verification','corpus_evidence_review') limit 1;
    if v_claim_id is null then raise exception 'Prior admitted claim is suspended; review required'; end if;
    return jsonb_build_object('claim_id',v_claim_id,'created',false);
  end if;
  select id into v_claim_id from public.claims where personality_id=v_personality
    and btrim(regexp_replace(lower(claim_text),'[^a-z0-9]+',' ','g')) = btrim(regexp_replace(lower(v_text),'[^a-z0-9]+',' ','g'))
    and review_status='approved'
    and approval_origin in ('human_manual','mentor_review','automated_evidence_verification','corpus_evidence_review') limit 1;
  if v_claim_id is not null then return jsonb_build_object('claim_id',v_claim_id,'created',false); end if;

  -- Validate every source before any publication. Mere web availability or "open access" is insufficient.
  for v_source in select value from jsonb_array_elements(p_admission->'sources') loop
    if coalesce(v_source->>'url','') !~ '^https://[^ /]+' or length(v_source->>'url') > 2000
      or length(btrim(coalesce(v_source->>'title',''))) < 5 or length(btrim(coalesce(v_source->>'publisher',''))) < 2
      or length(btrim(coalesce(v_source->>'work_key',''))) < 5 or length(btrim(coalesce(v_source->>'locator',''))) < 1
      or length(btrim(coalesce(v_source->>'excerpt',''))) < 20 or length(v_source->>'excerpt') > 600
      or coalesce(v_source->>'rights','') ~* '\m(not|no|without)\M.{0,50}(\mpublic[[:space:]]+domain\M|\mcc0\M|creativecommons\.org)'
      or (coalesce(v_source->>'rights','') !~* '(\mpublic[[:space:]]+domain\M|\mcc0([[:space:]]+1\.0)?\M)'
        and coalesce(v_source->>'rights','') !~* '(^|[[:space:]])https://creativecommons\.org/(licenses/(by|by-sa|by-nc|by-nc-sa|by-nd|by-nc-nd)/[1-4]\.0|publicdomain/(zero|mark)/1\.0)/?([[:space:]]|$)') then
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
        case v_source->>'evidence_type'
          when 'institutional_record' then 'institutional'
          when 'primary_document' then 'archival'
          when 'traditional_text' then 'primary_text'
          when 'scholarly_interpretation' then 'scholarly_article'
          else 'other'
        end,(v_source->>'title') || ' (' || (v_source->>'url') || ')','approved','ready',
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
