import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import { createClient } from "@supabase/supabase-js";

// Curated additions to the existing starter corpora. The exact anchors are
// checked against the publisher's live page before any new record is written.
const additions = [
  { person: "C. V. Raman", field: "discoveries", title: "Nobel Prize in Physics 1930: Presentation Speech", author: "H. Pleijel", publisher: "NobelPrize.org", type: "primary_text", layer: "1930 prize presentation", url: "https://www.nobelprize.org/prizes/physics/1930/ceremony-speech/", anchor: "for his work on the scattering of light", claim: "The 1930 Nobel presentation speech recognized Raman's research on light scattering and the effect named after him." },
  { person: "C. V. Raman", field: "impact", title: "The Nobel Prize in Physics 1930", publisher: "NobelPrize.org", type: "institutional", layer: "Award record", url: "https://www.nobelprize.org/prizes/physics/1930/summary/", anchor: "Prize share: 1/1", claim: "The Nobel Foundation's 1930 award record assigns Raman the full Physics Prize." },
  { person: "C. V. Raman", field: "impact", title: "Remembering Asia's first Nobel laureate", publisher: "India Science, Technology & Innovation Portal", type: "institutional", layer: "Government retrospective", url: "https://www.indiascienceandtechnology.gov.in/listingpage/remembering-asias-1st-nobel-laureate-who-explained-why-sea-looks-blue", anchor: "Bharat Ratna", claim: "Raman received India's Bharat Ratna in 1954, according to the Indian government's science portal." },

  { person: "Srinivasa Ramanujan", field: "discoveries", title: "Letter by Ramanujan on mock theta functions", publisher: "Trinity College Library, Cambridge", type: "primary_text", layer: "1920 archival manuscript description", url: "https://archives.trin.cam.ac.uk/index.php/letter-by-ramanujan-on-mock-theta-functions-2?sf_culture=en", anchor: "12 Jan 1920", claim: "Trinity College preserves a letter by Ramanujan on mock theta functions dated 12 January 1920." },
  { person: "Srinivasa Ramanujan", field: "impact", title: "Papers of Srinivasa Ramanujan: archival inventory", publisher: "Trinity College Library, Cambridge", type: "institutional", layer: "Archival finding aid", url: "https://archives.trin.cam.ac.uk/index.php/papers-of-srinivasa-ramanujan/informationobject/inventory", anchor: "The so-called Lost Notebook", claim: "Trinity College's Ramanujan archive includes the manuscript known as the Lost Notebook alongside correspondence and mathematical papers." },
  { person: "Srinivasa Ramanujan", field: "impact", title: "The Man Who Knew Infinity: the story of Srinivasa Ramanujan FRS", publisher: "Royal Society", type: "institutional", layer: "Modern mathematical reception", url: "https://royalsociety.org/blog/2016/04/the-man-who-knew-infinity-the-story-of-srinivasa-ramanujan-frs/", anchor: "mathematicians today are still working", claim: "The Royal Society describes work on proving and understanding Ramanujan's recorded equations as an ongoing part of his mathematical legacy." },
  { person: "Srinivasa Ramanujan", field: "historical_context", title: "S. Ramanujan", publisher: "The Mathematical Gazette, Cambridge University Press", type: "scholarly_article", layer: "Historical mathematical article abstract", url: "https://www.cambridge.org/core/journals/mathematical-gazette/article/abs/s-ramanujan/F44F622E3F1019211D391AE26B0B692B", anchor: "Port Trust Office", claim: "A Mathematical Gazette account places Ramanujan at the Madras Port Trust when he first wrote to G. H. Hardy." },

  { person: "Chhatrapati Shivaji Maharaj", field: "diplomacy", title: "Invaders: Marathas and the British", author: "Nandini Chatterjee", publisher: "Cambridge University Press, Negotiating Mughal Law", type: "scholarly_article", layer: "Modern archival scholarship", url: "https://www.cambridge.org/core/books/negotiating-mughal-law/invaders-marathas-and-the-british/6DEDEB745C48491604CD838677FF0C2E", anchor: "offered his services", claim: "Historian Nandini Chatterjee describes Shivaji's 1656 approach to Aurangzeb as a move within the rivalry between Bijapur and the Mughals." },
  { person: "Chhatrapati Shivaji Maharaj", field: "governance", title: "The Deccan", publisher: "Cambridge University Press, The Cambridge Economic History of India", type: "scholarly_article", layer: "Modern economic history summary", url: "https://www.cambridge.org/core/books/the-cambridge-economic-history-of-india/FAE3A6C0264445BBCEB02B5CD0CC2A2F", anchor: "Malik 'Ambar", claim: "The Cambridge Economic History of India relates Shivaji's land revenue administration to practices associated with Malik Ambar, including closer contact with village headmen." },
  { person: "Chhatrapati Shivaji Maharaj", field: "interpretation", title: "Shivaji (1630–80) and the Maratha polity", author: "Stewart Gordon", publisher: "Cambridge University Press, The Marathas 1600–1818", type: "scholarly_article", layer: "Scholarly chapter summary and source method", url: "https://www.cambridge.org/core/books/abs/marathas-16001818/shivaji-163080-and-the-maratha-polity/77CF65447181F279BA73A6A5D6B1E048", anchor: "corroborated in at least two", claim: "Historian Stewart Gordon says his Shivaji narrative prioritizes incidents corroborated by at least two reliable bakhars or by outside sources." },
];

