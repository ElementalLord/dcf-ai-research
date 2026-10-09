-- The existing category/parameter/field hierarchy also describes modern scientists.
insert into public.categories (slug, name, description)
select 'scientist', 'Scientists and Innovators', 'Evidence-led research on scientific work, methods, institutions, and impact.'
where not exists (select 1 from public.categories where slug = 'scientist');

with dimensions(code, name, description, sort_order, routing_hints) as (values
  ('scientific_role', 'Scientific role and field', 'Training, disciplines, and career.', 1, array['who','physicist','field','career']::text[]),
  ('discoveries', 'Discoveries and contributions', 'Results and their scientific meaning.', 2, array['discovery','effect','light','scattering','contribution']::text[]),
  ('research_methods', 'Research methods and innovation', 'Experiments, instruments, collaborators, and reasoning.', 3, array['how','experiment','method','instrument','collaboration']::text[]),
  ('institutions', 'Institutions and leadership', 'Appointments, institution building, and scientific leadership.', 4, array['institute','academy','university','leadership']::text[]),
  ('mentorship', 'Mentorship and education', 'Students, teaching, and scientific education.', 5, array['student','mentor','teach','education']::text[]),
  ('persistence', 'Challenges and persistence', 'Constraints and evidenced responses to them.', 6, array['challenge','obstacle','persistence','career']::text[]),
  ('qualities', 'Personal qualities and values', 'Source-supported conduct and stated beliefs.', 7, array['curiosity','value','quality','belief']::text[]),
  ('historical_context', 'Historical context', 'Scientific and social setting of the work.', 8, array['history','colonial','period','context']::text[]),
  ('impact', 'Recognition and continuing impact', 'Recognition and later uses of the science.', 9, array['nobel','importance','spectroscopy','impact','today']::text[]),
  ('contested', 'Contested aspects and limits', 'Credit, priority, and carefully bounded interpretation.', 10, array['credit','priority','disputed','limitation']::text[])
)
insert into public.parameters(category_id, code, name, description, sort_order, routing_hints)
select c.id, d.code, d.name, d.description, d.sort_order, d.routing_hints
from public.categories c cross join dimensions d where c.slug = 'scientist'
  and not exists (select 1 from public.parameters p where p.category_id = c.id and p.code = d.code);

insert into public.parameter_fields(parameter_id, code, label, description, sort_order)
select p.id, p.code, p.name, p.description, 1
from public.parameters p join public.categories c on c.id = p.category_id
where c.slug = 'scientist'
  and not exists (select 1 from public.parameter_fields f where f.parameter_id = p.id and f.code = p.code);

-- Identity and configuration only. Evidence is populated separately after source checks.
insert into public.personalities(canonical_name, alternate_names)
select 'C. V. Raman', array['Sir C. V. Raman', 'Chandrasekhara Venkata Raman', 'C V Raman']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'c. v. raman');

insert into public.personality_categories(personality_id, category_id, is_primary)
select p.id, c.id, true from public.personalities p cross join public.categories c
where p.canonical_name = 'C. V. Raman' and c.slug = 'scientist'
on conflict do nothing;

insert into public.personality_aliases(personality_id, alias, alias_type, confidence)
select p.id, a.alias, a.alias_type, a.confidence from public.personalities p
cross join (values
  ('C. V. Raman', 'canonical', 1.0::double precision),
  ('CV Raman', 'alternate_name', 0.98::double precision),
  ('Sir C. V. Raman', 'alternate_name', 0.98::double precision),
  ('Chandrasekhara Venkata Raman', 'alternate_name', 1.0::double precision),
  ('Chandrasekhara V. Raman', 'alternate_name', 0.95::double precision)
) a(alias, alias_type, confidence)
where p.canonical_name = 'C. V. Raman'
on conflict do nothing;
