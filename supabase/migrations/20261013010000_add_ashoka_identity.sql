-- Ashoka uses the existing monarch / political-leader framework and no bespoke UI path.
insert into public.personalities (canonical_name, alternate_names)
select 'Ashoka', array['Aśoka', 'Asoka', 'Ashoka Maurya', 'Emperor Ashoka', 'Devanampiya Piyadasi']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'ashoka');

insert into public.personality_categories (personality_id, category_id, is_primary)
select p.id, c.id, true
from public.personalities p cross join public.categories c
where p.canonical_name = 'Ashoka' and c.slug = 'political_leader'
on conflict (personality_id, category_id) do update set is_primary = true;

insert into public.personality_aliases(personality_id, alias, alias_type, confidence)
select p.id, a.alias, a.alias_type, a.confidence from public.personalities p cross join (values
  ('Ashoka', 'canonical', 1.0::double precision),
  ('Aśoka', 'alternate_name', 1.0::double precision),
  ('Asoka', 'alternate_name', 0.99::double precision),
  ('Ashoka Maurya', 'alternate_name', 0.99::double precision),
  ('Emperor Ashoka', 'alternate_name', 0.98::double precision),
  ('Devanampiya Piyadasi', 'royal_title', 0.90::double precision)
) a(alias, alias_type, confidence)
where p.canonical_name = 'Ashoka'
on conflict do nothing;
