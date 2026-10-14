-- Shared, data-driven framework for writers, filmmakers, visual artists,
-- musicians and other cultural figures. No personality-specific UI behavior.
insert into public.categories (slug, name, description)
select 'cultural_figure', 'Authors, Artists & Cultural Figures',
  'Evidence-led research on creative works, artistic practice, ideas, institutions, social context, reception, and cultural legacy.'
where not exists (select 1 from public.categories where slug = 'cultural_figure');

with dimensions(code, name, description, sort_order, routing_hints) as (values
  ('formation', 'Life and intellectual formation', 'Family, education, artistic background, and career development.', 1, array['who','born','early life','background','education','career']::text[]),
  ('works', 'Works and genres', 'Major works, forms, adaptations, characters, publications, and signature contributions.', 2, array['work','book','poem','novel','film','story','gitanjali','apu']::text[]),
  ('craft', 'Artistic craft and method', 'Writing, direction, design, visual form, composition, and creative process.', 3, array['style','method','directing','design','visual','screenplay','technique']::text[]),
  ('cultural_practice', 'Music, performance and cultural practice', 'Music, performance, language, circulation, and lived cultural influence.', 4, array['music','song','performance','bengali','culture','rabindra sangeet']::text[]),
  ('ideas', 'Philosophical and human questions', 'Humanism, spirituality, ethics, freedom, and conceptions of the person.', 5, array['humanism','spirituality','philosophy','freedom','ethics','moral']::text[]),
  ('society_politics', 'Society, politics and historical context', 'Colonialism, nationalism, class, gender, public life, and social change.', 6, array['nationalism','colonial','politics','society','class','gender','social']::text[]),
  ('institutions', 'Education and institutions', 'Schools, archives, societies, public support, and durable cultural organizations.', 7, array['school','university','institution','archive','society','santiniketan']::text[]),
  ('relationships', 'Contemporaries and collaborators', 'Creative collaborators, interlocutors, disagreement, and shared authorship.', 8, array['collaborator','contemporary','relationship','gandhi','tagore','cinematographer']::text[]),
  ('international', 'International exchange and recognition', 'Translation, travel, prizes, festivals, cross-cultural exchange, and global reception.', 9, array['international','world','nobel','academy','oscar','festival','translation']::text[]),
  ('interpretation', 'Interpretation, limits and contested claims', 'Scholarly readings, source limits, misquotation, criticism, and competing assessments.', 10, array['theme','interpretation','criticism','misquote','limit','debate']::text[]),
  ('legacy', 'Long-term cultural impact', 'Influence, preservation, teaching, adaptation, and continuing public life.', 11, array['impact','legacy','influence','today','restoration','preservation']::text[])
)
insert into public.parameters(category_id, code, name, description, sort_order, routing_hints)
select c.id, d.code, d.name, d.description, d.sort_order, d.routing_hints
from public.categories c cross join dimensions d
where c.slug = 'cultural_figure'
  and not exists (select 1 from public.parameters p where p.category_id = c.id and p.code = d.code);

insert into public.parameter_fields(parameter_id, code, label, description, sort_order)
select p.id, p.code, p.name, p.description, 1
from public.parameters p join public.categories c on c.id = p.category_id
where c.slug = 'cultural_figure'
  and not exists (select 1 from public.parameter_fields f where f.parameter_id = p.id and f.code = p.code);

insert into public.personalities (canonical_name, alternate_names)
select v.canonical_name, v.alternate_names
from (values
  ('Rabindranath Tagore', array['Rabindranath Thakur', 'Gurudev Tagore']::text[]),
  ('Satyajit Ray', array['Manik Ray']::text[]),
  ('J. R. D. Tata', array['Jehangir Ratanji Dadabhoy Tata', 'JRD Tata', 'J. R. D.']::text[])
) v(canonical_name, alternate_names)
where not exists (select 1 from public.personalities p where lower(p.canonical_name) = lower(v.canonical_name));

insert into public.personality_categories(personality_id, category_id, is_primary)
select p.id, c.id, true
from public.personalities p join public.categories c on c.slug = case
  when p.canonical_name in ('Rabindranath Tagore','Satyajit Ray') then 'cultural_figure'
  else 'business_institution_builder' end
where p.canonical_name in ('Rabindranath Tagore','Satyajit Ray','J. R. D. Tata','Jamsetji Tata')
on conflict (personality_id,category_id) do update set is_primary = true;

insert into public.personality_aliases(personality_id,alias,alias_type,confidence)
select p.id, a.alias, a.alias_type, a.confidence
from public.personalities p join (values
  ('Rabindranath Tagore','Rabindranath Tagore','canonical',1.0::double precision),
  ('Rabindranath Tagore','Rabindranath Thakur','alternate_name',0.99::double precision),
  ('Rabindranath Tagore','Gurudev Tagore','honorific',0.90::double precision),
  ('Satyajit Ray','Satyajit Ray','canonical',1.0::double precision),
  ('Satyajit Ray','Manik Ray','alternate_name',0.85::double precision),
  ('J. R. D. Tata','J. R. D. Tata','canonical',1.0::double precision),
  ('J. R. D. Tata','JRD Tata','alternate_name',0.99::double precision),
  ('J. R. D. Tata','Jehangir Ratanji Dadabhoy Tata','alternate_name',1.0::double precision),
  ('J. R. D. Tata','J. R. D.','short_name',0.85::double precision)
) a(person_name,alias,alias_type,confidence) on a.person_name = p.canonical_name
on conflict do nothing;
