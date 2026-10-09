-- Reuse the existing request-scoped source registry for institutions checked in the Raman corpus.
with verified(domain, display_name, source_type, priority) as (values
  ('www.nobelprize.org', 'Nobel Prize', 'institutional', 30),
  ('www.rri.res.in', 'Raman Research Institute', 'institutional', 31),
  ('webjapps.ias.ac.in', 'Indian Academy of Sciences', 'institutional', 32),
  ('iisc.ac.in', 'Indian Institute of Science', 'institutional', 33),
  ('www.iacs.res.in', 'Indian Association for the Cultivation of Science', 'scholarly_article', 34)
)
insert into public.approved_source_access (
  display_name, domain, scope_type, include_subdomains, allow_live_search, allow_live_fetch,
  allow_ingestion, evidence_use_status, priority, default_textual_layer, default_source_type,
  cache_ttl_hours, is_active, notes, approval_origin, approval_note
)
select v.display_name, v.domain, 'DOMAIN', true, true, true,
  false, 'approved', v.priority, 'Documented science and institutional history', v.source_type,
  24, true, 'Request-scoped research from verified institutional sources; does not approve claims.',
  'verified_auto', 'Institutional domain and Raman source checked during scientist corpus population.'
from verified v
where not exists (select 1 from public.approved_source_access a where a.domain = v.domain and a.scope_type = 'DOMAIN');
