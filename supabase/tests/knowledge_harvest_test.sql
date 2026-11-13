-- Scenario test for 20261113010000_knowledge_harvest.sql against a scratch PostgreSQL database.
-- It creates minimal stand-ins for the tables the migration references, so never run it on a real project.
--   createdb harvest_test
--   psql -v ON_ERROR_STOP=1 -d harvest_test -f supabase/tests/knowledge_harvest_stub.sql \
--     -f supabase/migrations/20261113010000_knowledge_harvest.sql -f supabase/tests/knowledge_harvest_test.sql
\set ON_ERROR_STOP on
insert into personalities (id, canonical_name) values ('11111111-1111-1111-1111-111111111111','C. V. Raman'), ('22222222-2222-2222-2222-222222222222','Ashoka');
create table payload as select $j${"personality_id":"11111111-1111-1111-1111-111111111111","question_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","providers":["google"],"duration_ms":4200,"sources":[
 {"work_key":"doi:10.1/x","url":"https://www.nature.com/articles/x","domain":"www.nature.com","title":"A new radiation","author":"Raman","publisher":"Nature","publication_date":"1928-03-31","journal":"Nature","doi":"10.1/x","evidence_type":"scholarly_interpretation","authority_level":"authoritative","authority_basis":"Peer-reviewed publisher","rights":null,"retention":"pointer_only","score":82,"tier":"trusted","signals":[{"key":"publisher","points":40,"detail":"x"}],"scoring_version":"source-credibility/1","provider":"google","cited":true,
  "findings":[{"passage_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","kind":"answer_evidence","locator":"p. 1","excerpt":"SHOULD NOT BE STORED","topic_terms":["radiation","scattering","light","1928"],"support_level":"STRONG","support_reason":"r","corroboration":1,"cited":true}]},
 {"work_key":"page:open.example.org/raman","url":"https://open.example.org/raman","domain":"open.example.org","title":"Raman biography","author":null,"publisher":"Open Archive","publication_date":null,"journal":null,"doi":null,"isbn":null,"evidence_type":"institutional_record","authority_level":"credible_secondary","authority_basis":"b","rights":"https://creativecommons.org/licenses/by/4.0/","retention":"licensed_excerpt","score":58,"tier":"credible","signals":[],"scoring_version":"source-credibility/1","provider":"google","cited":false,
  "findings":[{"passage_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","kind":"deep_harvest","locator":"Early life","excerpt":"Raman was born in 1888 and studied at Presidency College.","topic_terms":["born","1888","presidency","college"],"support_level":null,"support_reason":null,"corroboration":0,"cited":false}]}]}$j$::jsonb as h;
select record_knowledge_harvest((select h from payload));
do $$ begin
  assert (select count(*) from knowledge_sources) = 2;
  assert (select excerpt is null from knowledge_findings where passage_hash like 'aaaa%'), 'pointer-only finding must not keep text';
  assert (select excerpt is not null from knowledge_findings where passage_hash like 'bbbb%'), 'licensed finding keeps text';
  assert (select status from knowledge_sources where work_key='doi:10.1/x') = 'active';
end $$;
-- Same question again: no new distinct question, still not promotion ready.
select record_knowledge_harvest((select h from payload));
do $$ begin
  assert (select distinct_questions from knowledge_sources where work_key='doi:10.1/x') = 1;
  assert (select times_seen from knowledge_sources where work_key='doi:10.1/x') = 2;
  assert (select times_cited from knowledge_sources where work_key='doi:10.1/x') = 2;
  assert (select count(*) from knowledge_findings) = 2;
  assert (select times_seen from knowledge_findings where passage_hash like 'aaaa%') = 2;
  assert (select status from knowledge_sources where work_key='doi:10.1/x') = 'active';
end $$;
-- A different question: trusted + 2 questions + cited twice => promotion_ready.
select record_knowledge_harvest(jsonb_set((select h from payload), '{question_hash}', '"cccccccccccccccccccccccccccccccccccccccc"'));
do $$ begin
  assert (select status from knowledge_sources where work_key='doi:10.1/x') = 'promotion_ready';
  assert (select status from knowledge_sources where work_key like 'page:%') = 'active';
  assert (select count(*) from knowledge_harvest_runs) = 3;
