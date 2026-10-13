import fs from 'node:fs';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';
import { createClient } from '@supabase/supabase-js';
import { sources, claims } from '../data/adi-shankaracharya-corpus.mjs';

const name = 'Adi Shankaracharya', slug = 'spiritual_teacher', apply = process.argv.includes('--apply');
const aliases = [name, 'Adi Shankara', 'Shankaracharya', 'Shankara', 'Shri Shankaracharya', 'Sri Shankaracharya', 'Shankara Bhagavatpada'];
const kinds = { TEXTUAL_ASSERTION:['textual_tradition','high','direct_primary_text'], HISTORICAL_FACT:['established_fact','high','historical_inference'], HISTORICAL_INFERENCE:['scholarly_interpretation','medium','historical_inference'], SCHOLARLY_INTERPRETATION:['scholarly_interpretation','medium','scholarly_interpretation'], TRADITIONAL_NARRATIVE:['traditional_account','medium','traditional_narrative'], MODERN_RECEPTION:['scholarly_interpretation','medium','scholarly_interpretation'], CONTESTED:['uncertain','medium','contested'] };
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) { const m=line.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g,''); }
const db = apply ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}}) : null;
const norm = s => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const digest = s => crypto.createHash('sha256').update(s).digest('hex');
async function checked(r) { if(r.error) throw r.error; return r.data; }
async function rows(t,c,f=q=>q) { return checked(await f(db.from(t).select(c))); }
async function text(source) {
  const r=await fetch(source.url,{headers:{'user-agent':'Mozilla/5.0 (DCF evidence verification)'},signal:AbortSignal.timeout(60000)}); if(!r.ok) throw Error(`${source.key}: HTTP ${r.status}`);
  const bytes=Buffer.from(await r.arrayBuffer()); let raw;
  if (source.url.endsWith('.pdf') || bytes.subarray(0,5).toString()==='%PDF-') { const p=new PDFParse({data:bytes}); try { raw=(await p.getText()).text; } finally { await p.destroy(); } }
  else { const $=cheerio.load(bytes.toString('utf8')); $('script,style,nav,footer,header,aside').remove(); raw=$('main').first().text()||$('article').first().text()||$('body').text(); }
  // Normalize scholarly transliteration for stable anchors without changing the evidence layer.
  return raw.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}
