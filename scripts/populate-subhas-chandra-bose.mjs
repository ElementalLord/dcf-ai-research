import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sources, claims } from '../data/subhas-chandra-bose-corpus.mjs';

const name='Subhas Chandra Bose', slug='warriors_freedom_fighters';
const aliases=[name,'Subhash Chandra Bose','Netaji','Subhas Bose','Subhash Bose'];
const apply=process.argv.includes('--apply'), status=process.argv.includes('--status');
const from=process.argv.find(arg=>arg.startsWith('--from='))?.slice('--from='.length);
const norm=s=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
if(fs.existsSync('.env.local')) for(const line of fs.readFileSync('.env.local','utf8').split('\n')) { const m=line.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]] ||= m[2].replace(/^['"]|['"]$/g,''); }
const db=apply||status ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
const checked=async r=>{if(r.error) throw r.error; return r.data;};
const rows=async (table,columns,filter=q=>q)=>checked(await filter(db.from(table).select(columns)));
const excerpt=(text,anchor)=>{const at=text.toLowerCase().indexOf(anchor.toLowerCase()); if(at<0)return null; const start=Math.max(0,text.lastIndexOf('. ',at)+2),end=text.indexOf('. ',at+anchor.length); return text.slice(start,end<0?text.length:end+1).trim();};

async function identity(){
 const cat=(await rows('categories','id',q=>q.eq('slug',slug)))[0]; if(!cat) throw new Error('Run the Bose identity migration first.');
 let person=(await rows('personalities','id',q=>q.eq('canonical_name',name)))[0];
 if(!person) person=await checked(await db.from('personalities').insert({canonical_name:name,alternate_names:aliases.slice(1)}).select('id').single());
 await checked(await db.from('personality_categories').upsert({personality_id:person.id,category_id:cat.id,is_primary:true},{onConflict:'personality_id,category_id'}));
 for(const alias of aliases) if(!(await rows('personality_aliases','id',q=>q.eq('personality_id',person.id).ilike('alias',alias)))[0]) await checked(await db.from('personality_aliases').insert({personality_id:person.id,alias,alias_type:alias===name?'canonical':alias==='Netaji'?'epithet':'alternate_name',confidence:alias==='Netaji'?.98:.99}));
 return person;
}
async function main(){
 const selectedSources=from ? sources.slice(Math.max(0,sources.findIndex(source=>source.key===from))) : sources;
 if(from&&!sources.some(source=>source.key===from)) throw new Error(`Unknown source key: ${from}`);
 const passages=new Map();
 for(const source of selectedSources){const selected=claims.filter(c=>c[0]===source.key), missing=selected.filter(c=>!excerpt(source.snapshot,c[1])); console.log(`${source.key}: ${selected.length-missing.length}/${selected.length} anchors verified`); for(const c of selected)passages.set(c,excerpt(source.snapshot,c[1])); if(missing.length) console.log(' Missing: '+missing.map(c=>c[1]).join(' | '));}
 if([...passages.values()].some(v=>!v)) throw new Error('Missing a documented source anchor; no writes made.');
 if(status){const p=(await rows('personalities','id',q=>q.eq('canonical_name',name)))[0]; const [ss,cc]=p?await Promise.all([rows('source_personalities','source_id',q=>q.eq('personality_id',p.id)),rows('claims','id',q=>q.eq('personality_id',p.id))]):[[],[]]; return console.log(JSON.stringify({mode:'status',personalityId:p?.id||null,sources:ss.length,claims:cc.length}));}
 if(!apply)return console.log(JSON.stringify({mode:'dry-run',sources:sources.length,claims:claims.length}));
 const person=await identity(); const fields=await rows('parameter_fields','id,code,parameters!inner(categories!inner(slug))',q=>q.eq('parameters.categories.slug',slug)); const ids=new Map(fields.map(x=>[x.code,x.id])); for(const c of claims)if(!ids.has(c[2]))throw new Error(`Missing field: ${c[2]}`);
 const existingSources=await rows('sources','id,url',q=>q.in('url',selectedSources.map(s=>s.url))), sourceIds=new Map(existingSources.map(s=>[s.url,s.id]));
 const existingClaims=await rows('claims','id,claim_text',q=>q.eq('personality_id',person.id)),claimIds=new Map(existingClaims.map(c=>[norm(c.claim_text),c.id])); let sourcesAdded=0,claimsAdded=0,chunksAdded=0;
 for(const source of selectedSources){let sourceId=sourceIds.get(source.url); if(!sourceId){const out=await checked(await db.from('sources').insert({title:source.title,author:source.author||null,publisher_or_institution:source.publisher,source_type:source.type,publication_year:source.year||null,url:source.url,citation:`${source.author?source.author+'. ':''}${source.title}. ${source.publisher}. ${source.url}`,source_status:'approved',approval_origin:'ai_candidate',approval_note:'Curated Bose corpus; source authority is explicit and claims remain drafts requiring review.',ingestion_status:'ready',textual_layer:source.layer,rights_or_access_note:'Short documented research excerpts only. Source layers remain distinct in retrieval.',metadata:{subhas_chandra_bose_corpus:true,verified_at:'2026-10-13'}}).select('id').single());sourceId=out.id;sourceIds.set(source.url,sourceId);sourcesAdded++;}
  await checked(await db.from('source_personalities').upsert({source_id:sourceId,personality_id:person.id,relationship:'subject',confidence:1,mapping_method:'manual'},{onConflict:'source_id,personality_id'}));
  for(const [index,c] of claims.filter(x=>x[0]===source.key).entries()){const [,anchor,field,type,text]=c,passage=passages.get(c),fieldId=ids.get(field),digest=hash(passage); let chunk=(await rows('source_chunks','id',q=>q.eq('source_id',sourceId).eq('content_hash',digest).limit(1)))[0]; if(!chunk){const prior=(await rows('source_chunks','id',q=>q.eq('source_id',sourceId).eq('chunk_index',index).limit(1)))[0],values={chunk_text:passage,content_hash:digest,token_estimate:Math.ceil(passage.length/4),section_title:`${name}: ${source.title}`,page_or_section:anchor,textual_layer:source.layer,metadata:{subhas_chandra_bose_corpus:true,anchor}};chunk=prior?await checked(await db.from('source_chunks').update({...values,is_active:true,embedding_status:'not_requested',embedding:null,embedding_model:null,embedding_dimensions:null}).eq('id',prior.id).select('id').single()):await checked(await db.from('source_chunks').insert({source_id:sourceId,chunk_index:index,...values}).select('id').single()); if(!prior)chunksAdded++;}
   await checked(await db.from('chunk_personalities').upsert({chunk_id:chunk.id,personality_id:person.id,relationship:'subject',relevance_score:1,tagging_method:'manual',confidence:1},{onConflict:'chunk_id,personality_id'})); await checked(await db.from('chunk_parameter_fields').upsert({chunk_id:chunk.id,parameter_field_id:fieldId,confidence:.95,tagging_method:'manual'},{onConflict:'chunk_id,parameter_field_id'}));
   let claimId=claimIds.get(norm(text)); if(!claimId){claimId=(await checked(await db.from('claims').insert({personality_id:person.id,parameter_field_id:fieldId,claim_text:text,claim_kind:['HISTORICAL_FACT','TEXTUAL_ASSERTION','ARCHIVAL_RECORD','GOVERNMENT_RECORD'].includes(type)?'established_fact':'scholarly_interpretation',certainty:['TEXTUAL_ASSERTION','ARCHIVAL_RECORD','GOVERNMENT_RECORD'].includes(type)?'high':'medium',review_status:'draft',approval_origin:'ai_candidate',evidence_type:'uncertain',researcher_notes:`Bose curated corpus; ${source.key}; proposed ${type}. Human review required.`}).select('id').single())).id;claimIds.set(norm(text),claimId);claimsAdded++;}
   const link=(await rows('claim_sources','id',q=>q.eq('claim_id',claimId).eq('source_id',sourceId).limit(1)))[0]; const vals={evidence_excerpt:passage,page_or_section:anchor}; if(link)await checked(await db.from('claim_sources').update(vals).eq('id',link.id));else await checked(await db.from('claim_sources').insert({claim_id:claimId,source_id:sourceId,relationship:'supports',...vals,notes:`Verified source anchor: ${anchor}; proposed ${type}.`})); await checked(await db.from('claim_chunks').upsert({claim_id:claimId,chunk_id:chunk.id,relationship:'supports'},{onConflict:'claim_id,chunk_id'})); await checked(await db.from('claim_epistemics').upsert({claim_id:claimId,personality_id:person.id,epistemic_type:null,proposed_type:type,type_origin:'deterministic',type_confidence:.92,type_review_status:'needs_type_review',classifier_version:'bose-source-curation/1',contract_status:'NEEDS_TYPE_REVIEW',contract_satisfied:false,contract_version:'evidence-contracts/1',contract_detail:{reason:'Historical source layers must remain explicit.',source:source.url,anchor}},{onConflict:'claim_id'}));
  }
 }
 console.log(JSON.stringify({mode:'apply',personalityId:person.id,sources:selectedSources.length,claims:claims.filter(c=>selectedSources.some(s=>s.key===c[0])).length,sourcesAdded,claimsAdded,chunksAdded},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
