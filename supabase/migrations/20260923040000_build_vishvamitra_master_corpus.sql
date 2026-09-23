-- Vishvamitra benchmark-corpus approvals and provenance tooling.
-- This migration is intentionally narrow: it only touches the Vishvamitra
-- personality and sources already linked to its claims on an explicit
-- institutional/project-aligned domain allowlist. Explicit rejections remain
-- unchanged. Every status change is recorded with its previous value.

create table if not exists public.corpus_change_batches (
  id uuid primary key default gen_random_uuid(),
  batch_key text not null unique,
  purpose text not null,
  actor text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.corpus_change_audit (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.corpus_change_batches(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  previous_state jsonb not null,
  new_state jsonb not null,
  reason text not null,
  actor text not null,
  created_at timestamptz not null default now(),
  unique (batch_id, entity_type, entity_id, action)
);

create index if not exists corpus_change_audit_entity_idx
  on public.corpus_change_audit(entity_type, entity_id, created_at desc);

alter table public.corpus_change_batches enable row level security;
alter table public.corpus_change_audit enable row level security;
revoke all on public.corpus_change_batches from anon, authenticated;
revoke all on public.corpus_change_audit from anon, authenticated;

alter table public.claims
  add column if not exists approval_metadata jsonb not null default '{}'::jsonb;

alter table public.claim_chunks
  add column if not exists confidence double precision,
  add column if not exists link_method text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.claim_chunks
  drop constraint if exists claim_chunks_confidence_check;
alter table public.claim_chunks
  add constraint claim_chunks_confidence_check
  check (confidence is null or confidence between 0 and 1);

insert into public.corpus_change_batches(batch_key, purpose, actor, metadata)
values (
  'vishvamitra-master-corpus-2026-09-23',
  'Build an auditable Vishvamitra benchmark corpus for internal retrieval testing.',
  'system_test_bulk_approval',
  jsonb_build_object(
    'testing_only', true,
    'reversible', true,
    'policy', 'Approve non-rejected claims and only linked institutional/project-aligned sources.'
  )
)
on conflict (batch_key) do nothing;

-- Record claim state before changing it. Rejected claims are excluded.
insert into public.corpus_change_audit(
  batch_id, entity_type, entity_id, action, previous_state, new_state, reason, actor
)
select
  b.id,
  'claim',
  c.id,
  'bulk_test_approval',
  jsonb_build_object(
    'review_status', c.review_status,
    'approval_metadata', c.approval_metadata,
    'researcher_notes', c.researcher_notes
  ),
  jsonb_build_object(
    'review_status', 'approved',
    'approval_batch_key', b.batch_key,
    'testing_only', true
  ),
  'Bulk approved for corpus testing; prior state retained in this audit record.',
  b.actor
from public.claims c
join public.personalities p on p.id = c.personality_id
cross join public.corpus_change_batches b
where p.canonical_name = 'Vishvamitra'
  and c.review_status <> 'rejected'
  and c.review_status <> 'approved'
  and b.batch_key = 'vishvamitra-master-corpus-2026-09-23'
on conflict (batch_id, entity_type, entity_id, action) do nothing;

-- Preserve the ordinary review trail as well as the batch audit trail.
insert into public.claim_reviews(claim_id, reviewer_name, decision, notes, reviewed_at)
select
  c.id,
  'system_test_bulk_approval',
  'approved',
  'Bulk approved for corpus testing; see corpus_change_audit batch vishvamitra-master-corpus-2026-09-23.',
  now()
from public.claims c
join public.personalities p on p.id = c.personality_id
where p.canonical_name = 'Vishvamitra'
  and c.review_status <> 'rejected'
  and not exists (
    select 1
    from public.claim_reviews cr
    where cr.claim_id = c.id
      and cr.reviewer_name = 'system_test_bulk_approval'
      and cr.decision = 'approved'
  );

update public.claims c
set
  review_status = 'approved',
  approval_metadata = c.approval_metadata || jsonb_build_object(
    'testing_only', true,
    'approval_actor', 'system_test_bulk_approval',
    'approval_reason', 'bulk approved for corpus testing',
    'approval_batch_key', 'vishvamitra-master-corpus-2026-09-23',
    'approved_at', now()
  ),
  updated_at = now()
from public.personalities p
where p.id = c.personality_id
  and p.canonical_name = 'Vishvamitra'
  and c.review_status <> 'rejected';

-- A source qualifies only when it is already linked to Vishvamitra and belongs
-- to one of these explicit institutional or project-aligned repositories.
create or replace function public.is_vishvamitra_benchmark_source(source_uuid uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.sources s
    join public.claim_sources cs on cs.source_id = s.id
    join public.claims c on c.id = cs.claim_id
    join public.personalities p on p.id = c.personality_id
    where s.id = source_uuid
      and p.canonical_name = 'Vishvamitra'
      and s.source_status <> 'rejected'
      and (
        s.publisher_or_institution = 'Dharma Civilization Foundation'
        or lower(coalesce(s.url, '')) ~ '^https://([a-z0-9-]+\.)?(vedicheritage\.gov\.in|ignca\.gov\.in|valmiki\.iitk\.ac\.in|valmikiramayan\.net|sriaurobindoashram\.org|vedapath\.app)(/|$)'
      )
  );
$$;

insert into public.corpus_change_audit(
  batch_id, entity_type, entity_id, action, previous_state, new_state, reason, actor
)
select
  b.id,
  'source',
  s.id,
  'bulk_test_approval',
  jsonb_build_object('source_status', s.source_status, 'metadata', s.metadata, 'notes', s.notes),
  jsonb_build_object(
    'source_status', 'approved',
    'approval_batch_key', b.batch_key,
    'testing_only', true,
    'allow_ingestion', true
  ),
  'Linked Vishvamitra source on the explicit institutional/project repository allowlist; bulk approved for corpus testing.',
  b.actor
from public.sources s
cross join public.corpus_change_batches b
where public.is_vishvamitra_benchmark_source(s.id)
  and s.source_status <> 'approved'
  and b.batch_key = 'vishvamitra-master-corpus-2026-09-23'
on conflict (batch_id, entity_type, entity_id, action) do nothing;

update public.sources s
set
  source_status = 'approved',
  metadata = s.metadata || jsonb_build_object(
    'testing_only', true,
    'approval_actor', 'system_test_bulk_approval',
    'approval_reason', 'bulk approved for corpus testing',
    'approval_batch_key', 'vishvamitra-master-corpus-2026-09-23',
    'approved_at', now()
  ),
  notes = case
    when coalesce(s.notes, '') ilike '%bulk approved for corpus testing%' then s.notes
    when nullif(btrim(s.notes), '') is null then 'Bulk approved for corpus testing.'
    else s.notes || E'\nBulk approved for corpus testing.'
  end,
  updated_at = now()
where public.is_vishvamitra_benchmark_source(s.id);

-- Exact-URL scopes preserve the approved-source firewall. These scopes do not
-- authorize domain-wide crawling or sitemap search.
insert into public.approved_source_access(
  display_name,
  domain,
  scope_type,
  exact_url,
  include_subdomains,
  allow_live_search,
  allow_live_fetch,
  allow_ingestion,
  evidence_use_status,
  priority,
  default_textual_layer,
  default_source_type,
  cache_ttl_hours,
  is_active,
  notes
)
select
  left('Vishvamitra corpus — ' || s.title, 240),
  lower(regexp_replace(s.url, '^https?://([^/]+).*$','\1')),
  'EXACT_URL',
  s.url,
  false,
  false,
  true,
  true,
  'approved',
  20,
  coalesce(s.textual_layer,
    case
      when s.url ilike '%rigveda%' then 'Rigveda — Mandala 3'
      when s.url ilike '%ramayan%' or s.url ilike '%baala%' then 'Ramayana — Bala Kanda'
      when s.url ilike '%mahabharata%' then 'Mahabharata tradition'
      when s.publisher_or_institution ilike '%Aurobindo%' then 'Modern spiritual interpretation'
      else 'Traditional or scholarly source'
    end
  ),
  s.source_type,
  720,
  true,
  'Exact URL bulk approved for Vishvamitra corpus testing by system_test_bulk_approval; no broader web access granted.'
from public.sources s
where public.is_vishvamitra_benchmark_source(s.id)
  and s.url is not null
  and s.source_status = 'approved'
on conflict (
  domain,
  scope_type,
  (coalesce(allowed_path_prefix, '')),
  (coalesce(exact_url, ''))
) do update set
  allow_live_fetch = true,
  allow_ingestion = true,
  evidence_use_status = case
    when approved_source_access.evidence_use_status = 'rejected' then 'rejected'
    else 'approved'
  end,
  is_active = case
    when approved_source_access.evidence_use_status = 'rejected' then approved_source_access.is_active
    else true
  end,
  notes = case
    when approved_source_access.evidence_use_status = 'rejected' then approved_source_access.notes
    else concat_ws(E'\n', nullif(approved_source_access.notes, ''), 'Bulk approved for Vishvamitra corpus testing by system_test_bulk_approval.')
  end,
  updated_at = now();

-- Backfill only within a claim's already-curated source links. A link must have
-- a section match, excerpt match, or defensible lexical overlap. At most two
-- chunks per claim are linked in one run.
create or replace function public.backfill_vishvamitra_claim_chunks(
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
  if minimum_confidence < 0.5 or minimum_confidence > 1 then
    raise exception 'minimum_confidence must be between 0.5 and 1';
  end if;
  if maximum_links_per_claim < 1 or maximum_links_per_claim > 5 then
    raise exception 'maximum_links_per_claim must be between 1 and 5';
  end if;

  with candidate_pairs as (
    select
      c.id as claim_id,
      sc.id as chunk_id,
      case
        when length(btrim(coalesce(cs.page_or_section, ''))) >= 4
          and (
            lower(regexp_replace(coalesce(sc.page_or_section, ''), '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) || '%'
            or lower(regexp_replace(coalesce(sc.section_title, ''), '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) || '%'
            or lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(coalesce(sc.page_or_section, ''), '[^a-z0-9]+', '', 'g')) || '%'
          ) then 0.99
        when length(btrim(coalesce(cs.evidence_excerpt, ''))) >= 20
          and lower(regexp_replace(sc.chunk_text, '[^a-z0-9]+', ' ', 'g')) like '%' || left(lower(regexp_replace(cs.evidence_excerpt, '[^a-z0-9]+', ' ', 'g')), 120) || '%'
          then 0.97
        when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', coalesce(cs.evidence_excerpt, ''))) >= 0.08 then 0.92
        when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', c.claim_text)) >= 0.08 then 0.86
        when counts.active_chunk_count = 1 then 0.74
        else 0.0
      end as confidence,
      case
        when length(btrim(coalesce(cs.page_or_section, ''))) >= 4
          and (
            lower(regexp_replace(coalesce(sc.page_or_section, ''), '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) || '%'
            or lower(regexp_replace(coalesce(sc.section_title, ''), '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) || '%'
            or lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(coalesce(sc.page_or_section, ''), '[^a-z0-9]+', '', 'g')) || '%'
          ) then 'section_metadata'
        when length(btrim(coalesce(cs.evidence_excerpt, ''))) >= 20
          and lower(regexp_replace(sc.chunk_text, '[^a-z0-9]+', ' ', 'g')) like '%' || left(lower(regexp_replace(cs.evidence_excerpt, '[^a-z0-9]+', ' ', 'g')), 120) || '%'
          then 'exact_excerpt'
        when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', coalesce(cs.evidence_excerpt, ''))) >= 0.08 then 'excerpt_lexical'
        when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', c.claim_text)) >= 0.08 then 'claim_lexical'
        when counts.active_chunk_count = 1 then 'single_chunk_curated_source'
        else 'unmatched'
      end as link_method,
      row_number() over (
        partition by c.id
        order by
          case
            when length(btrim(coalesce(cs.page_or_section, ''))) >= 4 and (
              lower(regexp_replace(coalesce(sc.page_or_section, ''), '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) || '%'
              or lower(regexp_replace(coalesce(sc.section_title, ''), '[^a-z0-9]+', '', 'g')) like '%' || lower(regexp_replace(cs.page_or_section, '[^a-z0-9]+', '', 'g')) || '%'
            ) then 4
            when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', coalesce(cs.evidence_excerpt, ''))) >= 0.08 then 3
            when ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', c.claim_text)) >= 0.08 then 2
            when counts.active_chunk_count = 1 then 1
            else 0
          end desc,
          ts_rank_cd(sc.retrieval_document, plainto_tsquery('simple', coalesce(cs.evidence_excerpt, c.claim_text))) desc,
          sc.chunk_index
      ) as rank_for_claim,
      cs.id as claim_source_id
    from public.claims c
    join public.personalities p on p.id = c.personality_id
    join public.claim_sources cs on cs.claim_id = c.id and cs.relationship = 'supports'
    join public.sources s on s.id = cs.source_id and s.source_status = 'approved'
    join public.source_chunks sc on sc.source_id = s.id and sc.is_active
    join public.chunk_personalities cp on cp.chunk_id = sc.id and cp.personality_id = c.personality_id
    join lateral (
      select count(*)::integer as active_chunk_count
      from public.source_chunks sc_count
      where sc_count.source_id = s.id and sc_count.is_active
    ) counts on true
    where p.canonical_name = 'Vishvamitra'
      and c.review_status = 'approved'
  ),
  selected as (
    select *
    from candidate_pairs
    where confidence >= minimum_confidence
      and rank_for_claim <= maximum_links_per_claim
  ),
  upserted as (
    insert into public.claim_chunks(claim_id, chunk_id, relationship, confidence, link_method, metadata)
    select
      claim_id,
      chunk_id,
      'supports',
      confidence,
      link_method,
      jsonb_build_object(
        'claim_source_id', claim_source_id,
        'backfill_batch_key', 'vishvamitra-master-corpus-2026-09-23',
        'backfilled_by', 'system_test_bulk_approval'
      )
    from selected
    on conflict (claim_id, chunk_id) do update set
      confidence = greatest(coalesce(claim_chunks.confidence, 0), excluded.confidence),
      link_method = coalesce(claim_chunks.link_method, excluded.link_method),
      metadata = claim_chunks.metadata || excluded.metadata
    returning claim_id
  )
  select count(*), count(distinct claim_id) into affected, linked from upserted;

  return query select affected, linked;
end;
$$;

revoke execute on function public.backfill_vishvamitra_claim_chunks(double precision, integer) from public, anon, authenticated;
grant execute on function public.backfill_vishvamitra_claim_chunks(double precision, integer) to service_role;

comment on table public.corpus_change_audit is
  'Append-only service-role audit log for bulk corpus changes; previous_state supports deliberate reversal.';
comment on function public.backfill_vishvamitra_claim_chunks(double precision, integer) is
  'Creates bounded, confidence-labelled claim-to-passage links only inside existing curated Vishvamitra claim-source relationships.';
