import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { sources, claims } from "../data/verghese-kurien-corpus.mjs";

const name = "Verghese Kurien";
const slug = "social_entrepreneur";
const aliases = [name, "Dr. Verghese Kurien", "V. Kurien", "Verghese Kurian", "Father of the White Revolution"];
const dimensions = [
 ["formation", "Education and arrival", "Early life, engineering training and arrival in Anand.", ["born", "education", "engineering", "Anand", "1949"]],
 ["sector_context", "Dairy sector context", "Pre-Flood markets, farmers and other development approaches.", ["pre-Operation Flood", "Polson", "middlemen", "market", "history"]],
 ["cooperative_model", "Cooperative model", "Farmer ownership, village societies, district unions and federations.", ["Amul", "Anand", "cooperative", "ownership", "three-tier"]],
 ["people", "Collaborators and leadership", "Tribhuvandas Patel, Dalaya, policy partners and management.", ["Patel", "Dalaya", "Shastri", "leadership", "manager"]],
 ["technology", "Technology and supply chains", "Milk testing, processing, marketing and technical services.", ["powder", "buffalo", "processing", "supply chain", "milk grid"]],
 ["institutions", "Institution building", "NDDB, IRMA and scaling of the Anand approach.", ["NDDB", "IRMA", "institution", "1965", "1979"]],
 ["operation_flood", "Operation Flood", "Programme design, finance, phases and national expansion.", ["Operation Flood", "White Revolution", "phase", "1970", "EEC"]],
 ["farmer_impact", "Farmer and rural impact", "Prices, incomes, village livelihoods and distribution.", ["farmers", "income", "rural", "landless", "women"]],
 ["criticisms", "Evidence and limitations", "Contestation, attribution, political interference and uneven outcomes.", ["criticism", "limitations", "evidence", "government", "poverty"]],
 ["legacy", "Recognition and legacy", "Awards and long-term impact on the dairy sector.", ["World Food Prize", "legacy", "impact", "production"]],
];
const cacheArg = process.argv.find(arg => arg.startsWith("--source-cache="))?.slice("--source-cache=".length);
// Reusable social entrepreneur / institution builder fields; no personality-specific app logic.
const apply = process.argv.includes("--apply");
const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const digest = (s) => crypto.createHash("sha256").update(s).digest("hex");
if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] ||= match[2].replace(/^['"]|['"]$/g, "");
}
const db = apply ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
async function checked(result) { if (result.error) throw result.error; return result.data; }
async function rows(table, columns, filter = (q) => q) { return await checked(await filter(db.from(table).select(columns))); }
async function originalBytes(part) {
  const cached = cacheArg && part.cache && path.join(cacheArg, part.cache);
  if (cached && fs.existsSync(cached)) return fs.readFileSync(cached);
  const response = await fetch(part.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${part.url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
async function sourceText(source) {
  if (source.originalSnapshot) {
    console.log(`${source.key}: using short original-page transcript snapshot checked 2026-10-12`);
    return source.originalSnapshot;
  }
  const parts = source.parts || [source];
  const extracted = [];
  for (const part of parts) {
    const bytes = await originalBytes(part);
    if (source.transcriptions) {
      if (digest(bytes) !== source.pdfSha256) throw new Error(`${source.key}: scanned original changed; recheck transcriptions before writing`);
      extracted.push(source.transcriptions.map(([locator, text]) => `${locator}: ${text}`).join(" "));
    } else if (bytes.subarray(0, 5).toString() === "%PDF-") {
      const parser = new PDFParse({ data: bytes });
      try { extracted.push(`${part.locator || ""} ${(await parser.getText(source.pages ? { partial: source.pages } : undefined)).text}`); }
      finally { await parser.destroy(); }
    } else {
      const $ = cheerio.load(bytes.toString("utf8"));
      $("script,style,nav,footer,header,aside").remove();
      extracted.push($("main").first().text() || $("article").first().text() || $("body").text());
    }
  }
  return extracted.join(" ").replace(/\s+/g, " ").trim();
}
function excerpt(text, anchor) {
  const at = text.toLowerCase().indexOf(anchor.toLowerCase());
  if (at < 0) return null;
  // Keep complete sentences around the anchor: a fragment can lose its subject,
  // attribution or chronology and is poor evidence for conversational retrieval.
  const previous = text.lastIndexOf(". ", at);
  let start = previous >= 0 ? previous + 2 : 0;
  const earlier = text.lastIndexOf(". ", Math.max(0, start - 3));
  if (earlier >= 0 && at - earlier < 500) start = earlier + 2;
  let end = text.indexOf(". ", at + anchor.length);
  if (end < 0) end = text.length;
  else {
    end += 1;
    const following = text.indexOf(". ", end + 1);
    if (following >= 0 && following - start < 1100) end = following + 1;
  }
  if (end - start > 1600) throw new Error(`Context unexpectedly long for ${anchor}; choose an explicit excerpt`);
  return text.slice(start, end).trim();
}
async function identity() {
  let category = (await rows("categories", "id", (q) => q.eq("slug", slug)))[0];
  if (!category) category = await checked(await db.from("categories").insert({ slug, name: "Social Entrepreneurs, Institution Builders and Agricultural Leaders", description: "Evidence-led study of rural enterprise, farmer ownership, institutions, technology and development impact." }).select("id").single());
  for (const [index, [code, label, description, routing_hints]] of dimensions.entries()) {
    let parameter = (await rows("parameters", "id", q => q.eq("category_id", category.id).eq("code", code)))[0];
    if (!parameter) parameter = await checked(await db.from("parameters").insert({ category_id: category.id, code, name: label, description, routing_hints, sort_order: index + 1 }).select("id").single());
    if (!(await rows("parameter_fields", "id", q => q.eq("parameter_id", parameter.id).eq("code", code))).length) await checked(await db.from("parameter_fields").insert({ parameter_id: parameter.id, code, label, description, sort_order: 1 }));
  }
  // Shared framework vocabulary bridges modern questions and historical wording.
  for (const [alias, canonical_term] of [["white revolution", "Operation Flood"], ["Amul model", "Anand pattern"]]) {
    if (!(await rows("research_term_aliases", "id", q => q.eq("category_id", category.id).eq("alias", alias))).length)
      await checked(await db.from("research_term_aliases").insert({ category_id: category.id, alias, canonical_term, confidence: 0.95, notes: "Shared social entrepreneur/institution builder vocabulary; no person-specific routing." }));
  }
  let person = (await rows("personalities", "id", (q) => q.eq("canonical_name", name)))[0];
  if (!person) person = await checked(await db.from("personalities").insert({ canonical_name: name, alternate_names: aliases.slice(1) }).select("id").single());
  await checked(await db.from("personality_categories").upsert({ personality_id: person.id, category_id: category.id, is_primary: true }, { onConflict: "personality_id,category_id" }));
  for (const alias of aliases) if (!(await rows("personality_aliases", "id", (q) => q.eq("personality_id", person.id).ilike("alias", alias))).length)
    await checked(await db.from("personality_aliases").insert({ personality_id: person.id, alias, alias_type: alias === name ? "canonical" : "alternate_name", confidence: 0.99 }));
  return person;
}
async function main() {
  const passages = new Map();
  for (const source of sources) {
    const text = await sourceText(source);
    const selected = claims.filter((claim) => claim[0] === source.key);
    const missing = selected.filter((claim) => !excerpt(text, claim[1]));
    console.log(`${source.key}: ${selected.length - missing.length}/${selected.length} anchors verified in ${text.length} characters`);
    for (const claim of selected) {
      const transcription = source.transcriptions?.find(([, passage]) => passage.toLowerCase().includes(claim[1].toLowerCase()));
      let passage = transcription ? transcription[1] : excerpt(text, claim[1]);
      const bounds = source.contextualPassages?.[claim[1]] || source.passageBounds;
      if (bounds) {
        const [first, last] = bounds;
        const start = text.indexOf(first), end = text.indexOf(last, start);
        if (start < 0 || end < start) throw new Error(`${source.key}: missing contextual paragraph boundaries`);
        passage = text.slice(start, end + last.length);
        if (!passage.toLowerCase().includes(claim[1].toLowerCase())) throw new Error(`${source.key}: paragraph does not support anchor`);
      }
      passages.set(claim, passage);
    }
    if (missing.length) console.log(`  Missing: ${missing.map((claim) => claim[1]).join(" | ")}`);
  }
  if ([...passages.values()].some((value) => !value)) throw new Error("Missing source anchors; no corpus writes made.");
  if (!apply) return console.log(JSON.stringify({ mode: "dry-run", sources: sources.length, claims: claims.length }));
  const person = await identity();
  const fields = await rows("parameter_fields", "id,code,parameters!inner(categories!inner(slug))", (q) => q.eq("parameters.categories.slug", slug));
  const fieldIds = new Map(fields.map((field) => [field.code, field.id]));
  const existingSources = await rows("sources", "id,url", (q) => q.in("url", sources.map((source) => source.url)));
  const sourceIds = new Map(existingSources.map((source) => [source.url, source.id]));
  const existingClaims = await rows("claims", "id,claim_text", (q) => q.eq("personality_id", person.id));
  const claimIds = new Map(existingClaims.map((claim) => [norm(claim.claim_text), claim.id]));
  const counts = { sourcesAdded: 0, claimsAdded: 0, chunksAdded: 0 };
  for (const claim of claims) if (!fieldIds.has(claim[2])) throw new Error(`Missing shared field: ${claim[2]}`);
  const activeChunks = new Map();
  for (const source of sources) {
    let sourceId = sourceIds.get(source.url);
    if (!sourceId) {
      const created = await checked(await db.from("sources").insert({ title: source.title, author: source.author || null, publisher_or_institution: source.publisher,
        source_type: source.type, publication_year: source.year || null, url: source.url,
        citation: `${source.author ? `${source.author}. ` : ""}${source.title}. ${source.publisher}. ${source.url}`,
        source_status: "approved", approval_origin: "ai_candidate", approval_note: "Publisher and cited passages checked; historical interpretations and claims remain subject to review.",
        ingestion_status: "ready", textual_layer: source.layer, rights_or_access_note: source.originalSnapshot ? "Short original-page transcript excerpts checked on 2026-10-12; direct fetch intermittent." : "Public original; short research excerpts.",
        metadata: { verghese_kurien_corpus: true, verified_at: "2026-10-12", source_parts: source.parts?.map(part => part.url) || null, snapshot: Boolean(source.originalSnapshot) } }).select("id").single());
      sourceId = created.id; counts.sourcesAdded++;
    }
    sourceIds.set(source.url, sourceId);
    activeChunks.set(sourceId, new Set());
    await checked(await db.from("source_personalities").upsert({ source_id: sourceId, personality_id: person.id, relationship: "subject", confidence: 1, mapping_method: "manual" }, { onConflict: "source_id,personality_id" }));
    for (const [index, claim] of claims.filter((item) => item[0] === source.key).entries()) {
      const [, anchor, field, type, statement, locator] = claim;
      const passage = passages.get(claim), hash = digest(passage), fieldId = fieldIds.get(field);
      if (!fieldId) throw new Error(`Missing field: ${field}`);
      let chunk = (await rows("source_chunks", "id", (q) => q.eq("source_id", sourceId).eq("content_hash", hash).limit(1)))[0];
      if (!chunk) {
        const prior = (await rows("source_chunks", "id,metadata", (q) => q.eq("source_id", sourceId).eq("chunk_index", index).limit(1)))[0];
        const values = { chunk_text: passage, content_hash: hash, token_estimate: Math.ceil(passage.length / 4), section_title: `${name}: ${source.title}`,
          page_or_section: locator || anchor, textual_layer: source.layer, metadata: { verghese_kurien_corpus: true, anchor } };
        if (prior?.metadata?.verghese_kurien_corpus) chunk = await checked(await db.from("source_chunks").update({ ...values, embedding_status: "not_requested", embedding: null, embedding_model: null, embedding_dimensions: null }).eq("id", prior.id).select("id").single());
        else { const last = (await rows("source_chunks", "chunk_index", q => q.eq("source_id", sourceId).order("chunk_index", { ascending: false }).limit(1)))[0]; chunk = await checked(await db.from("source_chunks").insert({ source_id: sourceId, chunk_index: last ? last.chunk_index + 1 : 0, ...values }).select("id").single()); counts.chunksAdded++; }
      }
      activeChunks.get(sourceId).add(chunk.id);
      await checked(await db.from("source_chunks").update({ is_active: true, section_title: `${name}: ${source.title}` }).eq("id", chunk.id));
      await checked(await db.from("chunk_personalities").upsert({ chunk_id: chunk.id, personality_id: person.id, relationship: "subject", relevance_score: 1, tagging_method: "manual", confidence: 1 }, { onConflict: "chunk_id,personality_id" }));
      const crossFields = source.crossFields || [];
      for (const linkedField of new Set([field, ...crossFields])) {
        const linkedId = fieldIds.get(linkedField);
        if (!linkedId) throw new Error(`Missing shared field: ${linkedField}`);
        await checked(await db.from("chunk_parameter_fields").upsert({ chunk_id: chunk.id, parameter_field_id: linkedId, confidence: 0.95, tagging_method: "manual" }, { onConflict: "chunk_id,parameter_field_id" }));
      }
      let claimId = claimIds.get(norm(statement));
      if (!claimId) {
        const created = await checked(await db.from("claims").insert({ personality_id: person.id, parameter_field_id: fieldId, claim_text: statement,
          claim_kind: type === "HISTORICAL_FACT" ? "established_fact" : "scholarly_interpretation", certainty: type === "HISTORICAL_FACT" ? "high" : "medium",
          review_status: "draft", approval_origin: "ai_candidate", evidence_type: type === "HISTORICAL_FACT" ? "uncertain" : "scholarly_interpretation",
          researcher_notes: `Verghese Kurien curated corpus; ${source.key}; ${type}. Anchor verified. Human review required.` }).select("id").single());
        claimId = created.id; claimIds.set(norm(statement), claimId); counts.claimsAdded++;
      }
      const link = (await rows("claim_sources", "id", (q) => q.eq("claim_id", claimId).eq("source_id", sourceId).limit(1)))[0];
      if (!link) await checked(await db.from("claim_sources").insert({ claim_id: claimId, source_id: sourceId, relationship: "supports", evidence_excerpt: passage, page_or_section: locator || anchor, notes: `Exact source anchor: ${anchor}; claim requires review.` }));
      else await checked(await db.from("claim_sources").update({ evidence_excerpt: passage, page_or_section: locator || anchor }).eq("id", link.id));
      await checked(await db.from("claim_chunks").upsert({ claim_id: claimId, chunk_id: chunk.id, relationship: "supports" }, { onConflict: "claim_id,chunk_id" }));
      await checked(await db.from("claim_epistemics").upsert({ claim_id: claimId, personality_id: person.id, epistemic_type: null,
        proposed_type: type, type_origin: "deterministic", type_confidence: 0.9, type_review_status: "needs_type_review", classifier_version: "verghese-kurien-source-curation/1",
        contract_status: "NEEDS_TYPE_REVIEW", contract_satisfied: false, contract_version: "evidence-contracts/1",
        contract_detail: { reason: "Historical evidence and interpretation require human review", source: source.url, anchor }
      }, { onConflict: "claim_id" }));
    }
  }
  // Comparative claims link both sides of the disagreement in Resources.
  for (const claim of claims) for (const [key, anchor] of claim[6] || []) {
    const counterpart = claims.find(row => row[0] === key && row[1] === anchor);
    const source = sources.find(row => row.key === key);
    if (!counterpart || !source) throw new Error(`Missing comparative evidence: ${key} ${anchor}`);
    const claimId = claimIds.get(norm(claim[4])), sourceId = sourceIds.get(source.url);
    const existing = (await rows("claim_sources", "id", q => q.eq("claim_id", claimId).eq("source_id", sourceId).limit(1)))[0];
    if (!existing) await checked(await db.from("claim_sources").insert({ claim_id: claimId, source_id: sourceId, relationship: "supports", evidence_excerpt: passages.get(counterpart), page_or_section: counterpart[5] || anchor, notes: "Evidence for the explicitly attributed competing account; does not settle the disagreement." }));
  }
  // Retain superseded excerpts for claim provenance but keep them out of Ask.
  for (const [sourceId, kept] of activeChunks) {
    const memberships = await rows("source_personalities", "personality_id", q => q.eq("source_id", sourceId));
    if (memberships.some(link => link.personality_id !== person.id)) continue;
    const old = await rows("source_chunks", "id,metadata", q => q.eq("source_id", sourceId).eq("is_active", true));
    const superseded = old.filter(chunk => chunk.metadata?.verghese_kurien_corpus && !kept.has(chunk.id)).map(chunk => chunk.id);
    if (superseded.length) await checked(await db.from("source_chunks").update({ is_active: false }).in("id", superseded));
  }
  console.log(JSON.stringify({ mode: "apply", personalityId: person.id, sources: sources.length, claims: claims.length, ...counts }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
