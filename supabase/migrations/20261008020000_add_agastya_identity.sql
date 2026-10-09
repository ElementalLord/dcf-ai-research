insert into public.personalities (canonical_name, alternate_names)
select 'Agastya', array['Agastya Muni', 'Agasti', 'Akattiyar', 'Agathiyar']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'agastya');

insert into public.personality_categories (personality_id, category_id, is_primary)
select p.id, c.id, true from public.personalities p
join public.categories c on c.slug = 'rishi'
where lower(p.canonical_name) = 'agastya'
on conflict do nothing;

insert into public.personality_aliases (personality_id, alias, alias_type, confidence)
select p.id, a.alias, a.alias_type, a.confidence from public.personalities p
cross join (values
  ('Agastya', 'canonical', 1.0::double precision),
  ('Agastya Muni', 'alternate_name', 0.95::double precision),
  ('Agasti', 'transliteration', 0.9::double precision),
  ('Akattiyar', 'alternate_name', 0.9::double precision),
  ('Agathiyar', 'alternate_name', 0.9::double precision)
) a(alias, alias_type, confidence)
where lower(p.canonical_name) = 'agastya'
on conflict do nothing;
