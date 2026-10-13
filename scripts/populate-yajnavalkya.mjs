import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { sources, claims } from "../data/yajnavalkya-corpus.mjs";

const name = "Yajnavalkya";
const slug = "rishi";
const aliases = [name, "Yājñavalkya", "Yagnavalkya", "Yajnawalkya", "Yajnavalkya Vajasaneya", "Vajasaneya Yajnavalkya"];
// Proposed epistemic type -> legacy claim labels. Text, tradition, scholarship and contested points stay distinct.
const KINDS = {
  TEXTUAL_ASSERTION: ["textual_tradition", "high", "direct_primary_text"],
  TRADITIONAL_NARRATIVE: ["traditional_account", "medium", "traditional_narrative"],
  HISTORICAL_INFERENCE: ["scholarly_interpretation", "medium", "historical_inference"],
  CONTESTED: ["uncertain", "medium", "contested"],
};
const SCHOLARLY = ["scholarly_interpretation", "medium", "scholarly_interpretation"];
const cacheArg = process.argv.find(arg => arg.startsWith("--source-cache="))?.slice("--source-cache=".length);
// Uses the existing Rishis and Sages framework; no personality-specific app logic.
const show = process.argv.includes("--print");
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
  let response;
  // Archive hosts rate-limit bursts; wait and retry rather than fail the whole check.
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await fetch(part.url, { signal: AbortSignal.timeout(60000), headers: { "user-agent": "Mozilla/5.0 (DCF research corpus check)" } });
    if (response.status !== 429) break;
    await new Promise(resolve => setTimeout(resolve, 20000 * (attempt + 1)));
  }
  if (!response.ok) throw new Error(`${part.url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
async function sourceText(source) {
  const parts = source.parts || [source];
  const extracted = [];
  for (const part of parts) {
    const bytes = await originalBytes(part);
    if (bytes.subarray(0, 5).toString() === "%PDF-") {
      const parser = new PDFParse({ data: bytes });
      try { extracted.push(`${part.locator || ""} ${(await parser.getText(source.pages ? { partial: source.pages } : undefined)).text}`); }
      finally { await parser.destroy(); }
    } else if (part.url.endsWith(".txt")) {
      extracted.push(bytes.toString("utf8"));
    } else {
      const $ = cheerio.load(bytes.toString("utf8"));
      $("script,style,nav,footer,header,aside").remove();
      extracted.push($("main").first().text() || $("article").first().text() || $("body").text());
    }
  }
  // Page furniture (running heads, page counters) is removed before passages are cut.
  const joined = source.strip ? extracted.join(" ").replace(new RegExp(source.strip, "g"), " ") : extracted.join(" ");
  return joined.replace(/\s+/g, " ").trim();
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
  const category = (await rows("categories", "id", (q) => q.eq("slug", slug)))[0];
  if (!category) throw new Error(`Missing shared category: ${slug}`);
  // Spelling variants only; shared framework vocabulary, no person-specific routing.
  for (const alias of ["yagnavalkya", "yajnawalkya", "yajnyavalkya", "yajnavalkya"]) {
    if (!(await rows("research_term_aliases", "id", q => q.eq("category_id", category.id).eq("alias", alias))).length)
      await checked(await db.from("research_term_aliases").insert({ category_id: category.id, alias, canonical_term: "yajnavalkya", confidence: 0.95, notes: "Transliteration variant; shared Rishi vocabulary." }));
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
    const missing = selected.filter((claim) => !text.toLowerCase().includes(claim[1].toLowerCase()));
    console.log(`${source.key}: ${selected.length - missing.length}/${selected.length} anchors verified in ${text.length} characters`);
    for (const claim of selected) {
      const bounds = source.bounds?.[claim[1]];
      let passage = bounds ? null : excerpt(text, claim[1]);
      if (bounds && !missing.includes(claim)) {
        // The nearest opening words before the anchor and closing words after it.
        const at = text.toLowerCase().indexOf(claim[1].toLowerCase());
        const start = text.lastIndexOf(bounds[0], at), close = text.indexOf(bounds[1], at);
        if (start < 0 || close < 0) throw new Error(`${source.key}: missing passage boundaries for ${claim[1]}`);
        passage = text.slice(start, close + bounds[1].length);
        if (passage.length > 1800) throw new Error(`${source.key}: passage too long for ${claim[1]}`);
      }
      if (show && passage) console.log(`\n[${source.key}] ${claim[5]} :: ${claim[4]}\n  > ${passage}`);
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
        source_status: "approved", approval_origin: "ai_candidate", approval_note: "Edition, publisher and cited passages checked; textual layer recorded; claims remain subject to review.",
        ingestion_status: "ready", textual_layer: source.layer, rights_or_access_note: source.note || "Public original; short research excerpts.",
        metadata: { yajnavalkya_corpus: true, verified_at: "2026-10-12", source_parts: source.parts?.map(part => part.url) || null } }).select("id").single());
      sourceId = created.id; counts.sourcesAdded++;
    }
    sourceIds.set(source.url, sourceId);
    activeChunks.set(sourceId, new Set());
    await checked(await db.from("source_personalities").upsert({ source_id: sourceId, personality_id: person.id, relationship: "subject", confidence: 1, mapping_method: "manual" }, { onConflict: "source_id,personality_id" }));
    for (const [index, claim] of claims.filter((item) => item[0] === source.key).entries()) {
      const [, anchor, field, type, statement, locator] = claim;
      const passage = passages.get(claim), hash = digest(passage), fieldId = fieldIds.get(field);
      // Passage search is diacritic-sensitive and editions transliterate differently (Gārgī, Ganaka, Yájnawalkya).
      // The reviewed summary is the passage heading, so plain spellings in a question still find the passage.
      const heading = `${name}: ${statement}`;
      if (!fieldId) throw new Error(`Missing field: ${field}`);
      let chunk = (await rows("source_chunks", "id", (q) => q.eq("source_id", sourceId).eq("content_hash", hash).limit(1)))[0];
      if (!chunk) {
        const prior = (await rows("source_chunks", "id,metadata", (q) => q.eq("source_id", sourceId).eq("chunk_index", index).limit(1)))[0];
        const values = { chunk_text: passage, content_hash: hash, token_estimate: Math.ceil(passage.length / 4), section_title: heading,
          page_or_section: locator || anchor, textual_layer: source.layer, metadata: { yajnavalkya_corpus: true, anchor } };
        if (prior?.metadata?.yajnavalkya_corpus) chunk = await checked(await db.from("source_chunks").update({ ...values, embedding_status: "not_requested", embedding: null, embedding_model: null, embedding_dimensions: null }).eq("id", prior.id).select("id").single());
        else { const last = (await rows("source_chunks", "chunk_index", q => q.eq("source_id", sourceId).order("chunk_index", { ascending: false }).limit(1)))[0]; chunk = await checked(await db.from("source_chunks").insert({ source_id: sourceId, chunk_index: last ? last.chunk_index + 1 : 0, ...values }).select("id").single()); counts.chunksAdded++; }
      }
      activeChunks.get(sourceId).add(chunk.id);
      await checked(await db.from("source_chunks").update({ is_active: true, section_title: heading }).eq("id", chunk.id));
      await checked(await db.from("chunk_personalities").upsert({ chunk_id: chunk.id, personality_id: person.id, relationship: "subject", relevance_score: 1, tagging_method: "manual", confidence: 1 }, { onConflict: "chunk_id,personality_id" }));
      const crossFields = source.crossFields || [];
      for (const linkedField of new Set([field, ...crossFields])) {
        const linkedId = fieldIds.get(linkedField);
        if (!linkedId) throw new Error(`Missing shared field: ${linkedField}`);
        await checked(await db.from("chunk_parameter_fields").upsert({ chunk_id: chunk.id, parameter_field_id: linkedId, confidence: 0.95, tagging_method: "manual" }, { onConflict: "chunk_id,parameter_field_id" }));
      }
      let claimId = claimIds.get(norm(statement));
      if (!claimId) {
        const [kind, certainty, evidenceType] = KINDS[type] || SCHOLARLY;
        const created = await checked(await db.from("claims").insert({ personality_id: person.id, parameter_field_id: fieldId, claim_text: statement,
          claim_kind: kind, certainty, review_status: "draft", approval_origin: "ai_candidate", evidence_type: evidenceType,
          researcher_notes: `Yajnavalkya curated corpus; ${source.layer}; ${source.key}; ${type}. Anchor verified. Human review required.` }).select("id").single());
        claimId = created.id; claimIds.set(norm(statement), claimId); counts.claimsAdded++;
      }
      const link = (await rows("claim_sources", "id", (q) => q.eq("claim_id", claimId).eq("source_id", sourceId).limit(1)))[0];
      if (!link) await checked(await db.from("claim_sources").insert({ claim_id: claimId, source_id: sourceId, relationship: "supports", evidence_excerpt: passage, page_or_section: locator || anchor, notes: `Exact source anchor: ${anchor}; claim requires review.` }));
      else await checked(await db.from("claim_sources").update({ evidence_excerpt: passage, page_or_section: locator || anchor }).eq("id", link.id));
      await checked(await db.from("claim_chunks").upsert({ claim_id: claimId, chunk_id: chunk.id, relationship: "supports" }, { onConflict: "claim_id,chunk_id" }));
      await checked(await db.from("claim_epistemics").upsert({ claim_id: claimId, personality_id: person.id, epistemic_type: null,
        proposed_type: type, type_origin: "deterministic", type_confidence: 0.9, type_review_status: "needs_type_review", classifier_version: "yajnavalkya-source-curation/1",
        contract_status: "NEEDS_TYPE_REVIEW", contract_satisfied: false, contract_version: "evidence-contracts/1",
        contract_detail: { reason: "Textual, traditional and scholarly claims require human review", source: source.url, layer: source.layer, anchor }
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
    const superseded = old.filter(chunk => chunk.metadata?.yajnavalkya_corpus && !kept.has(chunk.id)).map(chunk => chunk.id);
    if (superseded.length) await checked(await db.from("source_chunks").update({ is_active: false }).in("id", superseded));
  }
  console.log(JSON.stringify({ mode: "apply", personalityId: person.id, sources: sources.length, claims: claims.length, ...counts }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
