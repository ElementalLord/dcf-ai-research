-- Scenario test for 20261113020000_autonomous_harvest_admission.sql. Scratch databases only.
--   psql -v ON_ERROR_STOP=1 -d harvest_test -f supabase/tests/knowledge_harvest_stub.sql \
--     -f supabase/migrations/20261113010000_knowledge_harvest.sql \
--     -f supabase/migrations/20261113020000_autonomous_harvest_admission.sql -f supabase/tests/autonomous_admission_test.sql
\set ON_ERROR_STOP on
insert into personalities (id, canonical_name) values ('33333333-3333-3333-3333-333333333333','Jamsetji Tata');
create function ks(p_key text, p_domain text, p_tier text, p_authority text, p_score int) returns void language sql as $$
  insert into knowledge_sources (work_key, canonical_url, domain, title, publisher, evidence_type, authority_level, credibility_score, credibility_tier, scoring_version, last_verified_at)
  values (p_key, 'https://' || p_domain || '/' || p_key, p_domain, 'Title of ' || p_key, 'Publisher ' || p_domain, 'institutional_record', p_authority, p_score, p_tier, 'source-credibility/1', now()) $$;
select ks('trusted-a', 'www.archive-a.gov', 'trusted', 'authoritative', 82), ks('credible-b', 'history-b.edu', 'credible', 'authoritative', 60),
  ks('credible-c', 'museum-c.org', 'credible', 'credible_secondary', 55), ks('credible-b2', 'www.history-b.edu', 'credible', 'authoritative', 58),
  ks('web-d', 'blog-d.example', 'credible', 'general_web', 52), ks('weak-e', 'weak-e.org', 'provisional', 'credible_secondary', 40);
create function adm(p_text text, p_keys text[], p_category text default 'ordinary_fact') returns jsonb language sql as $$
  select admit_harvest_verified_claim(jsonb_build_object('personality_id','33333333-3333-3333-3333-333333333333','claim_text',p_text,
    'claim_hash', encode(sha256(convert_to(p_text,'utf8')),'hex'), 'policy_version','harvest-admission/1','epistemic_type','HISTORICAL_FACT','category',p_category,
    'classifier_version','c/1','contract_version','k/1','question_hash','abcdefabcdefabcdef',
    'sources', (select jsonb_agg(jsonb_build_object('work_key', k, 'locator', 'Section ' || k)) from unnest(p_keys) k))) $$;
create function refused(p_text text, p_keys text[]) returns boolean language plpgsql as $$ begin
  perform adm(p_text, p_keys); return false; exception when sqlstate '22023' then return true; end $$;

-- Two independent credible works: admitted with high certainty, approved sources created, no text stored.
select adm('Jamsetji Tata founded the Empress Mills at Nagpur in 1877.', array['credible-b','credible-c']) as corroborated;
do $$ declare c claims%rowtype; begin
  select * into c from claims;
  assert c.review_status = 'approved' and c.approval_origin = 'automated_evidence_verification' and c.certainty = 'high';
  assert c.approval_metadata->>'storage_mode' = 'harvest_verified' and c.approval_metadata->>'basis' = 'independent_corroboration';
  assert (c.approval_metadata->>'valid_until')::timestamptz > now() + interval '360 days';
  assert (select count(*) from sources where source_status = 'approved' and approval_origin = 'automated_evidence_verification') = 2;
  assert (select count(*) from claim_sources where claim_id = c.id and evidence_excerpt is null and page_or_section like 'Section %') = 2;
  assert (select contract_status from claim_epistemics where claim_id = c.id) = 'SUPPORTED';
  assert (select count(*) from demand_verification_decisions where claim_id = c.id and outcome = 'admitted' and support = 'SUPPORTED') = 1;
  assert (select count(*) from knowledge_sources where status = 'promoted' and library_source_id is not null) = 2;
  assert (select count(*) from source_personalities) = 2;
end $$;
-- The same claim again is not duplicated.
do $$ begin assert (adm('Jamsetji Tata founded the Empress Mills at Nagpur in 1877.', array['credible-b','credible-c'])->>'created')::boolean = false;
  assert (select count(*) from claims) = 1; end $$;