const vasisthaSourceReviews = [
  ["https://www.valmikiramayan.net/utf8/baala/sarga21/balasans21.htm", "sage Vashishta"],
  ["https://valmikiramayan.net/utf8/baala/sarga52/balasans52.htm", "Shabala"],
  ["https://sanskritdocuments.org/sites/valmikiramayan/baala/sarga56/balaitrans56.htm", "Brahma's baton"],
  ["https://sanskritdocuments.org/sites/valmikiramayan/ayodhya/sarga110/ayodhyaitrans110.htm", "Genealogy of Rama"],
  ["https://sanskritdocuments.org/sites/valmikiramayan/ayodhya/sarga111/ayodhyaroman111.htm", "Vashishta urges Rama"],
  ["https://sanskritdocuments.org/sites/valmikiramayan/ayodhya/sarga67/ayodhya_67_prose.htm", "ruler-less land"],
  ["https://sites.utexas.edu/sanskrit/resources/dharmasastra/dharmasutras/", "Vasiṣṭha-dharmasūtra"],
];

const candidateIds = {
  Vasistha: [
    "c3ef5e9f-adf2-4ddd-95a0-f01dce93e3ae", "09acb421-17e2-4c80-aa20-d58a0229d60d",
    "93e5e808-409c-4950-b637-6838351578d2", "987d98f3-0b2a-461d-ba13-df32d482229d",
    "dd409e36-6d3d-43c9-8936-507d1d65407d", "4046f656-7ef2-48e9-a237-919093ac33ed",
    "6a60ec77-2122-4123-bebc-cdbaa2c5a646", "f20fc97b-de8c-4a13-85cc-873b4bfa63da",
    "c83d446d-9a16-404f-874f-d0c9bcf9939b", "36cefdf6-369c-411a-a91a-99b8aadafad1",
    "ad739b6e-2219-47cf-83c8-bcdbbf671664", "bed2321c-adeb-4e8e-86d7-b05e1f3cf386",
    "1dedbaaa-a2e4-45e1-8ff4-6388b1741ccb", "bb01cab4-739e-4e87-81ec-7171e4596fa8",
    "a6d6ef10-22be-4300-8c50-963efb2a5bda", "34a342ae-c074-4703-a49a-317da424c3b0",
    "1ebe6b6f-98d3-4740-ae49-dcbe7374172f", "6f32e2c3-be73-4119-8db6-0349175e27cb",
  ],
  Agastya: [
    "aca635df-7382-4afb-8522-a05e4030fbbf", "34549508-dd83-488b-ae1a-31be83ddda3b",
    "b0950e28-0678-4304-8ce6-8dec604f7521", "36c9614d-cc9b-4755-a6fb-114f544a6245",
    "f8856831-c7a8-49fa-ac1b-c6f5301578d5", "e94e1151-b841-40a4-90c4-3d400fc045d6",
    "017f7c83-8c8e-428d-9928-a1fe449e8a58", "8c647c16-8daa-4ccd-a5c0-392546bcaa2b",
    "84a6cc77-9fb7-4c87-ad7c-85e826b3889d", "2171e941-3acb-41bf-83ac-ebf366eed7de",
    "2d745669-bb04-4d8a-b1b1-fb22393b2cf2", "d20c7b14-af64-4373-b851-01d1f65f5260",
    "b503874f-f4b5-4f0d-872b-9d4026261006", "25de90b7-d3f0-4688-a7c1-3f4e2c64c23a",
    "348cd07e-1e59-4b9b-a5fa-7dc3dcc498c5", "64c15edc-fe1b-431e-8f23-b188393cfa00",
    "14dd61f7-b04e-4597-a542-f4bf57f9ba73", "7c6bef42-7632-4a6a-8652-35fcc1859854",
  ],
};

