-- Kalam has one identity and one evidence corpus. Scientist is primary for research
-- routing; the existing political-leader category records his public-service lens.
insert into public.personalities (canonical_name, alternate_names)
select 'A. P. J. Abdul Kalam', array['APJ Abdul Kalam', 'Abdul Kalam', 'Avul Pakir Jainulabdeen Abdul Kalam']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'a. p. j. abdul kalam');

insert into public.personality_categories (personality_id, category_id, is_primary)
select p.id, c.id, c.slug = 'scientist'
from public.personalities p cross join public.categories c
where p.canonical_name = 'A. P. J. Abdul Kalam' and c.slug in ('scientist', 'political_leader')
on conflict (personality_id, category_id) do update set is_primary = excluded.is_primary;

insert into public.personality_aliases (personality_id, alias, alias_type, confidence)
select p.id, a.alias, a.alias_type, a.confidence from public.personalities p cross join (values
  ('A. P. J. Abdul Kalam', 'canonical', 1.0::double precision),
  ('APJ Abdul Kalam', 'alternate_name', 1.0::double precision),
  ('Dr APJ Abdul Kalam', 'alternate_name', 0.99::double precision),
  ('Abdul Kalam', 'alternate_name', 0.95::double precision),
  ('Avul Pakir Jainulabdeen Abdul Kalam', 'alternate_name', 1.0::double precision)
) a(alias, alias_type, confidence)
where p.canonical_name = 'A. P. J. Abdul Kalam'
on conflict do nothing;
