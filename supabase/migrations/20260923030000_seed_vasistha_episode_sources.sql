with seed(display_name, domain, exact_url, textual_layer, notes) as (
  values
    (
      'Valmiki Ramayana — Vishvamitra, Vasistha and Shabala — Bala Kanda Sarga 53',
      'valmikiramayan.net',
      'https://valmikiramayan.net/utf8/baala/sarga53/balasans53.htm.orig',
      'Ramayana — Bala Kanda, Sarga 53',
      'Exact Vasistha episode page already present in the DCF source registry.'
    ),
    (
      'Valmiki Ramayana — Vishvamitra and Vasistha conflict — Bala Kanda Sarga 55',
      'www.valmikiramayan.net',
      'https://www.valmikiramayan.net/utf8/baala/sarga55/bala_55_prose.htm',
      'Ramayana — Bala Kanda, Sarga 55',
      'Exact Vasistha conflict page already present in the DCF source registry.'
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
  'primary_text', 720, true, notes
from seed
where not exists (
  select 1 from public.approved_source_access asa
  where asa.scope_type = 'EXACT_URL' and asa.exact_url = seed.exact_url
);

update public.sources
set source_status = 'approved'
where url in (
  'https://valmikiramayan.net/utf8/baala/sarga53/balasans53.htm.orig',
  'https://www.valmikiramayan.net/utf8/baala/sarga55/bala_55_prose.htm'
);
