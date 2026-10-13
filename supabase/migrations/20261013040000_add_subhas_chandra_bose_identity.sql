-- Reusable category for anti-colonial leaders and military-political movements.
insert into public.categories (slug, name, description)
select 'warriors_freedom_fighters', 'Warriors & Freedom Fighters', 'Evidence-led study of anti-colonial leadership, armed movements, political strategy, wartime choices, and public memory.'
where not exists (select 1 from public.categories where slug = 'warriors_freedom_fighters');

with dimensions(code, name, description, sort_order, routing_hints) as (values
 ('formation','Early life and political rise','Education, formative choices, organisations and path to leadership.',1,array['early','education','ics','congress','rise']::text[]),
 ('politics','Political strategy and relationships','Parties, Congress, negotiations, rivals and political programs.',2,array['gandhi','nehru','patel','congress','forward bloc','politics']::text[]),
 ('ideology','Ideas of independence and the state','Political thought, discipline, planning, social policy and reconstruction.',3,array['ideas','state','planning','discipline','socialism','independence']::text[]),
 ('detention','Imprisonment, surveillance and escape','Colonial coercion, confinement, surveillance and clandestine movement.',4,array['prison','imprisoned','surveillance','escape','british']::text[]),
 ('international','International strategy and alliances','Foreign travel, diplomacy, Axis and Allied contexts and external constraints.',5,array['germany','japan','axis','international','allies','berlin']::text[]),
 ('military','Military organization and campaigns','Forces, command, campaigns, logistics, outcomes and limits.',6,array['ina','indian national army','legion','imphal','burma','military']::text[]),
 ('institutions','Azad Hind and movement institutions','Provisional government, administration, recruitment and civilian organisation.',7,array['azad hind','provisional government','government','institution']::text[]),
 ('leadership','Leadership and mobilization','Organisation, rhetoric, discipline, followers and internal tensions.',8,array['leadership','netaji','mobilization','command']::text[]),
 ('context','Wartime and colonial context','World War II, empire, occupation and the changing strategic setting.',9,array['world war','war','colonial','context','1942','1945']::text[]),
 ('interpretation','Sources and contested questions','Source authority, controversy, uncertainty and historical interpretation.',10,array['source','debate','controversy','death','disappearance','nazi']::text[]),
 ('legacy','Aftermath and public memory','INA trials, decolonisation, nationalism and later commemoration.',11,array['legacy','impact','trials','memory','significance']::text[])
)
insert into public.parameters(category_id, code, name, description, sort_order, routing_hints)
select c.id,d.code,d.name,d.description,d.sort_order,d.routing_hints from public.categories c cross join dimensions d
where c.slug='warriors_freedom_fighters' and not exists (select 1 from public.parameters p where p.category_id=c.id and p.code=d.code);

insert into public.parameter_fields(parameter_id, code, label, description, sort_order)
select p.id,p.code,p.name,p.description,1 from public.parameters p join public.categories c on c.id=p.category_id
where c.slug='warriors_freedom_fighters' and not exists (select 1 from public.parameter_fields f where f.parameter_id=p.id and f.code=p.code);

insert into public.personalities (canonical_name, alternate_names)
select 'Subhas Chandra Bose', array['Subhash Chandra Bose','Netaji','Subhas Bose','Subhash Bose']::text[]
where not exists (select 1 from public.personalities where lower(canonical_name)='subhas chandra bose');

insert into public.personality_categories(personality_id,category_id,is_primary)
select p.id,c.id,true from public.personalities p cross join public.categories c
where p.canonical_name='Subhas Chandra Bose' and c.slug='warriors_freedom_fighters'
on conflict (personality_id,category_id) do update set is_primary=true;

insert into public.personality_aliases(personality_id,alias,alias_type,confidence)
select p.id,a.alias,a.alias_type,a.confidence from public.personalities p cross join (values
 ('Subhas Chandra Bose','canonical',1.0::double precision),('Subhash Chandra Bose','alternate_name',1.0::double precision),
 ('Netaji','epithet',0.98::double precision),('Subhas Bose','alternate_name',0.99::double precision),('Subhash Bose','alternate_name',0.99::double precision)
) a(alias,alias_type,confidence) where p.canonical_name='Subhas Chandra Bose' on conflict do nothing;
