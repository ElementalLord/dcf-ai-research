create extension if not exists vector with schema extensions;

alter table public.sources
  add column if not exists ingestion_status text not null default 'not_ingested',
  add column if not exists ingested_at timestamptz,
  add column if not exists content_hash text,
  add column if not exists content_language text,
  add column if not exists textual_layer text,
  add column if not exists rights_or_access_note text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists last_ingestion_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.sources
  drop constraint if exists sources_ingestion_status_check;

alter table public.sources
  add constraint sources_ingestion_status_check
  check (ingestion_status in ('not_ingested', 'processing', 'ready', 'failed'));

create table if not exists public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_text text not null check (length(btrim(chunk_text)) > 0),
  section_title text,
  page_or_section text,
  start_offset integer,
  end_offset integer,
  language text,
  textual_layer text,
  content_hash text not null,
  token_estimate integer not null default 0 check (token_estimate >= 0),
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  embedding extensions.vector(768),
  embedding_model text,
  embedding_dimensions integer,
  embedding_status text not null default 'not_requested',
  embedding_error text,
  embedded_at timestamptz,
  search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(section_title, '')), 'A') ||
    setweight(to_tsvector('simple', chunk_text), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, content_hash),
  check (start_offset is null or start_offset >= 0),
  check (end_offset is null or end_offset >= coalesce(start_offset, 0)),
  check (embedding_status in ('not_requested', 'pending', 'ready', 'failed'))
);

create table if not exists public.chunk_personalities (
  chunk_id uuid not null references public.source_chunks(id) on delete cascade,
  personality_id uuid not null references public.personalities(id) on delete cascade,
  relationship text not null default 'mentions',
  relevance_score double precision,
  tagging_method text not null default 'manual',
  confidence double precision,
  created_at timestamptz not null default now(),
  primary key (chunk_id, personality_id),
  check (relevance_score is null or relevance_score between 0 and 1),
  check (confidence is null or confidence between 0 and 1),
  check (tagging_method in ('manual', 'ai', 'rule'))
);

create table if not exists public.chunk_parameter_fields (
  chunk_id uuid not null references public.source_chunks(id) on delete cascade,
  parameter_field_id uuid not null references public.parameter_fields(id) on delete cascade,
  confidence double precision,
  tagging_method text not null default 'manual',
  created_at timestamptz not null default now(),
  primary key (chunk_id, parameter_field_id),
  check (confidence is null or confidence between 0 and 1),
  check (tagging_method in ('manual', 'ai', 'rule'))
);

create table if not exists public.candidate_claims (
  id uuid primary key default gen_random_uuid(),
  personality_id uuid not null references public.personalities(id) on delete cascade,
  parameter_field_id uuid references public.parameter_fields(id) on delete set null,
  source_chunk_id uuid not null references public.source_chunks(id) on delete cascade,
  claim_text text not null check (length(btrim(claim_text)) > 0),
  normalized_claim_text text generated always as (
    btrim(regexp_replace(lower(claim_text), '[^a-z0-9]+', ' ', 'g'))
  ) stored,
  claim_kind text not null default 'traditional_account',
  certainty text not null default 'unknown',
  extraction_confidence double precision,
  extraction_note text,
  status text not null default 'pending',
  duplicate_of_claim_id uuid references public.claims(id) on delete set null,
  accepted_claim_id uuid references public.claims(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  check (extraction_confidence is null or extraction_confidence between 0 and 1),
  check (status in ('pending', 'needs_review', 'accepted', 'rejected', 'duplicate'))
);

create table if not exists public.claim_chunks (
  claim_id uuid not null references public.claims(id) on delete cascade,
  chunk_id uuid not null references public.source_chunks(id) on delete cascade,
  relationship text not null default 'supports',
  created_at timestamptz not null default now(),
  primary key (claim_id, chunk_id),
  check (relationship in ('supports', 'contradicts', 'context'))
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  event_type text,
  chronology_label text,
  textual_layer text,
  review_status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (review_status in ('draft', 'needs_review', 'approved', 'rejected'))
);

create table if not exists public.event_personalities (
  event_id uuid not null references public.events(id) on delete cascade,
  personality_id uuid not null references public.personalities(id) on delete cascade,
  role text not null default 'participant',
  created_at timestamptz not null default now(),
  primary key (event_id, personality_id, role)
);

create table if not exists public.event_chunks (
  event_id uuid not null references public.events(id) on delete cascade,
  chunk_id uuid not null references public.source_chunks(id) on delete cascade,
  relationship text not null default 'evidence',
  created_at timestamptz not null default now(),
  primary key (event_id, chunk_id)
);

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  subject_personality_id uuid not null references public.personalities(id) on delete cascade,
  object_personality_id uuid references public.personalities(id) on delete set null,
  object_name text,
  relationship_type text not null,
  description text not null,
  textual_layer text,
  review_status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (object_personality_id is not null or length(btrim(coalesce(object_name, ''))) > 0),
  check (review_status in ('draft', 'needs_review', 'approved', 'rejected'))
);