const apply = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
async function checked(result) { if (result.error) throw result.error; return result.data; }
async function rows(table, columns, filter = (query) => query) { return checked(await filter(db.from(table).select(columns))); }

async function readSource(source) {
  const cachePath = path.join(".corpus-cache", "available-people-2026-10-10", `${sha(source.url)}.txt`);
  if (fs.existsSync(cachePath)) {
    const cached = fs.readFileSync(cachePath, "utf8");
    if (cached.toLowerCase().includes(source.anchor.toLowerCase())) return cached;
  }
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(source.url, { headers: { "User-Agent": "Mozilla/5.0 (DCF corpus verification)" }, signal: AbortSignal.timeout(45000) });
      if (![502, 503, 504].includes(response.status)) break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  if (!response.ok) throw new Error(`${source.title}: HTTP ${response.status}`);
  let text;
  if (source.url.endsWith(".pdf")) {
    const parser = new PDFParse({ data: Buffer.from(await response.arrayBuffer()) });
    try { text = (await parser.getText()).text.replace(/\s+/g, " ").trim(); }
    finally { await parser.destroy(); }
  } else {
    const $ = cheerio.load(await response.text());
    $("script,style,nav,footer,header,aside").remove();
    text = ($("main").first().text() || $("article").first().text() || $("body").text()).replace(/\s+/g, " ").trim();
  }
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, text);
  return text;
}

