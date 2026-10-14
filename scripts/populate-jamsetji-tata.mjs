import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sources, claims } from '../data/jamsetji-tata-corpus.mjs';

const name = 'Jamsetji Tata';
const slug = 'business_institution_builder';
const aliases = [name, 'Jamsetji Nusserwanji Tata', 'Jamshedji Tata', 'J. N. Tata', 'Jamsetji N. Tata'];
const apply = process.argv.includes('--apply');
const status = process.argv.includes('--status');
const norm = (text) => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');
if (fs.existsSync('.env.local')) for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) { const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match) process.env[match[1]] ||= match[2].replace(/^['"]|['"]$/g, ''); }
const db = apply || status ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
const checked = async (result) => { if (result.error) throw result.error; return result.data; };
const rows = async (table, columns, filter = (query) => query) => checked(await filter(db.from(table).select(columns)));
const excerpt = (text, anchor) => { const at = text.toLowerCase().indexOf(anchor.toLowerCase()); if (at < 0) return null; const start = Math.max(0, text.lastIndexOf('. ', at) + 2); const end = text.indexOf('. ', at + anchor.length); return text.slice(start, end < 0 ? text.length : end + 1).trim(); };

async function identity() {
  const category = (await rows('categories', 'id', (q) => q.eq('slug', slug)))[0];
  if (!category) throw new Error('Run the Jamsetji Tata identity migration first.');
  let person = (await rows('personalities', 'id', (q) => q.eq('canonical_name', name)))[0];
  if (!person) person = await checked(await db.from('personalities').insert({ canonical_name: name, alternate_names: aliases.slice(1) }).select('id').single());
  await checked(await db.from('personality_categories').upsert({ personality_id: person.id, category_id: category.id, is_primary: true }, { onConflict: 'personality_id,category_id' }));
  for (const alias of aliases) if (!(await rows('personality_aliases', 'id', (q) => q.eq('personality_id', person.id).ilike('alias', alias)))[0]) await checked(await db.from('personality_aliases').insert({ personality_id: person.id, alias, alias_type: alias === name ? 'canonical' : 'alternate_name', confidence: alias === 'J. N. Tata' ? .95 : .99 }));
  return person;
}

async function main() {
  const passages = new Map();
  for (const source of sources) {
    const selected = claims.filter((claim) => claim[0] === source.key);
    const missing = selected.filter((claim) => !excerpt(source.snapshot, claim[1]));
    console.log(`${source.key}: ${selected.length - missing.length}/${selected.length} anchors verified`);
    for (const claim of selected) passages.set(claim, excerpt(source.snapshot, claim[1]));
    if (missing.length) console.log(` Missing: ${missing.map((claim) => claim[1]).join(' | ')}`);
  }
  if ([...passages.values()].some((passage) => !passage)) throw new Error('Missing a documented source anchor; no writes made.');
  if (status) { const person = (await rows('personalities', 'id', (q) => q.eq('canonical_name', name)))[0]; const [sourceRows, claimRows, memberships] = person ? await Promise.all([rows('source_personalities', 'source_id', (q) => q.eq('personality_id', person.id)), rows('claims', 'id', (q) => q.eq('personality_id', person.id)), rows('personality_categories', 'is_primary,categories(name,slug)', (q) => q.eq('personality_id', person.id))]) : [[], [], []]; return console.log(JSON.stringify({ mode: 'status', personalityId: person?.id || null, sources: sourceRows.length, claims: claimRows.length, memberships })); }
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', sources: sources.length, claims: claims.length }));
  const person = await identity();
  const fields = await rows('parameter_fields', 'id,code,parameters!inner(categories!inner(slug))', (q) => q.eq('parameters.categories.slug', slug));
  const fieldIds = new Map(fields.map((field) => [field.code, field.id]));
  for (const claim of claims) if (!fieldIds.has(claim[2])) throw new Error(`Unknown builder field: ${claim[2]}`);
  const presentSources = await rows('sources', 'id,url', (q) => q.in('url', sources.map((source) => source.url)));
  const sourceIds = new Map(presentSources.map((source) => [source.url, source.id]));
  const presentClaims = await rows('claims', 'id,claim_text', (q) => q.eq('personality_id', person.id));
  const claimIds = new Map(presentClaims.map((claim) => [norm(claim.claim_text), claim.id]));
  let sourcesAdded = 0, claimsAdded = 0, chunksAdded = 0;
  for (const source of sources) {
    let sourceId = sourceIds.get(source.url);
    if (!sourceId) { sourceId = (await checked(await db.from('sources').insert({ title: source.title, author: source.author || null, publisher_or_institution: source.publisher, source_type: source.type, publication_year: source.year || null, url: source.url, citation: `${source.author ? `${source.author}. ` : ''}${source.title}. ${source.publisher}. ${source.url}`, source_status: 'approved', approval_origin: 'ai_candidate', approval_note: 'Curated Jamsetji Tata corpus; source authority and historical layers are explicit; claims remain draft records for review.', ingestion_status: 'ready', textual_layer: source.layer, rights_or_access_note: 'Short documented research excerpts only. Corporate history, archival catalogues, and independent scholarship remain distinct.', metadata: { jamsetji_tata_corpus: true, verified_at: '2026-10-13' } }).select('id').single())).id; sourceIds.set(source.url, sourceId); sourcesAdded++; }
    await checked(await db.from('source_personalities').upsert({ source_id: sourceId, personality_id: person.id, relationship: 'subject', confidence: 1, mapping_method: 'manual' }, { onConflict: 'source_id,personality_id' }));
    for (const [index, claim] of claims.filter((item) => item[0] === source.key).entries()) {
      const [, anchor, field, proposedType, claimText] = claim; const passage = passages.get(claim); const hash = digest(passage);
      let chunk = (await rows('source_chunks', 'id', (q) => q.eq('source_id', sourceId).eq('content_hash', hash).limit(1)))[0];
      if (!chunk) { const prior = (await rows('source_chunks', 'id', (q) => q.eq('source_id', sourceId).eq('chunk_index', index).limit(1)))[0]; const values = { chunk_text: passage, content_hash: hash, token_estimate: Math.ceil(passage.length / 4), section_title: `${name}: ${source.title}`, page_or_section: anchor, textual_layer: source.layer, metadata: { jamsetji_tata_corpus: true, anchor } }; chunk = prior ? await checked(await db.from('source_chunks').update({ ...values, is_active: true, embedding_status: 'not_requested', embedding: null, embedding_model: null, embedding_dimensions: null }).eq('id', prior.id).select('id').single()) : await checked(await db.from('source_chunks').insert({ source_id: sourceId, chunk_index: index, ...values }).select('id').single()); if (!prior) chunksAdded++; }
      await checked(await db.from('chunk_personalities').upsert({ chunk_id: chunk.id, personality_id: person.id, relationship: 'subject', relevance_score: 1, tagging_method: 'manual', confidence: 1 }, { onConflict: 'chunk_id,personality_id' }));
      await checked(await db.from('chunk_parameter_fields').upsert({ chunk_id: chunk.id, parameter_field_id: fieldIds.get(field), confidence: .95, tagging_method: 'manual' }, { onConflict: 'chunk_id,parameter_field_id' }));
      let claimId = claimIds.get(norm(claimText));
      if (!claimId) { const established = ['HISTORICAL_FACT', 'ARCHIVAL_RECORD'].includes(proposedType); claimId = (await checked(await db.from('claims').insert({ personality_id: person.id, parameter_field_id: fieldIds.get(field), claim_text: claimText, claim_kind: established ? 'established_fact' : 'scholarly_interpretation', certainty: established ? 'high' : 'medium', review_status: 'draft', approval_origin: 'ai_candidate', evidence_type: 'uncertain', researcher_notes: `Jamsetji Tata curated corpus; ${source.key}; proposed ${proposedType}. Human review required.` }).select('id').single())).id; claimIds.set(norm(claimText), claimId); claimsAdded++; }
      const link = (await rows('claim_sources', 'id', (q) => q.eq('claim_id', claimId).eq('source_id', sourceId).limit(1)))[0]; const linkValues = { evidence_excerpt: passage, page_or_section: anchor };
      if (link) await checked(await db.from('claim_sources').update(linkValues).eq('id', link.id)); else await checked(await db.from('claim_sources').insert({ claim_id: claimId, source_id: sourceId, relationship: 'supports', ...linkValues, notes: `Verified source anchor: ${anchor}; proposed ${proposedType}.` }));
      await checked(await db.from('claim_chunks').upsert({ claim_id: claimId, chunk_id: chunk.id, relationship: 'supports' }, { onConflict: 'claim_id,chunk_id' }));
      await checked(await db.from('claim_epistemics').upsert({ claim_id: claimId, personality_id: person.id, epistemic_type: null, proposed_type: proposedType, type_origin: 'deterministic', type_confidence: .92, type_review_status: 'needs_type_review', classifier_version: 'jamsetji-tata-source-curation/1', contract_status: 'NEEDS_TYPE_REVIEW', contract_satisfied: false, contract_version: 'evidence-contracts/1', contract_detail: { reason: 'Corporate self-description, archival evidence, and independent scholarship remain distinct.', source: source.url, anchor } }, { onConflict: 'claim_id' }));
    }
  }
  console.log(JSON.stringify({ mode: 'apply', personalityId: person.id, sources: sources.length, claims: claims.length, sourcesAdded, claimsAdded, chunksAdded }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
