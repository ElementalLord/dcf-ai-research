alter table public.source_chunks add column if not exists retrieval_document tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(section_title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(page_or_section, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(textual_layer, '')), 'A') ||
  setweight(to_tsvector('simple', chunk_text), 'B')
) stored;
create index if not exists source_chunks_retrieval_text_idx on public.source_chunks using gin(retrieval_document);

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
      ts_rank_cd(sc.retrieval_document, websearch_to_tsquery('simple', query_text)) +
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
      sc.retrieval_document @@ websearch_to_tsquery('simple', query_text)
      or lower(sc.chunk_text) like '%' || lower(query_text) || '%'
    )
  order by lexical_score desc, sc.chunk_index
  limit least(greatest(max_results, 1), 100);
$$;

create or replace function public.get_retrieval_inventory(personality_uuid uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'totalChunksForPersonality', count(distinct sc.id),
    'approvedSourceChunksForPersonality', count(distinct sc.id) filter (where s.source_status = 'approved'),
    'embeddingCountForPersonality', count(distinct sc.id) filter (where sc.embedding is not null and sc.embedding_status = 'ready'),
    'approvedEmbeddingCountForPersonality', count(distinct sc.id) filter (where s.source_status = 'approved' and sc.embedding is not null and sc.embedding_status = 'ready'),
    'parameterTaggedChunksForPersonality', count(distinct sc.id) filter (
      where exists (select 1 from public.chunk_parameter_fields cpf where cpf.chunk_id = sc.id)
    )
  )
  from public.chunk_personalities cp
  join public.source_chunks sc on sc.id = cp.chunk_id and sc.is_active
  join public.sources s on s.id = sc.source_id
  where cp.personality_id = personality_uuid;
$$;

revoke execute on function public.get_retrieval_inventory(uuid) from public, anon, authenticated;
grant execute on function public.get_retrieval_inventory(uuid) to service_role;

with seed(display_name, domain, exact_url, textual_layer, source_type, notes) as (
  values
    (
      'Vedic Heritage Portal — Rigveda 3.33',
      'vedicheritage.gov.in',
      'https://vedicheritage.gov.in/samhitas/rigveda/shakala-samhita/rigveda-shakala-samhita-mandal-03-sukta-033/',
      'Rigveda — Mandala 3, Sukta 33',
      'primary_text',
      'Exact institutional page already present in the DCF source registry.'
    ),
    (
      'Vedic Heritage Portal — Rigveda 3.62',
      'vedicheritage.gov.in',
      'https://vedicheritage.gov.in/hi/samhitas/rigveda/shakala-samhita/rigveda-shakala-samhita-mandal-03-sukta-062/',
      'Rigveda — Mandala 3, Sukta 62',
      'primary_text',
      'Exact institutional page already present in the DCF source registry.'
    ),
    (
      'Valmiki Ramayana — Bala Kanda Sarga 19',
      'valmikiramayan.net',
      'https://valmikiramayan.net/utf8/baala/sarga19/balasans19.htm',
      'Ramayana — Bala Kanda, Sarga 19',
      'primary_text',
      'Exact Valmiki Ramayana page already ingested by the DCF corpus.'
    ),
    (
      'IIT Kanpur Valmiki Ramayanam — Bala Kanda Sarga 22',
      'www.valmiki.iitk.ac.in',
      'https://www.valmiki.iitk.ac.in/summary?field_kanda_tid=1&field_sarga_value=22',
      'Ramayana — Bala Kanda, Sarga 22',
      'primary_text',
      'Exact institutional Ramayana page already present in the DCF source registry.'
    ),
    (
      'Sri Aurobindo Ashram — Hymns to the Mystic Fire',
      'www.sriaurobindoashram.org',
      'https://www.sriaurobindoashram.org/sriaurobindo/downloadpdf.php?id=31',
      'Modern spiritual interpretation',
      'scholarly_book',
      'Exact Ashram publication URL already present in the DCF source registry.'
    )
)
insert into public.approved_source_access (
  display_name, domain, scope_type, exact_url, include_subdomains,
  allow_live_search, allow_live_fetch, allow_ingestion,
  evidence_use_status, priority, default_textual_layer,
  default_source_type, cache_ttl_hours, is_active, notes
)
select
  display_name, domain, 'EXACT_URL', exact_url, false,
  false, true, true,
  'approved', 10, textual_layer,
  source_type, 720, true, notes
from seed
where not exists (
  select 1 from public.approved_source_access asa
  where asa.scope_type = 'EXACT_URL' and asa.exact_url = seed.exact_url
);

update public.sources
set source_status = 'approved'
where url in (
  'https://vedicheritage.gov.in/samhitas/rigveda/shakala-samhita/rigveda-shakala-samhita-mandal-03-sukta-033/',
  'https://vedicheritage.gov.in/hi/samhitas/rigveda/shakala-samhita/rigveda-shakala-samhita-mandal-03-sukta-062/',
  'https://valmikiramayan.net/utf8/baala/sarga19/balasans19.htm',
  'https://www.valmiki.iitk.ac.in/summary?field_kanda_tid=1&field_sarga_value=22',
  'https://www.sriaurobindoashram.org/sriaurobindo/downloadpdf.php?id=31'
);