-- One trusted authoritative work is enough, at medium certainty.
select adm('Jamsetji Tata was born in Navsari in 1839.', array['trusted-a']) as trusted_single;
do $$ begin assert (select certainty from claims where claim_text like '%Navsari%') = 'medium'; end $$;
-- Everything else is refused inside the transaction.
do $$ begin
  assert refused('Jamsetji Tata established a hotel in Bombay in 1903.', array['credible-b']), 'single credible source';
  assert refused('Jamsetji Tata established a hotel in Bombay in 1903.', array['credible-b','credible-b2']), 'same publisher twice';
  assert refused('Jamsetji Tata established a hotel in Bombay in 1903.', array['credible-b','web-d']), 'general web source';
  assert refused('Jamsetji Tata established a hotel in Bombay in 1903.', array['credible-b','weak-e']), 'provisional source';
  assert refused('Jamsetji Tata established a hotel in Bombay in 1903.', array['credible-b','never-harvested']), 'unknown source';
  assert refused('Too short.', array['trusted-a']), 'short claim';
  update knowledge_sources set last_verified_at = now() - interval '2 hours' where work_key = 'credible-c';
  assert refused('Jamsetji Tata established a hotel in Bombay in 1903.', array['credible-b','credible-c']), 'stale read';
  update knowledge_sources set last_verified_at = now() where work_key = 'credible-c';
  assert (select count(*) from claims) = 2, 'refusals leave nothing behind';
end $$;
-- A source a person left pending is never approved by the machine.
insert into sources (title, url, source_status) values ('Pending', 'https://museum-x.org/pending', 'candidate');
select ks('pending', 'museum-x.org', 'credible', 'credible_secondary', 55);
update knowledge_sources set canonical_url = 'https://museum-x.org/pending' where work_key = 'pending';
do $$ begin assert refused('Jamsetji Tata planned a steel works before 1904.', array['credible-b','pending']);
  assert (select source_status from sources where url = 'https://museum-x.org/pending') = 'candidate'; end $$;
-- The existing pause switch stops autonomous admission.
update demand_budget_policy set auto_admission_paused = true;
do $$ begin begin perform adm('Jamsetji Tata endowed a research institute in Bangalore.', array['trusted-a']); assert false;
  exception when others then assert sqlerrm like '%paused%'; end; end $$;
update demand_budget_policy set auto_admission_paused = false;
-- Rejecting a harvested source withdraws the claims resting on it; others are untouched.
select review_knowledge_source((select id from knowledge_sources where work_key = 'credible-c'), 'reject', 'admin', null) as rejected;
do $$ begin
  assert (select review_status from claims where claim_text like '%Empress%') = 'needs_review';
  assert (select approval_metadata->>'suspended_reason' from claims where claim_text like '%Empress%') = 'source_rejected';
  assert (select review_status from claims where claim_text like '%Navsari%') = 'approved';
  assert refused('Jamsetji Tata founded the Empress Mills at Nagpur in 1877.', array['credible-b','trusted-a']), 'suspended claim is not silently re-admitted';
end $$;
-- Contradiction suspension, decision logging, and input validation.
do $$ begin
  assert suspend_harvest_claim((select id from claims where claim_text like '%Navsari%'), 'contradiction');
  assert not suspend_harvest_claim((select id from claims where claim_text like '%Navsari%'), 'contradiction'), 'already suspended';
  perform record_harvest_decision(jsonb_build_object('personality_id','33333333-3333-3333-3333-333333333333','claim_hash',repeat('a',64),'outcome','quarantined',
    'support','UNRESOLVED','epistemic_type','HISTORICAL_FACT','policy_version','harvest-admission/1','reason_codes',jsonb_build_array('why'),'source_work_keys',jsonb_build_array('k')));
  begin perform record_harvest_decision('{"outcome":"admitted","policy_version":"harvest-admission/1","claim_hash":"x"}'); assert false; exception when sqlstate '22023' then null; end;
  begin perform suspend_harvest_claim(gen_random_uuid(), 'because'); assert false; exception when sqlstate '22023' then null; end;
end $$;
select knowledge_harvest_snapshot()->'autoClaims' auto_claims, knowledge_harvest_snapshot()->'autoSuspended' suspended, knowledge_harvest_snapshot()->'autoHeld30d' held;
select has_function_privilege('anon','admit_harvest_verified_claim(jsonb)','execute') anon_exec, has_function_privilege('service_role','admit_harvest_verified_claim(jsonb)','execute') svc_exec;
\echo ALL AUTONOMOUS ADMISSION SQL TESTS PASSED
