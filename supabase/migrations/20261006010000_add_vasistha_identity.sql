-- Minimal personality registration for testing generic Ask research.
-- No biography, sources, passages, or claims are seeded here.
insert into public.personalities (canonical_name, alternate_names)
select 'Vasistha', array['Vasiṣṭha', 'Vasishtha', 'Vashishta', 'Vasista']::text[]
where not exists (
  select 1 from public.personalities where lower(canonical_name) = 'vasistha'
);

insert into public.personality_categories (personality_id, category_id, is_primary)
select p.id, c.id, true
from public.personalities p
join public.categories c on c.slug = 'rishi'
where lower(p.canonical_name) = 'vasistha'
  and not exists (
    select 1 from public.personality_categories pc
    where pc.personality_id = p.id and pc.category_id = c.id
  );

insert into public.personality_aliases (personality_id, alias, alias_type, confidence)
select p.id, aliases.alias, aliases.alias_type, aliases.confidence
from public.personalities p
cross join (values
  ('Vasistha', 'canonical', 1.0::double precision),
  ('Vasiṣṭha', 'transliteration', 1.0::double precision),
  ('Vasishtha', 'alternate_name', 0.95::double precision),
  ('Vashishta', 'alternate_name', 0.95::double precision),
  ('Vasista', 'transliteration', 0.9::double precision)
) aliases(alias, alias_type, confidence)
where lower(p.canonical_name) = 'vasistha'
on conflict do nothing;