function excerpt(text, anchor) { const i=text.toLowerCase().indexOf(anchor.toLowerCase()); if(i<0) return null; const start=Math.max(0,text.lastIndexOf('. ',i-350)+2); let end=text.indexOf('. ',i+anchor.length+260); if(end<0) end=Math.min(text.length,i+anchor.length+700); return text.slice(start,end+1).trim(); }
async function identity() {
 const cat=(await rows('categories','id',q=>q.eq('slug',slug)))[0]; if(!cat) throw Error('Missing spiritual_teacher category');
 let person=(await rows('personalities','id',q=>q.eq('canonical_name',name)))[0]; if(!person) person=await checked(await db.from('personalities').insert({canonical_name:name,alternate_names:aliases.slice(1)}).select('id').single());
 await checked(await db.from('personality_categories').upsert({personality_id:person.id,category_id:cat.id,is_primary:true},{onConflict:'personality_id,category_id'}));
 for(const alias of aliases) if(!(await rows('personality_aliases','id',q=>q.eq('personality_id',person.id).ilike('alias',alias))).length) await checked(await db.from('personality_aliases').insert({personality_id:person.id,alias,alias_type:alias===name?'canonical':'alternate_name',confidence:alias===name?1:.97}));
 return person;
}
async function main() {
 const texts=new Map(), passages=new Map();
 for(const source of sources) { const body=await text(source); texts.set(source.key,body); const selected=claims.filter(c=>c[0]===source.key), missing=[]; for(const claim of selected) { const p=excerpt(body,claim[1]); if(p) passages.set(claim,p); else missing.push(claim[1]); } console.log(`${source.key}: ${selected.length-missing.length}/${selected.length} anchors verified`); if(missing.length) console.log(`  Missing: ${missing.join(' | ')}`); }
 if(passages.size!==claims.length) throw Error('Source anchors missing; no corpus writes made.');
 if(!apply) return console.log(JSON.stringify({mode:'dry-run',sources:sources.length,claims:claims.length}));
 const person=await identity(), fields=await rows('parameter_fields','id,code,parameters!inner(categories!inner(slug))',q=>q.eq('parameters.categories.slug',slug)); const fieldIds=new Map(fields.map(f=>[f.code,f.id]));
 const sourceIds=new Map((await rows('sources','id,url',q=>q.in('url',sources.map(s=>s.url)))).map(s=>[s.url,s.id])); const claimIds=new Map((await rows('claims','id,claim_text',q=>q.eq('personality_id',person.id))).map(c=>[norm(c.claim_text),c.id])); const counts={sourcesAdded:0,claimsAdded:0,chunksAdded:0};
 for(const source of sources) { let sourceId=sourceIds.get(source.url); if(!sourceId) { sourceId=(await checked(await db.from('sources').insert({title:source.title,author:source.author,publisher_or_institution:source.publisher,source_type:source.type,publication_year:source.year||null,url:source.url,citation:`${source.author}. ${source.title}. ${source.publisher}. ${source.url}`,source_status:'approved',approval_origin:'ai_candidate',approval_note:'Original source and exact claim anchors verified; textual layer recorded; human review remains required.',ingestion_status:'ready',textual_layer:source.layer,rights_or_access_note:'Publicly accessible source; short research excerpts only.',metadata:{adi_shankaracharya_corpus:true,verified_at:'2026-10-13'}}).select('id').single())).id; counts.sourcesAdded++; } sourceIds.set(source.url,sourceId);
  await checked(await db.from('source_personalities').upsert({source_id:sourceId,personality_id:person.id,relationship:'subject',confidence:1,mapping_method:'manual'},{onConflict:'source_id,personality_id'}));
  for(const [index,claim] of claims.filter(c=>c[0]===source.key).entries()) { const [,anchor,field,type,statement,locator]=claim, passage=passages.get(claim), fieldId=fieldIds.get(field); if(!fieldId) throw Error(`Missing field ${field}`); let chunk=(await rows('source_chunks','id',q=>q.eq('source_id',sourceId).eq('content_hash',digest(passage)).limit(1)))[0]; if(!chunk) { const prior=(await rows('source_chunks','id,metadata',q=>q.eq('source_id',sourceId).eq('chunk_index',index).limit(1)))[0], values={chunk_text:passage,content_hash:digest(passage),token_estimate:Math.ceil(passage.length/4),section_title:`${name}: ${statement}`,page_or_section:locator,textual_layer:source.layer,metadata:{adi_shankaracharya_corpus:true,anchor}}; if(prior?.metadata?.adi_shankaracharya_corpus) chunk=await checked(await db.from('source_chunks').update({...values,is_active:true,embedding_status:'not_requested',embedding:null,embedding_model:null,embedding_dimensions:null}).eq('id',prior.id).select('id').single()); else { const last=(await rows('source_chunks','chunk_index',q=>q.eq('source_id',sourceId).order('chunk_index',{ascending:false}).limit(1)))[0]; chunk=await checked(await db.from('source_chunks').insert({source_id:sourceId,chunk_index:last?last.chunk_index+1:0,...values}).select('id').single()); counts.chunksAdded++; } }
   await checked(await db.from('chunk_personalities').upsert({chunk_id:chunk.id,personality_id:person.id,relationship:'subject',relevance_score:1,tagging_method:'manual',confidence:1},{onConflict:'chunk_id,personality_id'})); await checked(await db.from('chunk_parameter_fields').upsert({chunk_id:chunk.id,parameter_field_id:fieldId,confidence:.95,tagging_method:'manual'},{onConflict:'chunk_id,parameter_field_id'})); let claimId=claimIds.get(norm(statement)); if(!claimId) { const [kind,certainty,evidence]=kinds[type]; claimId=(await checked(await db.from('claims').insert({personality_id:person.id,parameter_field_id:fieldId,claim_text:statement,claim_kind:kind,certainty,review_status:'draft',approval_origin:'ai_candidate',evidence_type:evidence,researcher_notes:`Adi Shankaracharya curated corpus; ${source.key}; ${type}; exact anchor verified. Human review required.`}).select('id').single())).id; claimIds.set(norm(statement),claimId); counts.claimsAdded++; }
   const existing=(await rows('claim_sources','id',q=>q.eq('claim_id',claimId).eq('source_id',sourceId).limit(1)))[0]; if(!existing) await checked(await db.from('claim_sources').insert({claim_id:claimId,source_id:sourceId,relationship:'supports',evidence_excerpt:passage,page_or_section:locator,notes:`Exact source anchor: ${anchor}; claim requires review.`})); await checked(await db.from('claim_chunks').upsert({claim_id:claimId,chunk_id:chunk.id,relationship:'supports'},{onConflict:'claim_id,chunk_id'})); await checked(await db.from('claim_epistemics').upsert({claim_id:claimId,personality_id:person.id,epistemic_type:null,proposed_type:type,type_origin:'deterministic',type_confidence:.9,type_review_status:'needs_type_review',classifier_version:'adi-shankaracharya-source-curation/1',contract_status:'NEEDS_TYPE_REVIEW',contract_satisfied:false,contract_version:'evidence-contracts/1',contract_detail:{source:source.url,layer:source.layer,anchor}},{onConflict:'claim_id'})); }
 }
 console.log(JSON.stringify({mode:'apply',personalityId:person.id,sources:sources.length,claims:claims.length,...counts},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
