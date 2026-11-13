-- Minimal stand-ins for the existing tables and roles the knowledge-harvest migration references. Scratch databases only.
create role anon; create role authenticated; create role service_role;
create table personalities (id uuid primary key default gen_random_uuid(), canonical_name text not null);
create table sources (id uuid primary key default gen_random_uuid(), title text not null, author text, publisher_or_institution text, publication_year integer,
  source_type text not null default 'other' check (source_type in ('primary_text','scholarly_book','scholarly_article','biography','autobiography','archival','institutional','dcf_content','other')),
  url text, citation text, source_status text not null default 'candidate' check (source_status in ('candidate','approved','rejected')), notes text, created_at timestamptz not null default now(),
  rights_or_access_note text, metadata jsonb not null default '{}',
  approval_origin text not null default 'imported_existing' check (approval_origin in ('human_manual','mentor_review','system_test_bulk','imported_existing','ai_candidate','verified_auto','citation_alternate','automated_evidence_verification')));
create table source_personalities (source_id uuid not null references sources(id) on delete cascade, personality_id uuid not null references personalities(id) on delete cascade,
  relationship text not null default 'relevant', confidence double precision check (confidence >= 0 and confidence <= 1),
  mapping_method text not null default 'manual' check (mapping_method in ('manual','claim_link','chunk_tag','ai')), metadata jsonb not null default '{}', created_at timestamptz not null default now(), primary key (source_id, personality_id));