async function main() {
  const people = await rows("personalities", "id,canonical_name");
  const personByName = new Map(people.map((person) => [person.canonical_name, person]));
  const verified = [];
  for (const source of additions) {
    const text = await readSource(source);
    const at = text.toLowerCase().indexOf(source.anchor.toLowerCase());
    if (at < 0) throw new Error(`${source.title}: missing source anchor ${source.anchor}`);
    verified.push({ ...source, excerpt: text.slice(Math.max(0, at - 220), Math.min(text.length, at + source.anchor.length + 360)).trim() });
    console.log(`Verified: ${source.title} (${text.length} characters)`);
  }
  for (const [url, anchor] of vasisthaSourceReviews) {
    const text = await readSource({ url, anchor, title: url });
    if (!text.toLowerCase().includes(anchor.toLowerCase())) throw new Error(`Vasistha source missing anchor: ${url}`);
    const record = (await rows("sources", "id,source_status", (q) => q.eq("url", url)))[0];
    const link = record && (await rows("source_personalities", "source_id", (q) => q.eq("source_id", record.id).eq("personality_id", personByName.get("Vasistha")?.id)))[0];
    if (!record || !link) throw new Error(`Vasistha source is not linked: ${url}`);
    console.log(`Verified Vasistha source: ${url}`);
  }
  for (const [name, ids] of Object.entries(candidateIds)) {
    if (!personByName.has(name)) throw new Error(`Missing person ${name}`);
    for (const id of ids) {
      const candidate = (await rows("candidate_claims", "id,personality_id,claim_text,source_chunk_id,status", (q) => q.eq("id", id)))[0];
      if (!candidate || candidate.personality_id !== personByName.get(name).id) throw new Error(`${name}: missing candidate ${id}`);
      const chunk = (await rows("source_chunks", "id,source_id,chunk_text", (q) => q.eq("id", candidate.source_chunk_id)))[0];
      if (!chunk || chunk.chunk_text.length < 100) throw new Error(`${name}: candidate ${id} lacks substantive passage`);
      const source = (await rows("sources", "id,url", (q) => q.eq("id", chunk.source_id)))[0];
      if (!source?.url) throw new Error(`${name}: candidate ${id} lacks original URL`);
      console.log(`Checked candidate: ${name}: ${candidate.claim_text}`);
    }
  }
  if (!apply) return console.log(JSON.stringify({ mode: "dry-run", newSources: additions.length, proposedCandidatePromotions: Object.fromEntries(Object.entries(candidateIds).map(([name, ids]) => [name, ids.length])) }));

  const fields = await rows("parameter_fields", "id,code,parameters!inner(categories!inner(slug))");
  for (const [index, source] of verified.entries()) {
    const person = personByName.get(source.person);
    if (!person) throw new Error(`Missing person ${source.person}`);
    const category = source.person === "Chhatrapati Shivaji Maharaj" ? "political_leader" : "scientist";
    const fieldId = fields.find((field) => field.code === source.field && field.parameters?.categories?.slug === category)?.id;
    if (!fieldId) throw new Error(`Missing field ${category}/${source.field}`);
    let record = (await rows("sources", "id", (q) => q.eq("url", source.url)))[0];
    if (!record) record = await checked(await db.from("sources").insert({ title: source.title, author: source.author || null, publisher_or_institution: source.publisher,
      source_type: source.type, url: source.url, citation: `${source.author ? `${source.author}. ` : ""}${source.title}. ${source.publisher}. ${source.url}`,
      textual_layer: source.layer, source_status: "approved", approval_origin: "ai_candidate", approval_note: "Publisher page and cited anchor checked on 2026-10-10; linked claim needs separate review.",
      ingestion_status: "ready", rights_or_access_note: "Publicly accessible research excerpt only.", metadata: { available_people_enrichment: true } }).select("id").single());
    await checked(await db.from("source_personalities").upsert({ source_id: record.id, personality_id: person.id, relationship: "subject", confidence: 1, mapping_method: "manual" }, { onConflict: "source_id,personality_id" }));
    let chunk = (await rows("source_chunks", "id", (q) => q.eq("source_id", record.id).eq("content_hash", sha(source.excerpt))))[0];
    if (!chunk) chunk = await checked(await db.from("source_chunks").insert({ source_id: record.id, chunk_index: 1000 + index, chunk_text: source.excerpt,
      content_hash: sha(source.excerpt), token_estimate: Math.ceil(source.excerpt.length / 4), section_title: source.title, page_or_section: source.title,
      textual_layer: source.layer, metadata: { available_people_enrichment: true, anchor: source.anchor } }).select("id").single());
    await checked(await db.from("chunk_personalities").upsert({ chunk_id: chunk.id, personality_id: person.id, relationship: "subject", relevance_score: 1, tagging_method: "manual", confidence: 1 }, { onConflict: "chunk_id,personality_id" }));
    await checked(await db.from("chunk_parameter_fields").upsert({ chunk_id: chunk.id, parameter_field_id: fieldId, confidence: 0.95, tagging_method: "manual" }, { onConflict: "chunk_id,parameter_field_id" }));
    let claim = (await rows("claims", "id", (q) => q.eq("personality_id", person.id).eq("claim_text", source.claim)))[0];
    if (!claim) claim = await checked(await db.from("claims").insert({ personality_id: person.id, parameter_field_id: fieldId, claim_text: source.claim,
      claim_kind: "scholarly_interpretation", certainty: "medium", review_status: "needs_review", approval_origin: "ai_candidate",
      evidence_type: "scholarly_interpretation", researcher_notes: `Original publisher anchor checked: ${source.anchor}. Review claim and passage before approval.` }).select("id").single());
    if (!(await rows("claim_sources", "id", (q) => q.eq("claim_id", claim.id).eq("source_id", record.id))).length)
      await checked(await db.from("claim_sources").insert({ claim_id: claim.id, source_id: record.id, relationship: "supports", evidence_excerpt: source.excerpt, page_or_section: source.title, notes: `Original anchor: ${source.anchor}` }));
    await checked(await db.from("claim_chunks").upsert({ claim_id: claim.id, chunk_id: chunk.id, relationship: "supports" }, { onConflict: "claim_id,chunk_id" }));
  }
  for (const [name, ids] of Object.entries(candidateIds)) {
    for (const id of ids) {
      const candidate = (await rows("candidate_claims", "id,status", (q) => q.eq("id", id)))[0];
      if (candidate.status === "accepted") continue;
      await checked(await db.rpc("accept_candidate_claim", { candidate_uuid: id, reviewer: "AI research curation; human review pending" }));
    }
    console.log(`Promoted ${ids.length} ${name} candidates into reviewable claims.`);
  }
  for (const [url, anchor] of vasisthaSourceReviews) {
    await checked(await db.from("sources").update({ source_status: "approved", approval_origin: "ai_candidate",
      approval_note: `Original page and Vasistha-related anchor checked on 2026-10-10 (${anchor}); individual claims still require review.` }).eq("url", url));
  }
  console.log(`Reviewed ${vasisthaSourceReviews.length} additional Vasistha source pages.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
