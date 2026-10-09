-- Reuse the existing Scientist / Innovator framework; only identity and category mapping are new.
insert into public.personalities (canonical_name, alternate_names)
select 'Srinivasa Ramanujan', array['S. Ramanujan', 'Srinivasa Aiyangar Ramanujan', 'Srinivasa Iyengar Ramanujan']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'srinivasa ramanujan');

insert into public.personality_categories (personality_id, category_id, is_primary)
select p.id, c.id, true from public.personalities p cross join public.categories c
where p.canonical_name = 'Srinivasa Ramanujan' and c.slug = 'scientist'
on conflict do nothing;

insert into public.personality_aliases (personality_id, alias, alias_type, confidence)
select p.id, a.alias, a.alias_type, a.confidence from public.personalities p
cross join (values
  ('Srinivasa Ramanujan', 'canonical', 1.0::double precision),
  ('Ramanujan', 'alternate_name', 0.98::double precision),
  ('S. Ramanujan', 'alternate_name', 0.98::double precision),
  ('Srinivasa Aiyangar Ramanujan', 'alternate_name', 0.95::double precision),
  ('Srinivasa Iyengar Ramanujan', 'alternate_name', 0.95::double precision)
) a(alias, alias_type, confidence)
where p.canonical_name = 'Srinivasa Ramanujan'
on conflict do nothing;
