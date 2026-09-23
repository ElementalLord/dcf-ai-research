-- General trust metadata and reusable personality-corpus configuration.

alter table public.claims
  add column if not exists approval_origin text not null default 'imported_existing',
  add column if not exists approval_batch_id uuid references public.corpus_change_batches(id) on delete set null,
  add column if not exists approval_note text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_label text,
  add column if not exists evidence_type text not null default 'uncertain';

alter table public.sources
  add column if not exists approval_origin text not null default 'imported_existing',
  add column if not exists approval_batch_id uuid references public.corpus_change_batches(id) on delete set null,
  add column if not exists approval_note text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_label text;

alter table public.approved_source_access
  add column if not exists approval_origin text not null default 'imported_existing',
  add column if not exists approval_batch_id uuid references public.corpus_change_batches(id) on delete set null,
  add column if not exists approval_note text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_label text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'claims_approval_origin_check') then
    alter table public.claims add constraint claims_approval_origin_check
      check (approval_origin in ('human_manual', 'mentor_review', 'system_test_bulk', 'imported_existing', 'ai_candidate'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sources_approval_origin_check') then
    alter table public.sources add constraint sources_approval_origin_check
      check (approval_origin in ('human_manual', 'mentor_review', 'system_test_bulk', 'imported_existing', 'ai_candidate'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'approved_source_access_approval_origin_check') then
    alter table public.approved_source_access add constraint approved_source_access_approval_origin_check
      check (approval_origin in ('human_manual', 'mentor_review', 'system_test_bulk', 'imported_existing', 'ai_candidate'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'claims_evidence_type_check') then
    alter table public.claims add constraint claims_evidence_type_check
      check (evidence_type in ('direct_primary_text', 'traditional_narrative', 'scholarly_interpretation', 'modern_spiritual_interpretation', 'historical_inference', 'contested', 'uncertain'));
  end if;
end
$$;

create index if not exists claims_personality_review_origin_idx
  on public.claims(personality_id, review_status, approval_origin);
create index if not exists sources_status_origin_idx
  on public.sources(source_status, approval_origin);

create table if not exists public.personality_aliases (
  id uuid primary key default gen_random_uuid(),
  personality_id uuid not null references public.personalities(id) on delete cascade,
  alias text not null check (length(btrim(alias)) > 0),
  alias_type text not null default 'alternate_name',
  confidence double precision not null default 1 check (confidence between 0 and 1),
  is_ambiguous boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  check (alias_type in ('canonical', 'alternate_name', 'transliteration', 'epithet', 'lineage_label'))
);
create unique index if not exists personality_aliases_unique
  on public.personality_aliases(personality_id, lower(alias));
create index if not exists personality_aliases_lookup_idx
  on public.personality_aliases(lower(alias), personality_id);

create table if not exists public.research_term_aliases (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete cascade,
  canonical_term text not null,
  alias text not null,
  confidence double precision not null default 1 check (confidence between 0 and 1),
  notes text,
  created_at timestamptz not null default now()
);
create unique index if not exists research_term_aliases_unique
  on public.research_term_aliases(coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(alias));

create table if not exists public.source_personalities (
  source_id uuid not null references public.sources(id) on delete cascade,
  personality_id uuid not null references public.personalities(id) on delete cascade,
  relationship text not null default 'relevant',
  confidence double precision check (confidence between 0 and 1),
  mapping_method text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (source_id, personality_id),
  check (mapping_method in ('manual', 'claim_link', 'chunk_tag', 'ai'))
);
create index if not exists source_personalities_personality_idx
  on public.source_personalities(personality_id, source_id);

alter table public.personality_aliases enable row level security;
alter table public.research_term_aliases enable row level security;
alter table public.source_personalities enable row level security;
revoke all on public.personality_aliases from anon, authenticated;
revoke all on public.research_term_aliases from anon, authenticated;
revoke all on public.source_personalities from anon, authenticated;

alter table public.parameters
  add column if not exists routing_hints text[] not null default '{}'::text[];

insert into public.personality_aliases(personality_id, alias, alias_type, confidence, notes)
select id, canonical_name, 'canonical', 1, 'Canonical name migrated into the reusable alias registry.'
from public.personalities
on conflict do nothing;

insert into public.personality_aliases(personality_id, alias, alias_type, confidence, notes)
select p.id, alias, 'alternate_name', 0.95, 'Alternate name migrated from personalities.alternate_names.'
from public.personalities p
cross join lateral unnest(coalesce(p.alternate_names, '{}'::text[])) alias
on conflict do nothing;

insert into public.personality_aliases(personality_id, alias, alias_type, confidence, is_ambiguous, notes)
select p.id, seeded.alias, seeded.alias_type, seeded.confidence, seeded.is_ambiguous, seeded.notes
from public.personalities p
cross join (values
  ('Gathina Vishvamitra', 'epithet', 0.95::double precision, false, 'Patronymic name used in source material.'),
  ('Gathina Visvamitra', 'transliteration', 0.95::double precision, false, 'Transliteration variant.'),
  ('Kaushika', 'lineage_label', 0.65::double precision, true, 'Lineage label; match cautiously because it may not uniquely identify one individual.'),
  ('Kausika', 'lineage_label', 0.65::double precision, true, 'Lineage label; match cautiously because it may not uniquely identify one individual.'),
  ('Kauśika', 'lineage_label', 0.65::double precision, true, 'Lineage label; match cautiously because it may not uniquely identify one individual.')
) seeded(alias, alias_type, confidence, is_ambiguous, notes)
where lower(p.canonical_name) = 'vishvamitra'
on conflict do nothing;

insert into public.research_term_aliases(category_id, canonical_term, alias, confidence, notes)
select c.id, 'vasistha', alias, 1, 'Transliteration family used for relationship retrieval.'
from public.categories c
cross join unnest(array['vasistha', 'vashishta', 'vasishtha', 'vasista', 'vashista']) alias
where c.slug = 'rishi'
on conflict do nothing;

update public.parameters p
set routing_hints = case p.code
  when 'textual_contribution' then array['text','hymn','rigveda','rigvedic','veda','mandala','sukta','verse','mantra','river']
  when 'tapas_sadhana' then array['tapas','austerity','ascetic','discipline','sadhana','transformation']
  when 'philosophy' then array['philosophy','teaching','doctrine','metaphysical','spiritual meaning','river','rivers']
  when 'parampara' then array['lineage','gotra','disciple','guru','teacher','student']
  when 'inner_qualities' then array['virtue','character','anger','compassion','quality']
  when 'social_role' then array['relationship','rival','teacher','guide','king']
  when 'historical_context' then array['historical','layer','vedic','epic','chronology','era','differ']
  when 'contested' then array['conflict','variant','contested','uncertain','same name','myth','history']
  when 'contemporary_relevance' then array['modern','today','contemporary','ecological']
  when 'role' then array['role','rishi','sage','king']
  else routing_hints
end
where exists (select 1 from public.categories c where c.id = p.category_id and c.slug = 'rishi');

insert into public.source_personalities(source_id, personality_id, relationship, confidence, mapping_method)
select sc.source_id, cp.personality_id, 'relevant', max(greatest(coalesce(cp.confidence, 0.8), 0.8)), 'chunk_tag'
from public.chunk_personalities cp
join public.source_chunks sc on sc.id = cp.chunk_id
group by sc.source_id, cp.personality_id
on conflict (source_id, personality_id) do update set
  confidence = greatest(coalesce(source_personalities.confidence, 0), excluded.confidence);

insert into public.source_personalities(source_id, personality_id, relationship, confidence, mapping_method)
select distinct cs.source_id, c.personality_id, 'supports_claims', 1, 'claim_link'
from public.claim_sources cs
join public.claims c on c.id = cs.claim_id
on conflict (source_id, personality_id) do update set
  confidence = greatest(coalesce(source_personalities.confidence, 0), excluded.confidence),
  relationship = 'supports_claims',
  mapping_method = 'claim_link';

update public.claims c
set approval_origin = 'system_test_bulk',
    approval_batch_id = b.id,
    approval_note = 'Bulk-approved for internal retrieval benchmark testing; not equivalent to mentor sign-off.',
    approved_at = coalesce(c.approved_at, c.updated_at, now()),
    approved_by_label = 'system_test_bulk_approval'
from public.corpus_change_batches b
where b.batch_key = c.approval_metadata->>'approval_batch_key'
  and b.batch_key = 'vishvamitra-master-corpus-2026-09-23';

update public.claims
set approved_at = coalesce(approved_at, updated_at, now()),
    approved_by_label = coalesce(approved_by_label, 'imported_existing')
where review_status = 'approved' and approval_origin = 'imported_existing';

update public.claims
set evidence_type = case claim_kind
  when 'traditional_account' then 'traditional_narrative'
  when 'textual_tradition' then 'traditional_narrative'
  when 'scholarly_interpretation' then 'scholarly_interpretation'
  when 'contemporary_relevance' then 'modern_spiritual_interpretation'
  when 'contested' then 'contested'
  else 'uncertain'
end;

update public.sources s
set approval_origin = 'system_test_bulk',
    approval_batch_id = b.id,
    approval_note = 'Bulk-approved for internal retrieval benchmark testing; not equivalent to mentor sign-off.',
    approved_at = coalesce(s.approved_at, s.updated_at, now()),
    approved_by_label = 'system_test_bulk_approval'
from public.corpus_change_batches b
where b.batch_key = s.metadata->>'approval_batch_key'
  and b.batch_key = 'vishvamitra-master-corpus-2026-09-23';

update public.sources
set approved_at = coalesce(approved_at, updated_at, now()),
    approved_by_label = coalesce(approved_by_label, 'imported_existing')
where source_status = 'approved' and approval_origin = 'imported_existing';

update public.approved_source_access asa
set approval_origin = 'system_test_bulk',
    approval_batch_id = b.id,
    approval_note = 'Network access approved for internal benchmark testing; evidence acceptance remains separately controlled.',
    approved_at = coalesce(asa.approved_at, asa.updated_at, now()),
    approved_by_label = 'system_test_bulk_approval'
from public.corpus_change_batches b
where b.batch_key = 'vishvamitra-master-corpus-2026-09-23'
  and asa.notes ilike '%bulk approved%';

update public.approved_source_access
set approved_at = coalesce(approved_at, updated_at, now()),
    approved_by_label = coalesce(approved_by_label, 'imported_existing')
where evidence_use_status = 'approved' and approval_origin = 'imported_existing';

create or replace function public.tag_personality_chunks_from_claim_sources(personality_uuid uuid)
returns table (personality_tags_upserted bigint, parameter_tags_upserted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  personality_count bigint := 0;
  parameter_count bigint := 0;
begin
  if not exists (select 1 from public.personalities where id = personality_uuid) then
    raise exception 'Personality not found';
  end if;

  with inserted as (
    insert into public.chunk_personalities(chunk_id, personality_id, relationship, relevance_score, tagging_method, confidence)
    select distinct sc.id, c.personality_id, 'subject', 1, 'rule', 1
    from public.claims c
    join public.claim_sources cs on cs.claim_id = c.id
    join public.source_chunks sc on sc.source_id = cs.source_id and sc.is_active
    where c.personality_id = personality_uuid and c.review_status = 'approved'
    on conflict (chunk_id, personality_id) do update set
      relevance_score = greatest(coalesce(chunk_personalities.relevance_score, 0), excluded.relevance_score),
      confidence = greatest(coalesce(chunk_personalities.confidence, 0), excluded.confidence)
    returning 1
  ) select count(*) into personality_count from inserted;

  with inserted as (
    insert into public.chunk_parameter_fields(chunk_id, parameter_field_id, confidence, tagging_method)
    select distinct sc.id, c.parameter_field_id, 0.80, 'rule'
    from public.claims c
    join public.claim_sources cs on cs.claim_id = c.id
    join public.source_chunks sc on sc.source_id = cs.source_id and sc.is_active
    where c.personality_id = personality_uuid
      and c.review_status = 'approved'
      and c.parameter_field_id is not null
    on conflict (chunk_id, parameter_field_id) do update set
      confidence = greatest(coalesce(chunk_parameter_fields.confidence, 0), excluded.confidence)
    returning 1
  ) select count(*) into parameter_count from inserted;

  return query select personality_count, parameter_count;
end;
$$;

create or replace function public.backfill_personality_claim_chunks_overlap(
  personality_uuid uuid,
  minimum_matched_terms integer default 2,
  minimum_overlap_ratio double precision default 0.10,
  maximum_links_per_claim integer default 2
)
returns table (links_upserted bigint, claims_linked bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  affected bigint := 0;
  linked bigint := 0;
begin
  if minimum_matched_terms < 2 or minimum_matched_terms > 20 then raise exception 'minimum_matched_terms must be between 2 and 20'; end if;
  if minimum_overlap_ratio < 0.05 or minimum_overlap_ratio > 1 then raise exception 'minimum_overlap_ratio must be between 0.05 and 1'; end if;
  if maximum_links_per_claim < 1 or maximum_links_per_claim > 5 then raise exception 'maximum_links_per_claim must be between 1 and 5'; end if;

  with pairs as (
    select c.id claim_id, sc.id chunk_id, cs.id claim_source_id,
      overlap_counts.matched_terms, overlap_counts.total_terms,
      overlap_counts.matched_terms::double precision / nullif(overlap_counts.total_terms, 0) overlap_ratio,
      row_number() over (partition by c.id order by overlap_counts.matched_terms::double precision / nullif(overlap_counts.total_terms, 0) desc, overlap_counts.matched_terms desc, sc.chunk_index) rank_for_claim
    from public.claims c
    join public.claim_sources cs on cs.claim_id = c.id and cs.relationship = 'supports'
    join public.sources s on s.id = cs.source_id and s.source_status = 'approved'
    join public.source_chunks sc on sc.source_id = s.id and sc.is_active
    join public.chunk_personalities cp on cp.chunk_id = sc.id and cp.personality_id = c.personality_id
    join lateral (
      select count(*)::integer total_terms,
        count(*) filter (where position(' ' || term || ' ' in ' ' || lower(regexp_replace(sc.chunk_text, '[^a-z0-9]+', ' ', 'g')) || ' ') > 0)::integer matched_terms
      from (
        select distinct term
        from regexp_split_to_table(lower(regexp_replace(coalesce(cs.evidence_excerpt, '') || ' ' || c.claim_text, '[^a-z0-9]+', ' ', 'g')), '\s+') term
        where length(term) >= 4
          and term not in ('about','after','again','also','been','being','from','have','into','more','should','that','their','there','these','they','this','those','through','under','very','what','when','where','which','while','with','would')
          and not exists (
            select 1 from public.personality_aliases pa
            where pa.personality_id = personality_uuid and lower(regexp_replace(pa.alias, '[^a-z0-9]+', '', 'g')) = term
          )
      ) terms
    ) overlap_counts on overlap_counts.total_terms > 0
    where c.personality_id = personality_uuid and c.review_status = 'approved'
  ), selected as (
    select *, least(0.96, 0.76 + least(0.12, matched_terms * 0.02) + least(0.08, overlap_ratio * 0.20)) confidence
    from pairs
    where matched_terms >= minimum_matched_terms and overlap_ratio >= minimum_overlap_ratio and rank_for_claim <= maximum_links_per_claim
  ), upserted as (
    insert into public.claim_chunks(claim_id, chunk_id, relationship, confidence, link_method, metadata)
    select claim_id, chunk_id, 'supports', confidence, 'curated_source_token_overlap',
      jsonb_build_object('claim_source_id', claim_source_id, 'matched_terms', matched_terms, 'total_terms', total_terms, 'overlap_ratio', overlap_ratio, 'backfilled_by', 'generic_personality_pipeline')
    from selected
    on conflict (claim_id, chunk_id) do update set
      confidence = greatest(coalesce(claim_chunks.confidence, 0), excluded.confidence),
      link_method = case when coalesce(claim_chunks.confidence, 0) >= excluded.confidence then claim_chunks.link_method else excluded.link_method end,
      metadata = claim_chunks.metadata || excluded.metadata
    returning claim_id
  ) select count(*), count(distinct claim_id) into affected, linked from upserted;

  return query select affected, linked;
end;
$$;

create or replace function public.backfill_personality_claim_chunks(
  personality_uuid uuid,
  minimum_confidence double precision default 0.72,
  maximum_links_per_claim integer default 2
)
returns table (links_upserted bigint, claims_linked bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  affected bigint := 0;
  linked bigint := 0;
begin
  if minimum_confidence < 0.5 or minimum_confidence > 1 then raise exception 'minimum_confidence must be between 0.5 and 1'; end if;
  if maximum_links_per_claim < 1 or maximum_links_per_claim > 5 then raise exception 'maximum_links_per_claim must be between 1 and 5'; end if;

  with candidate_pairs as (
    select c.id claim_id, sc.id chunk_id, cs.id claim_source_id,
      case
        when length(btrim(coalesce(cs.page_or_section, ''))) >= 4 and (
          lower(regexp_replace(coalesce(sc.page_or_section, ''), '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) || '%'
          or lower(regexp_replace(coalesce(sc.section_title, ''), '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) || '%'
        ) then 0.99
        when length(btrim(coalesce(cs.evidence_excerpt, ''))) >= 20 and lower(regexp_replace(sc.chunk_text, '[^a-z0-9]+', ' ', 'g')) like '%' || left(lower(regexp_replace(cs.evidence_excerpt, '[^a-z0-9]+', ' ', 'g')), 120) || '%' then 0.97
        when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', coalesce(cs.evidence_excerpt, ''))) >= 0.08 then 0.92
        when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', c.claim_text)) >= 0.08 then 0.86
        when counts.active_chunk_count = 1 then 0.74
        else 0.0
      end confidence,
      case
        when length(btrim(coalesce(cs.page_or_section, ''))) >= 4 and (
          lower(regexp_replace(coalesce(sc.page_or_section, ''), '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) || '%'
          or lower(regexp_replace(coalesce(sc.section_title, ''), '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) || '%'
        ) then 'section_metadata'
        when length(btrim(coalesce(cs.evidence_excerpt, ''))) >= 20 and lower(regexp_replace(sc.chunk_text, '[^a-z0-9]+', ' ', 'g')) like '%' || left(lower(regexp_replace(cs.evidence_excerpt, '[^a-z0-9]+', ' ', 'g')), 120) || '%' then 'exact_excerpt'
        when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', coalesce(cs.evidence_excerpt, ''))) >= 0.08 then 'excerpt_lexical'
        when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', c.claim_text)) >= 0.08 then 'claim_lexical'
        when counts.active_chunk_count = 1 then 'single_chunk_curated_source'
        else 'unmatched'
      end link_method,
      row_number() over (partition by c.id order by
        case
          when length(btrim(coalesce(cs.page_or_section, ''))) >= 4 then 4
          when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', coalesce(cs.evidence_excerpt, ''))) >= 0.08 then 3
          when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', c.claim_text)) >= 0.08 then 2
          when counts.active_chunk_count = 1 then 1 else 0
        end desc,
        ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', coalesce(cs.evidence_excerpt, c.claim_text))) desc,
        sc.chunk_index) rank_for_claim
    from public.claims c
    join public.claim_sources cs on cs.claim_id = c.id and cs.relationship = 'supports'
    join public.sources s on s.id = cs.source_id and s.source_status = 'approved'
    join public.source_chunks sc on sc.source_id = s.id and sc.is_active
    join public.chunk_personalities cp on cp.chunk_id = sc.id and cp.personality_id = c.personality_id
    join lateral (select count(*)::integer active_chunk_count from public.source_chunks counted where counted.source_id = s.id and counted.is_active) counts on true
    where c.personality_id = personality_uuid and c.review_status = 'approved'
  ), selected as (
    select * from candidate_pairs where confidence >= minimum_confidence and rank_for_claim <= maximum_links_per_claim
  ), upserted as (
    insert into public.claim_chunks(claim_id, chunk_id, relationship, confidence, link_method, metadata)
    select claim_id, chunk_id, 'supports', confidence, link_method,
      jsonb_build_object('claim_source_id', claim_source_id, 'backfilled_by', 'generic_personality_pipeline')
    from selected
    on conflict (claim_id, chunk_id) do update set
      confidence = greatest(coalesce(claim_chunks.confidence, 0), excluded.confidence),
      link_method = case when coalesce(claim_chunks.confidence, 0) >= excluded.confidence then claim_chunks.link_method else excluded.link_method end,
      metadata = claim_chunks.metadata || excluded.metadata
    returning claim_id
  ) select count(*), count(distinct claim_id) into affected, linked from upserted;
  return query select affected, linked;
end;
$$;

revoke execute on function public.tag_personality_chunks_from_claim_sources(uuid) from public, anon, authenticated;
revoke execute on function public.backfill_personality_claim_chunks(uuid, double precision, integer) from public, anon, authenticated;
revoke execute on function public.backfill_personality_claim_chunks_overlap(uuid, integer, double precision, integer) from public, anon, authenticated;
grant execute on function public.tag_personality_chunks_from_claim_sources(uuid) to service_role;
grant execute on function public.backfill_personality_claim_chunks(uuid, double precision, integer) to service_role;
grant execute on function public.backfill_personality_claim_chunks_overlap(uuid, integer, double precision, integer) to service_role;

create or replace function public.accept_candidate_claim(candidate_uuid uuid, reviewer text)
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
  select * into candidate_record from public.candidate_claims where id = candidate_uuid for update;
  if not found then raise exception 'Candidate claim not found'; end if;
  if candidate_record.status not in ('pending', 'needs_review') then raise exception 'Candidate claim is not reviewable'; end if;
  select * into chunk_record from public.source_chunks where id = candidate_record.source_chunk_id;

  insert into public.claims(
    personality_id, parameter_field_id, claim_text, claim_kind, certainty,
    review_status, researcher_notes, approval_origin, evidence_type
  ) values (
    candidate_record.personality_id, candidate_record.parameter_field_id,
    candidate_record.claim_text, candidate_record.claim_kind, candidate_record.certainty,
    'needs_review', 'Accepted from corpus candidate by ' || reviewer, 'ai_candidate',
    case candidate_record.claim_kind
      when 'traditional_account' then 'traditional_narrative'
      when 'textual_tradition' then 'traditional_narrative'
      when 'scholarly_interpretation' then 'scholarly_interpretation'
      when 'contemporary_relevance' then 'modern_spiritual_interpretation'
      when 'contested' then 'contested'
      else 'uncertain'
    end
  ) returning id into new_claim_id;

  insert into public.claim_sources(claim_id, source_id, relationship, evidence_excerpt, page_or_section)
  values (new_claim_id, chunk_record.source_id, 'supports', left(chunk_record.chunk_text, 4000), chunk_record.page_or_section);
  insert into public.claim_chunks(claim_id, chunk_id, relationship, confidence, link_method, metadata)
  values (new_claim_id, chunk_record.id, 'supports', candidate_record.extraction_confidence, 'candidate_direct_chunk', jsonb_build_object('candidate_id', candidate_record.id));
  insert into public.source_personalities(source_id, personality_id, relationship, confidence, mapping_method)
  values (chunk_record.source_id, candidate_record.personality_id, 'supports_claims', 1, 'claim_link')
  on conflict (source_id, personality_id) do update set relationship = 'supports_claims', confidence = 1, mapping_method = 'claim_link';

  update public.candidate_claims
  set status = 'accepted', accepted_claim_id = new_claim_id, reviewed_at = now(), reviewed_by = reviewer
  where id = candidate_uuid;
  return new_claim_id;
end;
$$;

revoke execute on function public.accept_candidate_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_candidate_claim(uuid, text) to service_role;

comment on column public.sources.source_status is 'Source evidence status. Network access permission is controlled separately by approved_source_access.';
comment on column public.claims.approval_origin is 'Origin of claim approval; system_test_bulk is usable in test policy mode but is not mentor sign-off.';
comment on table public.personality_aliases is 'Data-driven names used for tagging and retrieval; ambiguous lineage labels are explicitly marked.';
comment on table public.source_personalities is 'Reusable many-to-many source mapping; one source record may support multiple personalities.';
