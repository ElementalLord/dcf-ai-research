-- Jagadish Chandra Bose uses the existing generic scientist framework.
-- The display name is made explicit for the grouped personality picker.
update public.categories
set name = 'Scientists, Technologists & Innovators',
    description = 'Evidence-led research on scientific work, technology, methods, institutions, and impact.'
where slug = 'scientist';

insert into public.personalities (canonical_name, alternate_names)
select 'Jagadish Chandra Bose', array['Jagadis Chandra Bose', 'Jagadis Chunder Bose', 'J. C. Bose', 'Sir Jagadish Chandra Bose']::text[]
where not exists (
  select 1 from public.personalities where lower(canonical_name) = 'jagadish chandra bose'
);

insert into public.personality_categories (personality_id, category_id, is_primary)
select p.id, c.id, true
from public.personalities p cross join public.categories c
where p.canonical_name = 'Jagadish Chandra Bose' and c.slug = 'scientist'
on conflict (personality_id, category_id) do update set is_primary = true;

insert into public.personality_aliases (personality_id, alias, alias_type, confidence)
select p.id, a.alias, a.alias_type, a.confidence
from public.personalities p cross join (values
  ('Jagadish Chandra Bose', 'canonical', 1.0::double precision),
  ('Jagadis Chandra Bose', 'alternate_name', 0.99::double precision),
  ('Jagadis Chunder Bose', 'alternate_name', 0.99::double precision),
  ('J. C. Bose', 'alternate_name', 0.95::double precision),
  ('Sir Jagadish Chandra Bose', 'alternate_name', 0.99::double precision)
) a(alias, alias_type, confidence)
where p.canonical_name = 'Jagadish Chandra Bose'
on conflict do nothing;
