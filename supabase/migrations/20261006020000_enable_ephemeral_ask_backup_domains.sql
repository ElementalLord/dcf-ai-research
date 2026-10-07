-- Research access for request-scoped Ask fallback. These rules authorize fetching
-- original pages from established source families; Ask does not ingest or approve
-- individual pages into the DCF Library.
with domains(display_name, domain, priority, textual_layer, source_type) as (
  values
    ('Valmiki Ramayana digital text', 'valmikiramayan.net', 30, 'Epic narrative', 'primary_text'),
    ('Cambridge Core scholarship', 'cambridge.org', 40, 'Scholarly interpretation', 'scholarly_source'),
    ('IIT Kanpur Valmiki Ramayanam', 'valmiki.iitk.ac.in', 50, 'Epic narrative', 'primary_text'),
    ('Vedic Heritage Portal', 'vedicheritage.gov.in', 60, 'Vedic textual tradition', 'institutional_source')
)
insert into public.approved_source_access (
  display_name, domain, scope_type, allowed_path_prefix, exact_url,
  include_subdomains, allow_live_search, allow_live_fetch, allow_ingestion,
  evidence_use_status, priority, default_textual_layer, default_source_type,
  cache_ttl_hours, is_active, notes, approval_origin, approval_note
)
select d.display_name, d.domain, 'DOMAIN', null, null,
  true, true, true, false,
  'approved', d.priority, d.textual_layer, d.source_type,
  24, true,
  'Request-scoped Ask research only. A fetched page is not added to the permanent DCF Library.',
  'system_test_bulk',
  'Institutional, primary-text, or scholarly site family for generic Ask fallback validation.'
from domains d
where not exists (
  select 1 from public.approved_source_access a
  where a.domain = d.domain and a.scope_type = 'DOMAIN' and a.is_active
);
