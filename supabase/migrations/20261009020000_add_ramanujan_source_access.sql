-- Extend the existing search-source registry only to the checked source institutions.
with verified(domain, display_name, source_type, priority) as (values
  ('www.cam.ac.uk', 'University of Cambridge', 'institutional', 35),
  ('mathshistory.st-andrews.ac.uk', 'MacTutor History of Mathematics', 'scholarly_article', 36),
  ('royalsociety.org', 'Royal Society', 'institutional', 37),
  ('math.illinois.edu', 'University of Illinois Mathematics', 'scholarly_article', 38)
)
insert into public.approved_source_access (
  display_name, domain, scope_type, include_subdomains, allow_live_search, allow_live_fetch,
  allow_ingestion, evidence_use_status, priority, default_textual_layer, default_source_type,
  cache_ttl_hours, is_active, notes, approval_origin, approval_note
)
select v.display_name, v.domain, 'DOMAIN', false, true, true,
  false, 'approved', v.priority, 'Documented mathematics and institutional history', v.source_type,
  24, true, 'Request-scoped research from checked institutional sources; does not approve claims.',
  'verified_auto', 'Ramanujan source pages and PDFs checked during scientist corpus population.'
from verified v
where not exists (select 1 from public.approved_source_access a where a.domain = v.domain and a.scope_type = 'DOMAIN');
