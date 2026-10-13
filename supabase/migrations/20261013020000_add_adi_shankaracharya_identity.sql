-- Adi Shankaracharya uses the existing shared Saints and Spiritual Teachers framework.
insert into public.personalities(canonical_name, alternate_names)
select 'Adi Shankaracharya', array['Adi Shankara', 'Shankaracharya', 'Shankara', 'Shri Shankaracharya', 'Sri Shankaracharya', 'Shankara Bhagavatpada']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'adi shankaracharya');

insert into public.personality_categories(personality_id, category_id, is_primary)
select p.id, c.id, true from public.personalities p join public.categories c on c.slug = 'spiritual_teacher'
where p.canonical_name = 'Adi Shankaracharya'
on conflict (personality_id, category_id) do update set is_primary = excluded.is_primary;

insert into public.personality_aliases(personality_id, alias, alias_type, confidence)
select p.id, x.alias, x.alias_type, x.confidence from public.personalities p cross join (values
  ('Adi Shankaracharya', 'canonical', 1.0::double precision), ('Adi Shankara', 'alternate_name', 1.0::double precision),
  ('Shankaracharya', 'alternate_name', 0.97::double precision), ('Shankara', 'alternate_name', 0.96::double precision),
  ('Shri Shankaracharya', 'alternate_name', 0.95::double precision), ('Sri Shankaracharya', 'alternate_name', 0.95::double precision),
  ('Shankara Bhagavatpada', 'epithet', 0.92::double precision)
) as x(alias, alias_type, confidence) where p.canonical_name = 'Adi Shankaracharya'
on conflict (personality_id, alias) do nothing;