create table if not exists public.relationship_chunks (
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  chunk_id uuid not null references public.source_chunks(id) on delete cascade,
  relationship text not null default 'evidence',
  created_at timestamptz not null default now(),
  primary key (relationship_id, chunk_id)
);

create index if not exists sources_ingestion_status_idx on public.sources(ingestion_status);
create index if not exists sources_content_hash_idx on public.sources(content_hash) where content_hash is not null;
create index if not exists sources_url_idx on public.sources(url) where url is not null;
create index if not exists source_chunks_source_idx on public.source_chunks(source_id, is_active, chunk_index);
create index if not exists source_chunks_text_idx on public.source_chunks using gin(search_document);
create index if not exists source_chunks_layer_idx on public.source_chunks(textual_layer) where textual_layer is not null;
create index if not exists source_chunks_embedding_idx on public.source_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null and is_active;
create index if not exists chunk_personalities_personality_idx on public.chunk_personalities(personality_id, chunk_id);
create index if not exists chunk_parameter_fields_field_idx on public.chunk_parameter_fields(parameter_field_id, chunk_id);
create index if not exists candidate_claims_queue_idx on public.candidate_claims(personality_id, status, created_at);
create index if not exists candidate_claims_normalized_idx on public.candidate_claims(personality_id, normalized_claim_text);
create index if not exists candidate_claims_chunk_idx on public.candidate_claims(source_chunk_id);
create index if not exists claim_chunks_chunk_idx on public.claim_chunks(chunk_id, claim_id);
create index if not exists events_review_idx on public.events(review_status, textual_layer);
create index if not exists event_personalities_personality_idx on public.event_personalities(personality_id, event_id);
create index if not exists event_chunks_chunk_idx on public.event_chunks(chunk_id, event_id);
create index if not exists relationships_subject_idx on public.relationships(subject_personality_id, review_status);
create index if not exists relationships_object_idx on public.relationships(object_personality_id) where object_personality_id is not null;
create index if not exists relationship_chunks_chunk_idx on public.relationship_chunks(chunk_id, relationship_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists source_chunks_set_updated_at on public.source_chunks;
create trigger source_chunks_set_updated_at
before update on public.source_chunks
for each row execute function public.set_updated_at();

drop trigger if exists sources_set_updated_at on public.sources;
create trigger sources_set_updated_at
before update on public.sources
for each row execute function public.set_updated_at();

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists relationships_set_updated_at on public.relationships;
create trigger relationships_set_updated_at
before update on public.relationships
for each row execute function public.set_updated_at();

create or replace function public.search_source_chunks_lexical(
  query_text text,
  personality_uuid uuid,
  parameter_field_uuids uuid[] default null,
  textual_layers text[] default null,
  max_results integer default 30
)
returns table (
  chunk_id uuid,
  source_id uuid,
  chunk_text text,
  section_title text,
  page_or_section text,
  textual_layer text,
  metadata jsonb,
  source_title text,
  source_author text,
  source_institution text,
  source_url text,
  source_type text,
  source_status text,
  lexical_score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    sc.id,
    sc.source_id,
    sc.chunk_text,
    sc.section_title,
    sc.page_or_section,
    sc.textual_layer,
    sc.metadata,
    s.title,
    s.author,
    s.publisher_or_institution,
    s.url,
    s.source_type,
    s.source_status,
    (
      ts_rank_cd(sc.search_document, websearch_to_tsquery('simple', query_text)) +
      case when lower(sc.chunk_text) like '%' || lower(query_text) || '%' then 1 else 0 end
    )::double precision as lexical_score
  from public.source_chunks sc
  join public.sources s on s.id = sc.source_id
  where sc.is_active
    and s.source_status = 'approved'
    and exists (
      select 1 from public.chunk_personalities cp
      where cp.chunk_id = sc.id and cp.personality_id = personality_uuid
    )
    and (
      parameter_field_uuids is null
      or cardinality(parameter_field_uuids) = 0
      or exists (
        select 1 from public.chunk_parameter_fields cpf
        where cpf.chunk_id = sc.id and cpf.parameter_field_id = any(parameter_field_uuids)
      )
    )
    and (
      textual_layers is null
      or cardinality(textual_layers) = 0
      or sc.textual_layer = any(textual_layers)
    )
    and (
      sc.search_document @@ websearch_to_tsquery('simple', query_text)
      or lower(sc.chunk_text) like '%' || lower(query_text) || '%'
    )
  order by lexical_score desc, sc.chunk_index
  limit least(greatest(max_results, 1), 100);
$$;

create or replace function public.search_source_chunks_vector(
  query_embedding extensions.vector(768),
  personality_uuid uuid,
  parameter_field_uuids uuid[] default null,
  textual_layers text[] default null,
  max_results integer default 30,
  min_similarity double precision default 0.20
)
returns table (
  chunk_id uuid,
  source_id uuid,
  chunk_text text,
  section_title text,
  page_or_section text,
  textual_layer text,
  metadata jsonb,
  source_title text,
  source_author text,
  source_institution text,
  source_url text,
  source_type text,
  source_status text,
  semantic_score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    sc.id,
    sc.source_id,
    sc.chunk_text,
    sc.section_title,
    sc.page_or_section,
    sc.textual_layer,
    sc.metadata,
    s.title,
    s.author,
    s.publisher_or_institution,
    s.url,
    s.source_type,
    s.source_status,
    (1 - (sc.embedding <=> query_embedding))::double precision as semantic_score
  from public.source_chunks sc
  join public.sources s on s.id = sc.source_id
  where sc.is_active
    and sc.embedding is not null
    and sc.embedding_status = 'ready'
    and s.source_status = 'approved'
    and exists (
      select 1 from public.chunk_personalities cp
      where cp.chunk_id = sc.id and cp.personality_id = personality_uuid
    )
    and (
      parameter_field_uuids is null
      or cardinality(parameter_field_uuids) = 0
      or exists (
        select 1 from public.chunk_parameter_fields cpf
        where cpf.chunk_id = sc.id and cpf.parameter_field_id = any(parameter_field_uuids)
      )
    )
    and (
      textual_layers is null
      or cardinality(textual_layers) = 0
      or sc.textual_layer = any(textual_layers)
    )
    and (1 - (sc.embedding <=> query_embedding)) >= min_similarity
  order by sc.embedding <=> query_embedding
  limit least(greatest(max_results, 1), 100);
$$;

create or replace function public.accept_candidate_claim(
  candidate_uuid uuid,
  reviewer text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_record public.candidate_claims%rowtype;
  chunk_record public.source_chunks%rowtype;
  new_claim_id uuid;
begin
  select * into candidate_record
  from public.candidate_claims
  where id = candidate_uuid
  for update;

  if not found then
    raise exception 'Candidate claim not found';
  end if;

  if candidate_record.status not in ('pending', 'needs_review') then
    raise exception 'Candidate claim is not reviewable';
  end if;

  select * into chunk_record
  from public.source_chunks
  where id = candidate_record.source_chunk_id;

  insert into public.claims (
    personality_id,
    parameter_field_id,
    claim_text,
    claim_kind,
    certainty,
    review_status,
    researcher_notes
  ) values (
    candidate_record.personality_id,
    candidate_record.parameter_field_id,
    candidate_record.claim_text,
    candidate_record.claim_kind,
    candidate_record.certainty,
    'needs_review',
    'Accepted from corpus candidate by ' || reviewer
  ) returning id into new_claim_id;

  insert into public.claim_sources (
    claim_id,
    source_id,
    relationship,
    evidence_excerpt,
    page_or_section
  ) values (
    new_claim_id,
    chunk_record.source_id,
    'supports',
    left(chunk_record.chunk_text, 4000),
    chunk_record.page_or_section
  );

  insert into public.claim_chunks (claim_id, chunk_id, relationship)
  values (new_claim_id, chunk_record.id, 'supports');

  update public.candidate_claims
  set status = 'accepted',
      accepted_claim_id = new_claim_id,
      reviewed_at = now(),
      reviewed_by = reviewer
  where id = candidate_uuid;

  return new_claim_id;
end;
$$;

alter table public.source_chunks enable row level security;
alter table public.chunk_personalities enable row level security;
alter table public.chunk_parameter_fields enable row level security;
alter table public.candidate_claims enable row level security;
alter table public.claim_chunks enable row level security;
alter table public.events enable row level security;
alter table public.event_personalities enable row level security;
alter table public.event_chunks enable row level security;
alter table public.relationships enable row level security;
alter table public.relationship_chunks enable row level security;

revoke all on public.source_chunks from anon, authenticated;
revoke all on public.chunk_personalities from anon, authenticated;
revoke all on public.chunk_parameter_fields from anon, authenticated;
revoke all on public.candidate_claims from anon, authenticated;
revoke all on public.claim_chunks from anon, authenticated;
revoke all on public.events from anon, authenticated;
revoke all on public.event_personalities from anon, authenticated;
revoke all on public.event_chunks from anon, authenticated;
revoke all on public.relationships from anon, authenticated;
revoke all on public.relationship_chunks from anon, authenticated;
revoke execute on function public.search_source_chunks_lexical(text, uuid, uuid[], text[], integer) from public, anon, authenticated;
revoke execute on function public.search_source_chunks_vector(extensions.vector, uuid, uuid[], text[], integer, double precision) from public, anon, authenticated;
revoke execute on function public.accept_candidate_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.search_source_chunks_lexical(text, uuid, uuid[], text[], integer) to service_role;
grant execute on function public.search_source_chunks_vector(extensions.vector, uuid, uuid[], text[], integer, double precision) to service_role;
grant execute on function public.accept_candidate_claim(uuid, text) to service_role;
