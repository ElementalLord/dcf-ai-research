-- Bhagat Singh uses the existing Warriors & Freedom Fighters framework.
insert into public.personalities (canonical_name, alternate_names)
select 'Bhagat Singh', array['Shaheed Bhagat Singh', 'Bhagat Singh Sandhu']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'bhagat singh');

insert into public.personality_categories (personality_id, category_id, is_primary)
select p.id, c.id, true
from public.personalities p cross join public.categories c
where p.canonical_name = 'Bhagat Singh' and c.slug = 'warriors_freedom_fighters'
on conflict (personality_id, category_id) do update set is_primary = true;

insert into public.personality_aliases(personality_id, alias, alias_type, confidence, is_ambiguous, notes)
select p.id, a.alias, a.alias_type, a.confidence, a.is_ambiguous, a.notes
from public.personalities p cross join (values
  ('Bhagat Singh', 'canonical', 1.0::double precision, false, 'Canonical name.'),
  ('Shaheed Bhagat Singh', 'epithet', 0.98::double precision, false, 'Posthumous honorific; do not use as evidence of his political views.'),
  ('Bhagat Singh Sandhu', 'alternate_name', 0.90::double precision, false, 'Occasional fuller name.'),
  ('Bhagat Singh Thind', 'alternate_name', 0.20::double precision, true, 'Do not automatically conflate with the separate Ghadar activist Bhagat Singh Thind.')
) a(alias, alias_type, confidence, is_ambiguous, notes)
where p.canonical_name = 'Bhagat Singh'
on conflict do nothing;
