-- Guru Nanak uses the shared Saints and Spiritual Teachers framework.
insert into public.personalities(canonical_name, alternate_names)
select 'Guru Nanak', array['Guru Nanak Dev', 'Guru Nanak Dev Ji', 'Nanak', 'Baba Nanak']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'guru nanak');

insert into public.personality_categories(personality_id, category_id, is_primary)
select p.id, c.id, true
from public.personalities p join public.categories c on c.slug = 'spiritual_teacher'
where p.canonical_name = 'Guru Nanak'
on conflict (personality_id, category_id) do update set is_primary = excluded.is_primary;

insert into public.personality_aliases(personality_id, alias, alias_type, confidence)
select p.id, x.alias, x.alias_type, x.confidence
from public.personalities p
cross join (values
  ('Guru Nanak', 'canonical', 1.0::double precision),
  ('Guru Nanak Dev', 'alternate_name', 1.0::double precision),
  ('Guru Nanak Dev Ji', 'alternate_name', 1.0::double precision),
  ('Nanak', 'alternate_name', 0.98::double precision),
  ('Baba Nanak', 'alternate_name', 0.98::double precision)
) as x(alias, alias_type, confidence)
where p.canonical_name = 'Guru Nanak'
on conflict (personality_id, alias) do nothing;
