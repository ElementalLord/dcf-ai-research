-- Route open-ended student questions to documented work and conduct, not only formal teaching.
update public.parameters p
set routing_hints = array(select distinct unnest(coalesce(p.routing_hints, '{}'::text[]) || array['learn', 'students']::text[]))
from public.categories c
where p.category_id = c.id and c.slug = 'scientist'
  and p.code in ('research_methods', 'persistence', 'qualities');
