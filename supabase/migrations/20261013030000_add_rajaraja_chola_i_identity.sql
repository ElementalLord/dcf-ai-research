-- Rajaraja Chola I uses the shared monarch / political-leader framework.
insert into public.personalities (canonical_name, alternate_names)
select 'Rajaraja Chola I', array['Raja Raja Chola I', 'Rajaraja I', 'Raja Raja I', 'Rajaraja Chola', 'Rajaraja Deva']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'rajaraja chola i');

insert into public.personality_categories (personality_id, category_id, is_primary)
select p.id, c.id, true
from public.personalities p cross join public.categories c
where p.canonical_name = 'Rajaraja Chola I' and c.slug = 'political_leader'
on conflict (personality_id, category_id) do update set is_primary = true;

insert into public.personality_aliases(personality_id, alias, alias_type, confidence)
select p.id, a.alias, a.alias_type, a.confidence from public.personalities p cross join (values
  ('Rajaraja Chola I', 'canonical', 1.0::double precision),
  ('Raja Raja Chola I', 'alternate_name', 1.0::double precision),
  ('Rajaraja I', 'alternate_name', 0.99::double precision),
  ('Raja Raja I', 'alternate_name', 0.99::double precision),
  ('Rajaraja Chola', 'alternate_name', 0.99::double precision),
  ('Rajaraja Deva', 'royal_title', 0.95::double precision)
) a(alias, alias_type, confidence)
where p.canonical_name = 'Rajaraja Chola I'
on conflict do nothing;
