import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sources as tagoreSources, claims as tagoreClaims } from '../data/rabindranath-tagore-corpus.mjs';
import { sources as raySources, claims as rayClaims } from '../data/satyajit-ray-corpus.mjs';
import { sources as jrdSources, claims as jrdClaims } from '../data/jrd-tata-corpus.mjs';
import { sources as jamsetjiSources, claims as jamsetjiClaims } from '../data/jamsetji-tata-corpus.mjs';

const apply = process.argv.includes('--apply');
const statusOnly = process.argv.includes('--status');
const norm = (text) => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');
const sourceType = (type) => ({ archival_catalogue:'institutional', digital_archive:'institutional', film_institution:'institutional', government_record:'institutional', critical_essay:'scholarly_article', business_case:'scholarly_article', scholarly_book_chapter:'scholarly_article', primary_source:'primary_text' })[type] || type;
if (fs.existsSync('.env.local')) for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) { const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match) process.env[match[1]] ||= match[2].replace(/^['"]|['"]$/g, ''); }
const db = apply || statusOnly ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
const checked = async (result) => { if (result.error) throw result.error; return result.data; };
const rows = async (table, columns, filter = (query) => query) => checked(await filter(db.from(table).select(columns)));
const excerpt = (text, anchor) => { const at = text.toLowerCase().indexOf(anchor.toLowerCase()); if (at < 0) return null; const start = Math.max(0, text.lastIndexOf('. ', at) + 2); const end = text.indexOf('. ', at + anchor.length); return text.slice(start, end < 0 ? text.length : end + 1).trim(); };

const culturalFields = [
  ['formation','Life and intellectual formation','Family, education, artistic background, and career development.',['who','born','early life','background','education','career']],
  ['works','Works and genres','Major works, forms, adaptations, characters, publications, and signature contributions.',['work','book','poem','novel','film','story','gitanjali','apu']],
  ['craft','Artistic craft and method','Writing, direction, design, visual form, composition, and creative process.',['style','method','directing','design','visual','screenplay','technique']],
  ['cultural_practice','Music, performance and cultural practice','Music, performance, language, circulation, and lived cultural influence.',['music','song','performance','bengali','culture']],
  ['ideas','Philosophical and human questions','Humanism, spirituality, ethics, freedom, and conceptions of the person.',['humanism','spirituality','philosophy','freedom','ethics']],
  ['society_politics','Society, politics and historical context','Colonialism, nationalism, class, gender, public life, and social change.',['nationalism','colonial','politics','society','class','gender']],
  ['institutions','Education and institutions','Schools, archives, societies, public support, and durable cultural organizations.',['school','university','institution','archive','society','santiniketan']],
  ['relationships','Contemporaries and collaborators','Creative collaborators, interlocutors, disagreement, and shared authorship.',['collaborator','contemporary','relationship','gandhi','cinematographer']],
  ['international','International exchange and recognition','Translation, travel, prizes, festivals, cross-cultural exchange, and global reception.',['international','world','nobel','academy','oscar','festival']],
  ['interpretation','Interpretation, limits and contested claims','Scholarly readings, source limits, misquotation, criticism, and competing assessments.',['theme','interpretation','criticism','misquote','limit']],
  ['legacy','Long-term cultural impact','Influence, preservation, teaching, adaptation, and continuing public life.',['impact','legacy','influence','today','restoration']]
];
const businessFields = [
  ['formation','Early life and business formation','Family background, education, networks, and entry into enterprise.',['who','born','early life','background','education','career']],
  ['enterprise','Enterprise, management and leadership','Businesses, management, strategy, professional leadership, risk, and organizational development.',['business','company','enterprise','strategy','management','leadership']],
  ['industry','Industry and industrialization','Sectors, technology, production, and industrial capabilities.',['industry','textile','steel','manufacturing','industrialization']],
  ['infrastructure','Infrastructure, power and aviation','Energy, transport, aviation, buildings, urban systems, and their strategic role.',['power','hydro','electricity','hotel','infrastructure','aviation','airline']],
  ['science_education','Science and education','Research, training, universities, and technical capability.',['science','education','institute','university','research']],
  ['social_welfare','Employee welfare and social provision','Workplace conditions, benefits, philanthropy, public service, and their limits.',['worker','employee','welfare','philanthropy','labour','social']],
  ['national_development','National development and economic context','Economic setting, state relations, self-reliance, and public consequences.',['india','colonial','national','development','economy','state']],
  ['institutions','Institution-building and continuity','Founding, governance, succession, and later institutional effects.',['institution','legacy','trust','tata','successor','foundation']],
  ['challenges','Challenges, trade-offs and limits','Setbacks, constraints, uncertainty, criticism, and contested consequences.',['challenge','setback','failure','limit','criticism','governance']],
  ['legacy','Long-term impact and interpretation','Later reception, historical interpretation, and bounded impact claims.',['important','impact','legacy','today','influence','why']]
];

const configs = [
  { name:'Rabindranath Tagore', slug:'cultural_figure', aliases:['Rabindranath Tagore','Rabindranath Thakur','Gurudev Tagore'], sources:tagoreSources, claims:tagoreClaims, corpus:'rabindranath_tagore' },
  { name:'Satyajit Ray', slug:'cultural_figure', aliases:['Satyajit Ray','Manik Ray'], sources:raySources, claims:rayClaims, corpus:'satyajit_ray' },
  { name:'J. R. D. Tata', slug:'business_institution_builder', aliases:['J. R. D. Tata','JRD Tata','Jehangir Ratanji Dadabhoy Tata','J. R. D.'], sources:jrdSources, claims:jrdClaims, corpus:'jrd_tata' },
  { name:'Jamsetji Tata', slug:'business_institution_builder', aliases:['Jamsetji Tata','Jamsetji Nusserwanji Tata','Jamshedji Tata','J. N. Tata','Jamsetji N. Tata'], sources:jamsetjiSources, claims:jamsetjiClaims, corpus:'jamsetji_tata' }
];

async function ensureFramework(slug, name, description, fields) {
  let category = (await rows('categories', 'id', (q) => q.eq('slug', slug)))[0];
  if (!category) category = await checked(await db.from('categories').insert({ slug, name, description }).select('id').single());
  else await checked(await db.from('categories').update({ name, description }).eq('id', category.id));
  const existingParameters = await rows('parameters', 'id,code', (q) => q.eq('category_id', category.id));
  const parameters = new Map(existingParameters.map((item) => [item.code, item.id]));
  for (const [index, [code, fieldName, fieldDescription, routingHints]] of fields.entries()) {
    let parameterId = parameters.get(code);
    if (!parameterId) parameterId = (await checked(await db.from('parameters').insert({ category_id:category.id, code, name:fieldName, description:fieldDescription, sort_order:index + 1, routing_hints:routingHints }).select('id').single())).id;
    else await checked(await db.from('parameters').update({ name:fieldName, description:fieldDescription, sort_order:index + 1, routing_hints:routingHints }).eq('id', parameterId));
    if (!(await rows('parameter_fields', 'id', (q) => q.eq('parameter_id', parameterId).eq('code', code)))[0]) await checked(await db.from('parameter_fields').insert({ parameter_id:parameterId, code, label:fieldName, description:fieldDescription, sort_order:1 }));
  }
  return category;
}

async function ensureIdentity(config, category) {
  let person = (await rows('personalities', 'id', (q) => q.ilike('canonical_name', config.name)))[0];
  if (!person) person = await checked(await db.from('personalities').insert({ canonical_name:config.name, alternate_names:config.aliases.slice(1) }).select('id').single());
  await checked(await db.from('personality_categories').upsert({ personality_id:person.id, category_id:category.id, is_primary:true }, { onConflict:'personality_id,category_id' }));
  for (const alias of config.aliases) if (!(await rows('personality_aliases', 'id', (q) => q.eq('personality_id', person.id).ilike('alias', alias)))[0]) await checked(await db.from('personality_aliases').insert({ personality_id:person.id, alias, alias_type:alias === config.name ? 'canonical' : 'alternate_name', confidence:alias === 'J. R. D.' || alias === 'Manik Ray' ? .85 : .98 }));
  return person;
}

async function ensureAuthority(source) {
  const domain = new URL(source.url).hostname.toLowerCase();
  const existing = (await rows('approved_source_access', 'id', (q) => q.eq('domain', domain).eq('scope_type', 'EXACT_URL').eq('exact_url', source.url).limit(1)))[0];
  if (existing) return existing.id;
  return (await checked(await db.from('approved_source_access').insert({ display_name:source.publisher, domain, scope_type:'EXACT_URL', exact_url:source.url, include_subdomains:false, allow_live_search:false, allow_live_fetch:false, allow_ingestion:false, evidence_use_status:'approved', priority:20, default_textual_layer:source.layer, default_source_type:sourceType(source.type), cache_ttl_hours:720, is_active:true, approval_origin:'ai_candidate', notes:'Exact source used in the DCF 25-person milestone corpus; authority and textual layer checked, claims remain review-required.' }).select('id').single())).id;
}

async function populate(config, category) {
  const person = await ensureIdentity(config, category);
  const fields = await rows('parameter_fields', 'id,code,parameters!inner(categories!inner(slug))', (q) => q.eq('parameters.categories.slug', config.slug));
  const fieldIds = new Map(fields.map((field) => [field.code, field.id]));
  for (const claim of config.claims) if (!fieldIds.has(claim[2])) throw new Error(`${config.name}: unknown framework field ${claim[2]}`);
  const existingSources = await rows('sources', 'id,url', (q) => q.in('url', config.sources.map((source) => source.url)));
  const sourceIds = new Map(existingSources.map((source) => [source.url, source.id]));
  const existingClaims = await rows('claims', 'id,claim_text', (q) => q.eq('personality_id', person.id));
  const claimIds = new Map(existingClaims.map((claim) => [norm(claim.claim_text), claim.id]));
  const counts = { sourcesAdded:0, claimsAdded:0, chunksAdded:0 };
  for (const source of config.sources) {
    await ensureAuthority(source);
    let sourceId = sourceIds.get(source.url);
    if (!sourceId) {
      sourceId = (await checked(await db.from('sources').insert({ title:source.title, author:source.author || null, publisher_or_institution:source.publisher, source_type:sourceType(source.type), publication_year:source.year || null, url:source.url, citation:`${source.author ? `${source.author}. ` : ''}${source.title}. ${source.publisher}. ${source.url}`, source_status:'approved', approval_origin:'ai_candidate', approval_note:`Curated ${config.name} corpus; exact source authority and textual layer recorded; claims remain draft records requiring human review.`, ingestion_status:'ready', textual_layer:source.layer, rights_or_access_note:'Short documented research extracts only; primary, institutional and independent interpretive layers remain distinct.', metadata:{ [`${config.corpus}_corpus`]:true, verified_at:'2026-10-13', source_authority_checked:true, research_source_type:source.type } }).select('id').single())).id;
      sourceIds.set(source.url, sourceId); counts.sourcesAdded++;
    }
    await checked(await db.from('source_personalities').upsert({ source_id:sourceId, personality_id:person.id, relationship:'subject', confidence:1, mapping_method:'manual' }, { onConflict:'source_id,personality_id' }));
    const existingChunks = await rows('source_chunks', 'id,content_hash,chunk_index', (q) => q.eq('source_id', sourceId));
    const byHash = new Map(existingChunks.map((chunk) => [chunk.content_hash, chunk]));
    let nextIndex = existingChunks.reduce((max, chunk) => Math.max(max, chunk.chunk_index), -1) + 1;
    for (const claim of config.claims.filter((item) => item[0] === source.key)) {
      const [, anchor, field, proposedType, claimText] = claim;
      const passage = excerpt(source.snapshot, anchor);
      if (!passage) throw new Error(`${config.name}: missing anchor "${anchor}" in ${source.key}`);
      const hash = digest(passage);
      let chunk = byHash.get(hash);
      if (!chunk) {
        chunk = await checked(await db.from('source_chunks').insert({ source_id:sourceId, chunk_index:nextIndex++, chunk_text:passage, content_hash:hash, token_estimate:Math.ceil(passage.length / 4), section_title:`${config.name}: ${source.title}`, page_or_section:anchor, textual_layer:source.layer, metadata:{ [`${config.corpus}_corpus`]:true, anchor, curated_extract:true } }).select('id,content_hash,chunk_index').single());
        byHash.set(hash, chunk); counts.chunksAdded++;
      }
      await checked(await db.from('chunk_personalities').upsert({ chunk_id:chunk.id, personality_id:person.id, relationship:'subject', relevance_score:1, tagging_method:'manual', confidence:1 }, { onConflict:'chunk_id,personality_id' }));
      await checked(await db.from('chunk_parameter_fields').upsert({ chunk_id:chunk.id, parameter_field_id:fieldIds.get(field), confidence:.95, tagging_method:'manual' }, { onConflict:'chunk_id,parameter_field_id' }));
      let claimId = claimIds.get(norm(claimText));
      if (!claimId) {
        const established = ['HISTORICAL_FACT','ARCHIVAL_RECORD','GOVERNMENT_RECORD','INSTITUTIONAL_RECORD'].includes(proposedType);
        claimId = (await checked(await db.from('claims').insert({ personality_id:person.id, parameter_field_id:fieldIds.get(field), claim_text:claimText, claim_kind:established ? 'established_fact' : 'scholarly_interpretation', certainty:established ? 'high' : 'medium', review_status:'draft', approval_origin:'ai_candidate', evidence_type:'uncertain', researcher_notes:`${config.name} milestone corpus; ${source.key}; proposed ${proposedType}. Exact source anchor and layer recorded. Human review required.` }).select('id').single())).id;
        claimIds.set(norm(claimText), claimId); counts.claimsAdded++;
      }
      const link = (await rows('claim_sources', 'id', (q) => q.eq('claim_id', claimId).eq('source_id', sourceId).limit(1)))[0];
      const linkValues = { evidence_excerpt:passage, page_or_section:anchor };
      if (link) await checked(await db.from('claim_sources').update(linkValues).eq('id', link.id));
      else await checked(await db.from('claim_sources').insert({ claim_id:claimId, source_id:sourceId, relationship:'supports', ...linkValues, notes:`Verified source anchor: ${anchor}; proposed ${proposedType}.` }));
      await checked(await db.from('claim_chunks').upsert({ claim_id:claimId, chunk_id:chunk.id, relationship:'supports' }, { onConflict:'claim_id,chunk_id' }));
      await checked(await db.from('claim_epistemics').upsert({ claim_id:claimId, personality_id:person.id, epistemic_type:null, proposed_type:proposedType, type_origin:'deterministic', type_confidence:.92, type_review_status:'needs_type_review', classifier_version:'final-four-source-curation/1', contract_status:'NEEDS_TYPE_REVIEW', contract_satisfied:false, contract_version:'evidence-contracts/1', contract_detail:{ reason:'Source layer and proposed epistemic type require human review.', source:source.url, anchor } }, { onConflict:'claim_id' }));
    }
  }
  return { name:config.name, personalityId:person.id, sources:config.sources.length, claims:config.claims.length, ...counts };
}

async function audit() {
  const people = await rows('personalities', 'id,canonical_name,personality_categories(is_primary,categories(slug,name))');
  const duplicates = Object.entries(people.reduce((map, person) => { const key = norm(person.canonical_name); map[key] = (map[key] || 0) + 1; return map; }, {})).filter(([, count]) => count > 1);
  const finalFour = [];
  for (const config of configs) {
    const person = people.find((item) => item.canonical_name === config.name);
    if (!person) { finalFour.push({ name:config.name, present:false }); continue; }
    const [sourceLinks, claims, chunks] = await Promise.all([
      rows('source_personalities', 'source_id', (q) => q.eq('personality_id', person.id)),
      rows('claims', 'id,review_status', (q) => q.eq('personality_id', person.id)),
      rows('chunk_personalities', 'chunk_id', (q) => q.eq('personality_id', person.id))
    ]);
    finalFour.push({ name:config.name, present:true, categories:person.personality_categories, sources:sourceLinks.length, claims:claims.length, draftClaims:claims.filter((claim) => claim.review_status === 'draft').length, passages:chunks.length });
  }
  return { totalPersonalities:people.length, withoutType:people.filter((person) => !person.personality_categories?.length).map((person) => person.canonical_name), withoutPrimaryFramework:people.filter((person) => !person.personality_categories?.some((item) => item.is_primary)).map((person) => person.canonical_name), duplicates, finalFour };
}

async function main() {
  for (const config of configs) {
    for (const source of config.sources) {
      const selected = config.claims.filter((claim) => claim[0] === source.key);
      const missing = selected.filter((claim) => !excerpt(source.snapshot, claim[1]));
      console.log(`${config.name} / ${source.key}: ${selected.length - missing.length}/${selected.length} anchors verified`);
      if (missing.length) throw new Error(`Missing anchors: ${missing.map((claim) => claim[1]).join(' | ')}`);
    }
  }
  if (!apply && !statusOnly) return console.log(JSON.stringify({ mode:'dry-run', people:configs.map((config) => ({ name:config.name, sources:config.sources.length, claims:config.claims.length })) }, null, 2));
  if (statusOnly) return console.log(JSON.stringify({ mode:'status', ...(await audit()) }, null, 2));
  const cultural = await ensureFramework('cultural_figure', 'Authors, Artists & Cultural Figures', 'Evidence-led research on creative works, artistic practice, ideas, institutions, social context, reception, and cultural legacy.', culturalFields);
  const business = await ensureFramework('business_institution_builder', 'Business & Industrial Leaders', 'Evidence-led research on enterprise, industry, management, infrastructure, social provision, institutions, and national development.', businessFields);
  const results = [];
  for (const config of configs) results.push(await populate(config, config.slug === 'cultural_figure' ? cultural : business));
  console.log(JSON.stringify({ mode:'apply', results, audit:await audit() }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
