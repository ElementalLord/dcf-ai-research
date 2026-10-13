-- A reusable framework for people whose work joins enterprise, social provision,
-- infrastructure, and durable institutions. It is not specific to one personality.
insert into public.categories (slug, name, description)
select 'business_institution_builder', 'Business, Social & Institution Builders',
  'Evidence-led research on enterprise, industry, social provision, institutions, infrastructure, and long-term development.'
where not exists (select 1 from public.categories where slug = 'business_institution_builder');

with dimensions(code, name, description, sort_order, routing_hints) as (values
  ('formation', 'Early life and business formation', 'Family background, education, networks, and entry into enterprise.', 1, array['who','born','early life','background','education','career']::text[]),
  ('enterprise', 'Enterprise and entrepreneurship', 'Businesses, markets, strategy, risk, and organizational development.', 2, array['business','company','enterprise','entrepreneur','strategy','management']::text[]),
  ('industry', 'Industry and industrialization', 'Sectors, technology, production, and industrial capabilities.', 3, array['industry','textile','steel','manufacturing','industrialization','factory']::text[]),
  ('infrastructure', 'Infrastructure and power', 'Energy, transport, buildings, urban systems, and their strategic role.', 4, array['power','hydro','electricity','hotel','infrastructure','railway']::text[]),
  ('science_education', 'Science and education', 'Research, training, universities, and technical capability.', 5, array['science','education','institute','university','iisc','research']::text[]),
  ('social_welfare', 'Employee welfare and social provision', 'Workplace conditions, benefits, philanthropy, and their limits.', 6, array['worker','employee','welfare','pension','philanthropy','labour']::text[]),
  ('national_development', 'National development and colonial context', 'Economic setting, state relations, self-reliance, and public consequences.', 7, array['india','colonial','british','national','development','economy']::text[]),
  ('institutions', 'Institution-building and continuity', 'Founding, governance, succession, and later institutional effects.', 8, array['institution','legacy','trust','tata','successor','foundation']::text[]),
  ('challenges', 'Challenges, trade-offs and limits', 'Setbacks, constraints, uncertainty, and contested consequences.', 9, array['challenge','setback','failure','limit','criticism','land']::text[]),
  ('legacy', 'Long-term impact and interpretation', 'Later reception, historical interpretation, and bounded impact claims.', 10, array['important','impact','legacy','today','influence','why']::text[])
)
insert into public.parameters(category_id, code, name, description, sort_order, routing_hints)
select c.id, d.code, d.name, d.description, d.sort_order, d.routing_hints
from public.categories c cross join dimensions d
where c.slug = 'business_institution_builder'
  and not exists (select 1 from public.parameters p where p.category_id = c.id and p.code = d.code);

insert into public.parameter_fields(parameter_id, code, label, description, sort_order)
select p.id, p.code, p.name, p.description, 1
from public.parameters p join public.categories c on c.id = p.category_id
where c.slug = 'business_institution_builder'
  and not exists (select 1 from public.parameter_fields f where f.parameter_id = p.id and f.code = p.code);

insert into public.personalities (canonical_name, alternate_names)
select 'Jamsetji Tata', array['Jamsetji Nusserwanji Tata', 'Jamshedji Tata', 'J. N. Tata', 'J. N. Tata']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'jamsetji tata');

insert into public.personality_categories (personality_id, category_id, is_primary)
select p.id, c.id, true
from public.personalities p cross join public.categories c
where p.canonical_name = 'Jamsetji Tata' and c.slug = 'business_institution_builder'
on conflict (personality_id, category_id) do update set is_primary = true;

insert into public.personality_aliases (personality_id, alias, alias_type, confidence)
select p.id, a.alias, a.alias_type, a.confidence
from public.personalities p cross join (values
  ('Jamsetji Tata', 'canonical', 1.0::double precision),
  ('Jamsetji Nusserwanji Tata', 'alternate_name', 1.0::double precision),
  ('Jamshedji Tata', 'alternate_name', 0.99::double precision),
  ('J. N. Tata', 'alternate_name', 0.95::double precision),
  ('J. N. Tata', 'alternate_name', 0.95::double precision)
) a(alias, alias_type, confidence)
where p.canonical_name = 'Jamsetji Tata'
on conflict do nothing;
