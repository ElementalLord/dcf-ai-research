-- Complete the one remaining curated claim-source gap with a verified exact
-- passage, and give source-first chunks a conservative fallback parameter tag.

with target_claim as (
  select c.id
  from public.claims c
  join public.personalities p on p.id = c.personality_id
  where p.canonical_name = 'Vishvamitra'
    and c.claim_text = 'In the Bala Kanda narrative, Vishvamitra is explicitly presented first as a kingly sage (rajarshi) before the culmination of his ascetic transformation.'
), target_source as (
  select id
  from public.sources
  where url = 'https://www.valmikiramayan.net/utf8/baala/sarga63/bala_63_prose.htm'
    and source_status = 'approved'
)
insert into public.claim_sources(
  claim_id, source_id, relationship, evidence_excerpt, page_or_section, notes
)
select
  c.id,
  s.id,
  'supports',
  'Brahma first accords Vishvamitra kingly-sage status; the passage then describes his continuing effort toward Brahmarshi status.',
  'Bala Kanda 1.63',
  'Exact chapter source added during audited Vishvamitra benchmark provenance completion.'
from target_claim c
cross join target_source s
where not exists (
  select 1 from public.claim_sources existing
  where existing.claim_id = c.id and existing.source_id = s.id
);

with target_claim as (
  select c.id
  from public.claims c
  join public.personalities p on p.id = c.personality_id
  where p.canonical_name = 'Vishvamitra'
    and c.claim_text = 'In the Bala Kanda narrative, Vishvamitra is explicitly presented first as a kingly sage (rajarshi) before the culmination of his ascetic transformation.'
), target_chunk as (
  select sc.id
  from public.source_chunks sc
  join public.sources s on s.id = sc.source_id
  where s.url = 'https://www.valmikiramayan.net/utf8/baala/sarga63/bala_63_prose.htm'
    and sc.is_active
    and sc.chunk_text ilike '%kingly sage%'
  order by sc.chunk_index
  limit 1
)
insert into public.claim_chunks(claim_id, chunk_id, relationship, confidence, link_method, metadata)
select
  c.id,
  sc.id,
  'supports',
  0.99,
  'manual_exact_passage',
  jsonb_build_object(
    'backfill_batch_key', 'vishvamitra-master-corpus-2026-09-23',
    'backfilled_by', 'system_test_bulk_approval',
    'reason', 'Explicit kingly-sage and continued Brahmarshi aspiration passage.'
  )
from target_claim c
cross join target_chunk sc
on conflict (claim_id, chunk_id) do update set
  confidence = greatest(coalesce(claim_chunks.confidence, 0), excluded.confidence),
  link_method = excluded.link_method,
  metadata = claim_chunks.metadata || excluded.metadata;

insert into public.chunk_parameter_fields(chunk_id, parameter_field_id, confidence, tagging_method)
select
  sc.id,
  pf.id,
  0.65,
  'rule'
from public.source_chunks sc
join public.chunk_personalities cp on cp.chunk_id = sc.id
join public.personalities p on p.id = cp.personality_id and p.canonical_name = 'Vishvamitra'
join public.parameter_fields pf on pf.code = case
  when coalesce(sc.textual_layer, '') ilike '%Ramayana%' then 'itihasa_role'
  else 'textual_layers'
end
where sc.is_active
  and not exists (
    select 1 from public.chunk_parameter_fields existing
    where existing.chunk_id = sc.id
  )
on conflict (chunk_id, parameter_field_id) do nothing;
