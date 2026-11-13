-- Minimal stand-ins for the existing tables and roles the knowledge-harvest migration references. Scratch databases only.
do $$ begin create role anon; create role authenticated; create role service_role; exception when duplicate_object then null; end $$;
create table personalities (id uuid primary key default gen_random_uuid(), canonical_name text not null);
create table sources (id uuid primary key default gen_random_uuid(), title text not null, author text, publisher_or_institution text, publication_year integer,
  source_type text not null default 'other' check (source_type in ('primary_text','scholarly_book','scholarly_article','biography','autobiography','archival','institutional','dcf_content','other')),
  url text, citation text, source_status text not null default 'candidate' check (source_status in ('candidate','approved','rejected')), notes text, created_at timestamptz not null default now(),
  rights_or_access_note text, metadata jsonb not null default '{}',
  approval_origin text not null default 'imported_existing' check (approval_origin in ('human_manual','mentor_review','system_test_bulk','imported_existing','ai_candidate','verified_auto','citation_alternate','automated_evidence_verification')));
create table source_personalities (source_id uuid not null references sources(id) on delete cascade, personality_id uuid not null references personalities(id) on delete cascade,
  relationship text not null default 'relevant', confidence double precision check (confidence >= 0 and confidence <= 1),
  mapping_method text not null default 'manual' check (mapping_method in ('manual','claim_link','chunk_tag','ai')), metadata jsonb not null default '{}', created_at timestamptz not null default now(), primary key (source_id, personality_id));
-- Stand-ins for the claim tables that autonomous admission writes to.
alter table sources add column ingestion_status text not null default 'not_ingested', add column approved_at timestamptz, add column approved_by_label text, add column approval_note text;
create table claims (id uuid primary key default gen_random_uuid(), personality_id uuid not null references personalities(id), claim_text text not null,
  claim_kind text not null default 'established_fact', certainty text not null default 'unknown', review_status text not null default 'draft',
  approval_origin text not null default 'imported_existing', evidence_type text not null default 'uncertain', approved_at timestamptz, approved_by_label text,
  approval_note text, approval_metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table claim_sources (id uuid primary key default gen_random_uuid(), claim_id uuid not null references claims(id) on delete cascade, source_id uuid not null references sources(id),
  relationship text not null default 'supports', evidence_excerpt text, page_or_section text);
create table claim_epistemics (claim_id uuid primary key references claims(id) on delete cascade, personality_id uuid not null, epistemic_type text, proposed_type text not null,
  type_origin text not null, type_confidence numeric not null default 0, type_review_status text not null, classifier_version text not null, contract_status text not null,
  contract_satisfied boolean, contract_basis text, contract_version text not null, contract_detail jsonb not null default '{}');
create table demand_verification_decisions (id uuid primary key default gen_random_uuid(), personality_id uuid not null, claim_hash text not null, claim_id uuid references claims(id) on delete set null,
  outcome text not null check (outcome in ('admitted','quarantined','rejected','duplicate','shadow')), support text not null, epistemic_type text, policy_version text not null,
  reason_codes text[] not null default '{}', source_work_keys text[] not null default '{}', research_request_id text, created_at timestamptz not null default now());
create unique index demand_admitted_claim_identity on demand_verification_decisions(personality_id,claim_hash) where outcome='admitted';
create table demand_budget_policy (id boolean primary key default true, auto_admission_paused boolean not null default false);
insert into demand_budget_policy default values;
create function guard_demand_auto_admission() returns trigger language plpgsql as $$ begin
  if new.approval_origin='automated_evidence_verification' and (select auto_admission_paused from demand_budget_policy where id=true) then raise exception 'Automatic admission is paused'; end if;
  return new; end $$;
create trigger guard_demand_auto_admission_trigger before insert on claims for each row execute function guard_demand_auto_admission();
