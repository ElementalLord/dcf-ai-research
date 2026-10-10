-- A reusable framework for monarchs and political leaders; evidence is populated separately.
insert into public.categories (slug, name, description)
select 'political_leader', 'Monarchs and Political Leaders', 'Evidence-led study of political leadership, state formation, conflict, governance, and reception.'
where not exists (select 1 from public.categories where slug = 'political_leader');

with dimensions(code, name, description, sort_order, routing_hints) as (values
  ('formation', 'Background and rise', 'Family, formation, alliances, and the path to power.', 1, array['background','rise','family','early','origin']::text[]),
  ('state_building', 'State-building and sovereignty', 'Territory, legitimacy, institutions, and political independence.', 2, array['state','kingdom','sovereignty','independence','coronation']::text[]),
  ('governance', 'Governance and revenue', 'Offices, administration, justice, and fiscal practice.', 3, array['governance','administration','revenue','tax','minister']::text[]),
  ('warfare', 'Military strategy', 'Campaigns, armed organization, and strategic choices.', 4, array['war','military','strategy','campaign','battle']::text[]),
  ('forts_sea', 'Fortifications and maritime policy', 'Forts, coastal defenses, fleets, and maritime power.', 5, array['fort','coast','navy','naval','sea']::text[]),
  ('diplomacy', 'Political relationships and conflict', 'Rivals, allies, negotiation, and changing alignments.', 6, array['mughal','bijapur','treaty','relationship','conflict']::text[]),
  ('religion', 'Religion and state policy', 'Religious patronage, political language, and treatment of communities.', 7, array['religion','hindu','muslim','temple','policy']::text[]),
  ('leadership', 'Leadership and conduct', 'Source-supported decisions, organizational skill, and limitations.', 8, array['leadership','decision','quality','command']::text[]),
  ('context', 'Historical setting', 'Regional and wider forces shaping political action.', 9, array['history','deccan','century','context']::text[]),
  ('interpretation', 'Sources and contested interpretations', 'Chronicles, later traditions, scholarly disagreements, and political memory.', 10, array['source','chronicle','tradition','debate','interpretation']::text[]),
  ('legacy', 'Long-term significance', 'Consequences and later historical reception.', 11, array['legacy','impact','significance','later']::text[])
)
insert into public.parameters(category_id, code, name, description, sort_order, routing_hints)
select c.id, d.code, d.name, d.description, d.sort_order, d.routing_hints
from public.categories c cross join dimensions d where c.slug = 'political_leader'
  and not exists (select 1 from public.parameters p where p.category_id = c.id and p.code = d.code);

insert into public.parameter_fields(parameter_id, code, label, description, sort_order)
select p.id, p.code, p.name, p.description, 1
from public.parameters p join public.categories c on c.id = p.category_id
where c.slug = 'political_leader'
  and not exists (select 1 from public.parameter_fields f where f.parameter_id = p.id and f.code = p.code);

insert into public.personalities(canonical_name, alternate_names)
select 'Chhatrapati Shivaji Maharaj', array['Shivaji', 'Shivaji Maharaj', 'Shivaji Bhonsle', 'Shivaji Bhosale', 'Sivaji']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name) = 'chhatrapati shivaji maharaj');

insert into public.personality_categories(personality_id, category_id, is_primary)
select p.id, c.id, true from public.personalities p cross join public.categories c
where p.canonical_name = 'Chhatrapati Shivaji Maharaj' and c.slug = 'political_leader'
on conflict do nothing;

insert into public.personality_aliases(personality_id, alias, alias_type, confidence)
select p.id, a.alias, a.alias_type, a.confidence from public.personalities p cross join (values
  ('Chhatrapati Shivaji Maharaj', 'canonical', 1.0::double precision),
  ('Shivaji', 'alternate_name', 1.0::double precision),
  ('Shivaji Maharaj', 'alternate_name', 1.0::double precision),
  ('Shivaji Bhonsle', 'alternate_name', 0.99::double precision),
  ('Shivaji Bhosale', 'alternate_name', 0.99::double precision),
  ('Sivaji', 'alternate_name', 0.98::double precision)
) a(alias, alias_type, confidence)
where p.canonical_name = 'Chhatrapati Shivaji Maharaj'
on conflict do nothing;
