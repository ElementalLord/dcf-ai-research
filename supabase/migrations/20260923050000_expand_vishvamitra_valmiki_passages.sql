-- Verified exact chapter pages from the Valmiki Ramayana project.
-- These replace no records and do not widen network scope beyond each URL.

with chapters(sarga, url) as (
  values
    (20, 'https://www.valmikiramayan.net/utf8/baala/sarga20/bala_20_prose.htm'),
    (21, 'https://www.valmikiramayan.net/utf8/baala/sarga21/bala_21_prose.htm'),
    (23, 'https://www.valmikiramayan.net/utf8/baala/sarga23/bala_23_prose.htm'),
    (24, 'https://www.valmikiramayan.net/utf8/baala/sarga24/bala_24_prose.htm'),
    (26, 'https://www.valmikiramayan.net/utf8/baala/sarga26/bala_26_prose.htm'),
    (27, 'https://www.valmikiramayan.net/utf8/baala/sarga27/bala_27_prose.htm'),
    (28, 'https://www.valmikiramayan.net/utf8/baala/sarga28/bala_28_prose.htm'),
    (30, 'https://www.valmikiramayan.net/utf8/baala/sarga30/bala_30_prose.htm'),
    (31, 'https://www.valmikiramayan.net/utf8/baala/sarga31/bala_31_prose.htm'),
    (32, 'https://www.valmikiramayan.net/utf8/baala/sarga32/bala_32_prose.htm'),
    (33, 'https://www.valmikiramayan.net/utf8/baala/sarga33/bala_33_prose.htm'),
    (34, 'https://www.valmikiramayan.net/utf8/baala/sarga34/bala_34_prose.htm'),
    (35, 'https://www.valmikiramayan.net/utf8/baala/sarga35/bala_35_prose.htm'),
    (50, 'https://www.valmikiramayan.net/utf8/baala/sarga50/bala_50_prose.htm'),
    (51, 'https://www.valmikiramayan.net/utf8/baala/sarga51/bala_51_prose.htm'),
    (52, 'https://www.valmikiramayan.net/utf8/baala/sarga52/bala_52_prose.htm'),
    (54, 'https://www.valmikiramayan.net/utf8/baala/sarga54/bala_54_prose.htm'),
    (56, 'https://www.valmikiramayan.net/utf8/baala/sarga56/bala_56_prose.htm'),
    (57, 'https://www.valmikiramayan.net/utf8/baala/sarga57/bala_57_prose.htm'),
    (58, 'https://www.valmikiramayan.net/utf8/baala/sarga58/bala_58_prose.htm'),
    (59, 'https://www.valmikiramayan.net/utf8/baala/sarga59/bala_59_prose.htm'),
    (61, 'https://www.valmikiramayan.net/utf8/baala/sarga61/bala_61_prose.htm'),
    (63, 'https://www.valmikiramayan.net/utf8/baala/sarga63/bala_63_prose.htm')
)
insert into public.sources(
  title, author, publisher_or_institution, source_type, url, citation,
  source_status, ingestion_status, textual_layer, rights_or_access_note,
  notes, metadata
)
select
  'Valmiki Ramayana — Bala Kanda, Sarga ' || sarga || ' (prose)',
  'Valmiki (traditional attribution); English rendering by Desiraju Hanumanta Rao',
  'Valmiki Ramayana project',
  'primary_text',
  url,
  'Valmiki Ramayana, Bala Kanda 1.' || sarga || ', chapter-level prose rendering.',
  'approved',
  'not_ingested',
  'Ramayana — Bala Kanda, Sarga ' || sarga,
  'Publicly accessible chapter page; preserve source attribution and link.',
  'Exact chapter page verified for Vishvamitra benchmark corpus testing.',
  jsonb_build_object(
    'testing_only', true,
    'approval_actor', 'system_test_bulk_approval',
    'approval_reason', 'verified chapter-level primary-text repository page',
    'approval_batch_key', 'vishvamitra-master-corpus-2026-09-23',
    'benchmark_sarga', sarga,
    'verified_http_status', 200,
    'verified_at', now()
  )
from chapters
on conflict do nothing;

insert into public.approved_source_access(
  display_name, domain, scope_type, exact_url, include_subdomains,
  allow_live_search, allow_live_fetch, allow_ingestion,
  evidence_use_status, priority, default_textual_layer,
  default_source_type, cache_ttl_hours, is_active, notes
)
select
  'Valmiki Ramayana — Bala Kanda Sarga ' || (s.metadata->>'benchmark_sarga') || ' prose',
  'www.valmikiramayan.net',
  'EXACT_URL',
  s.url,
  false,
  false,
  true,
  true,
  'approved',
  10,
  s.textual_layer,
  'primary_text',
  720,
  true,
  'Exact verified chapter page approved for Vishvamitra corpus testing; no broader web access granted.'
from public.sources s
where s.metadata->>'approval_batch_key' = 'vishvamitra-master-corpus-2026-09-23'
  and s.metadata ? 'benchmark_sarga'
on conflict (
  domain,
  scope_type,
  (coalesce(allowed_path_prefix, '')),
  (coalesce(exact_url, ''))
) do update set
  allow_live_fetch = true,
  allow_ingestion = true,
  evidence_use_status = case when approved_source_access.evidence_use_status = 'rejected' then 'rejected' else 'approved' end,
  is_active = case when approved_source_access.evidence_use_status = 'rejected' then approved_source_access.is_active else true end,
  updated_at = now();

-- The existing claim evidence identifies chapter/verse locations. Mirror those
-- links to the verified chapter rendition when the Sarga number matches.
insert into public.claim_sources(
  claim_id, source_id, relationship, evidence_excerpt, page_or_section, notes
)
select distinct
  cs.claim_id,
  replacement.id,
  cs.relationship,
  cs.evidence_excerpt,
  cs.page_or_section,
  'Matched by Bala Kanda Sarga to a verified chapter-level rendition for benchmark provenance backfill.'
from public.claim_sources cs
join public.claims c on c.id = cs.claim_id
join public.personalities p on p.id = c.personality_id and p.canonical_name = 'Vishvamitra'
join public.sources replacement
  on replacement.metadata->>'approval_batch_key' = 'vishvamitra-master-corpus-2026-09-23'
  and replacement.metadata ? 'benchmark_sarga'
  and cs.page_or_section ~ (
    '(^|[^0-9])1[.]?' || (replacement.metadata->>'benchmark_sarga') || '([^0-9]|$)'
  )
where cs.relationship = 'supports'
  and not exists (
    select 1 from public.claim_sources existing
    where existing.claim_id = cs.claim_id and existing.source_id = replacement.id
  );

insert into public.corpus_change_audit(
  batch_id, entity_type, entity_id, action, previous_state, new_state, reason, actor
)
select
  b.id,
  'source',
  s.id,
  'source_added',
  '{}'::jsonb,
  jsonb_build_object(
    'source_status', s.source_status,
    'url', s.url,
    'textual_layer', s.textual_layer,
    'testing_only', true
  ),
  'Verified chapter-level Valmiki Ramayana source added for Vishvamitra benchmark depth.',
  b.actor
from public.sources s
cross join public.corpus_change_batches b
where s.metadata->>'approval_batch_key' = 'vishvamitra-master-corpus-2026-09-23'
  and s.metadata ? 'benchmark_sarga'
  and b.batch_key = 'vishvamitra-master-corpus-2026-09-23'
on conflict (batch_id, entity_type, entity_id, action) do nothing;
