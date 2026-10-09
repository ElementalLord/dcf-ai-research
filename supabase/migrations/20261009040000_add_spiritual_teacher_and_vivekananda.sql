-- A compact data-driven framework for historical spiritual teachers.
insert into public.categories (slug, name, description)
select 'spiritual_teacher', 'Saints and Spiritual Teachers', 'Teachings, practices, lineages, institutions, and historical reception.'
where not exists (select 1 from public.categories where slug = 'spiritual_teacher');

with dimensions(code, name, description, sort_order, routing_hints) as (values
  ('vocation', 'Life and vocation', 'Identity, formation, and public role.', 1, array['who','life','born','monk']::text[]),
  ('teachings', 'Teachings and philosophy', 'Spiritual and philosophical ideas.', 2, array['teach','vedanta','philosophy','religion']::text[]),
  ('practice', 'Practice and discipline', 'Methods of spiritual development.', 3, array['yoga','practice','meditation','sadhana']::text[]),
  ('lineage', 'Teachers and lineage', 'Teachers, disciples, and transmission.', 4, array['ramakrishna','teacher','guru','disciple']::text[]),
  ('works', 'Works and speeches', 'Significant books, lectures, and letters.', 5, array['book','speech','chicago','lecture']::text[]),
  ('service', 'Service and institutions', 'Social work, education, and institutions.', 6, array['mission','service','education','poor']::text[]),
  ('context', 'Historical context and reception', 'Contemporary setting and later interpretations.', 7, array['history','colonial','west','impact','nationalism']::text[]),
  ('complexity', 'Challenges and contested interpretations', 'Difficulties, limitations, and scholarly disagreement.', 8, array['challenge','controversy','dispute','interpretation']::text[])
)
insert into public.parameters(category_id, code, name, description, sort_order, routing_hints)
select c.id, d.code, d.name, d.description, d.sort_order, d.routing_hints
from public.categories c cross join dimensions d where c.slug = 'spiritual_teacher'
  and not exists (select 1 from public.parameters p where p.category_id = c.id and p.code = d.code);

insert into public.parameter_fields(parameter_id, code, label, description, sort_order)
select p.id, p.code, p.name, p.description, 1
from public.parameters p join public.categories c on c.id = p.category_id
where c.slug = 'spiritual_teacher'
  and not exists (select 1 from public.parameter_fields f where f.parameter_id = p.id and f.code = p.code);

insert into public.personalities(canonical_name, alternate_names)
select 'Swami Vivekananda', array['Vivekananda', 'Narendranath Datta', 'Narendra Nath Datta']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'swami vivekananda');

insert into public.personality_categories(personality_id, category_id, is_primary)
select p.id, c.id, true from public.personalities p cross join public.categories c
where p.canonical_name = 'Swami Vivekananda' and c.slug = 'spiritual_teacher'
on conflict do nothing;

insert into public.personality_aliases(personality_id, alias, alias_type, confidence)
select p.id, a.alias, a.alias_type, a.confidence from public.personalities p
cross join (values
  ('Swami Vivekananda', 'canonical', 1.0::double precision),
  ('Vivekananda', 'alternate_name', 1.0::double precision),
  ('Narendranath Datta', 'alternate_name', 0.99::double precision),
  ('Narendra Nath Datta', 'alternate_name', 0.99::double precision)
) a(alias, alias_type, confidence)
where p.canonical_name = 'Swami Vivekananda'
on conflict do nothing;