end $$;
-- Recall: matches on topic overlap, only credible tiers, respects personality.
select * from recall_knowledge_sources('11111111-1111-1111-1111-111111111111', array['scattering','light','prize'], 3);
do $$ declare n int; begin
  select count(*) into n from recall_knowledge_sources('11111111-1111-1111-1111-111111111111', array['scattering','light','prize'], 3);
  assert n = 1, 'one source shares two terms';
  select count(*) into n from recall_knowledge_sources('22222222-2222-2222-2222-222222222222', array['scattering','light'], 3);
  assert n = 0, 'other personality sees nothing';
  select count(*) into n from recall_knowledge_sources('11111111-1111-1111-1111-111111111111', array['light','unrelated'], 3);
  assert n = 0, 'one shared term of two is not enough';
  select count(*) into n from recall_knowledge_sources('11111111-1111-1111-1111-111111111111', array['presidency'], 3);
  assert n = 1, 'single-term question can match';
end $$;
-- Recall failures suppress a source after three in a row; a later success restores it.
select record_knowledge_harvest(jsonb_build_object('personality_id','11111111-1111-1111-1111-111111111111','question_hash','dddddddddddddddddddddddddddddddddddddddd','sources','[]'::jsonb,'recall_attempted',1,'recall_failures', jsonb_build_array((select id from knowledge_sources where work_key='doi:10.1/x')))) from generate_series(1,3);
do $$ declare n int; begin
  assert (select consecutive_recall_failures from knowledge_sources where work_key='doi:10.1/x') = 3;
  select count(*) into n from recall_knowledge_sources('11111111-1111-1111-1111-111111111111', array['scattering','light'], 3);
  assert n = 0, 'failing source is not recalled';
end $$;
select record_knowledge_harvest((select h from payload));
do $$ declare n int; begin
  select count(*) into n from recall_knowledge_sources('11111111-1111-1111-1111-111111111111', array['scattering','light'], 3);
  assert n = 1, 'success resets failures';
end $$;
select * from knowledge_source_track_records(array['doi:10.1/x','missing']);
-- Review: promote creates one candidate Library source with a personality mapping; idempotent.
select review_knowledge_source((select id from knowledge_sources where work_key='doi:10.1/x'), 'promote', 'admin', 'looks right');
select review_knowledge_source((select id from knowledge_sources where work_key='doi:10.1/x'), 'promote', 'admin', null);
do $$ begin
  assert (select count(*) from sources) = 1;
  assert (select source_status || '/' || approval_origin || '/' || source_type || '/' || publication_year from sources) = 'candidate/ai_candidate/scholarly_article/1928';
  assert (select count(*) from source_personalities) = 1;
  assert (select status from knowledge_sources where work_key='doi:10.1/x') = 'promoted';
end $$;
-- Promoted rows are not reopened by later harvests.
select record_knowledge_harvest(jsonb_set((select h from payload), '{question_hash}', '"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"'));
do $$ begin assert (select status from knowledge_sources where work_key='doi:10.1/x') = 'promoted'; end $$;
-- Reject hides a source from recall and marks later findings rejected.
select review_knowledge_source((select id from knowledge_sources where work_key like 'page:%'), 'reject', 'admin', 'weak');
do $$ declare n int; begin
  select count(*) into n from recall_knowledge_sources('11111111-1111-1111-1111-111111111111', array['presidency'], 3);
  assert n = 0;
  begin perform review_knowledge_source((select id from knowledge_sources where work_key like 'page:%'), 'promote', 'admin', null); assert false; exception when sqlstate '22023' then null; end;
end $$;
select review_knowledge_source((select id from knowledge_sources where work_key like 'page:%'), 'restore', 'admin', null);
-- Bad payloads are refused.
do $$ begin
  begin perform record_knowledge_harvest('{"personality_id":"11111111-1111-1111-1111-111111111111","question_hash":"nope","sources":[]}'); assert false; exception when sqlstate '22023' then null; end;
  begin perform review_knowledge_source(gen_random_uuid(), 'promote', 'a', null); assert false; exception when sqlstate 'P0002' then null; end;
end $$;
select knowledge_harvest_snapshot();
select has_table_privilege('anon','knowledge_sources','select') anon_read, has_function_privilege('anon','record_knowledge_harvest(jsonb)','execute') anon_exec, has_function_privilege('service_role','record_knowledge_harvest(jsonb)','execute') svc_exec;
\echo ALL SQL TESTS PASSED
