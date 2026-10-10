import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { sources, claims } from "../data/shivaji-corpus.mjs";

const name = "Chhatrapati Shivaji Maharaj";
const slug = "political_leader";
const aliases = [name, "Shivaji", "Shivaji Maharaj", "Shivaji Bhonsle", "Shivaji Bhosale", "Sivaji"];
const dimensions = [
  ["formation", "Background and rise", "Family, formation, alliances, and the path to power.", ["background", "rise", "family", "early", "origin"]],
  ["state_building", "State-building and sovereignty", "Territory, legitimacy, institutions, and political independence.", ["state", "kingdom", "sovereignty", "independence", "coronation"]],
  ["governance", "Governance and revenue", "Offices, administration, justice, and fiscal practice.", ["governance", "administration", "revenue", "tax", "minister"]],
  ["warfare", "Military strategy", "Campaigns, armed organization, and strategic choices.", ["war", "military", "strategy", "campaign", "battle"]],
  ["forts_sea", "Fortifications and maritime policy", "Forts, coastal defenses, fleets, and maritime power.", ["fort", "coast", "navy", "naval", "sea"]],
  ["diplomacy", "Political relationships and conflict", "Rivals, allies, negotiation, and changing alignments.", ["mughal", "bijapur", "treaty", "relationship", "conflict"]],
  ["religion", "Religion and state policy", "Religious patronage, political language, and treatment of communities.", ["religion", "hindu", "muslim", "temple", "policy"]],
  ["leadership", "Leadership and conduct", "Source-supported decisions, organizational skill, and limitations.", ["leadership", "decision", "quality", "command"]],
  ["context", "Historical setting", "Regional and wider forces shaping political action.", ["history", "deccan", "century", "context"]],
  ["interpretation", "Sources and contested interpretations", "Chronicles, later traditions, scholarly disagreements, and political memory.", ["source", "chronicle", "tradition", "debate", "interpretation"]],
  ["legacy", "Long-term significance", "Consequences and later historical reception.", ["legacy", "impact", "significance", "later"]],
];
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
async function sourceText(source) {
  // Oxford exposes the book abstract to public indexing but returns 403 to this runtime.
  // This snapshot was checked against the publisher page on 2026-10-10; no chapter text is represented.
  if (source.abstractSnapshot) return source.abstractSnapshot;
  // Legacy Gazetteers currently have an expired TLS certificate. curl's exception is limited to these public pages.
  let html;
  if (source.legacyTls) html = execFileSync("curl", ["-kLsS", "--max-time", "30", source.url], { encoding: "utf8", maxBuffer: 5_000_000 });
  else {
    const response = await fetch(source.url, { headers: { "User-Agent": "Mozilla/5.0 (DCF source verification)" }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${source.key}: HTTP ${response.status}`);
    html = await response.text();
  }
  const $ = cheerio.load(html);
  $("script,style,nav,footer,header,aside").remove();
  return ($("main").first().text() || $("article").first().text() || $("body").text()).replace(/\s+/g, " ").trim();
}
function excerpt(text, anchor) {
  const at = text.toLowerCase().indexOf(anchor.toLowerCase());
  if (at < 0) return null;
  const floor = Math.max(0, at - 260);
  const sentenceStart = text.lastIndexOf(". ", at);
  const start = sentenceStart >= floor ? sentenceStart + 2 : Math.max(0, text.indexOf(" ", floor) + 1);
  const nextSentence = text.indexOf(". ", at + anchor.length);
  const end = nextSentence >= 0 && nextSentence - at < 350
    ? nextSentence + 1
    : Math.min(text.length, text.lastIndexOf(" ", at + anchor.length + 225));
  return text.slice(start, Math.max(end, at + anchor.length)).trim();
}
async function identity() {
  let category = (await rows("categories", "id", (q) => q.eq("slug", slug)))[0];
  if (!category) category = await checked(await db.from("categories").insert({ slug, name: "Monarchs and Political Leaders", description: "Evidence-led study of political leadership, state formation, conflict, governance, and reception." }).select("id").single());
  for (const [index, [code, label, description, routing_hints]] of dimensions.entries()) {
    let parameter = (await rows("parameters", "id", (q) => q.eq("category_id", category.id).eq("code", code)))[0];
    if (!parameter) parameter = await checked(await db.from("parameters").insert({ category_id: category.id, code, name: label, description, sort_order: index + 1, routing_hints }).select("id").single());
    if (!(await rows("parameter_fields", "id", (q) => q.eq("parameter_id", parameter.id).eq("code", code))).length)
      await checked(await db.from("parameter_fields").insert({ parameter_id: parameter.id, code, label, description, sort_order: 1 }));
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
    for (const claim of selected) passages.set(claim, excerpt(text, claim[1]));
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
  for (const source of sources) {
    let sourceId = sourceIds.get(source.url);
    if (!sourceId) {
      const created = await checked(await db.from("sources").insert({ title: source.title, author: source.author || null, publisher_or_institution: source.publisher,
        source_type: source.type, publication_year: source.year || null, url: source.url,
        citation: `${source.author ? `${source.author}. ` : ""}${source.title}. ${source.publisher}. ${source.url}`,
        source_status: "approved", approval_origin: "ai_candidate", approval_note: "Publisher and cited passages checked; historical interpretations and claims remain subject to review.",
        ingestion_status: "ready", textual_layer: source.layer, rights_or_access_note: "Public page; short research excerpts only.",
        metadata: { shivaji_corpus: true, verified_at: new Date().toISOString() } }).select("id").single());
      sourceId = created.id; counts.sourcesAdded++;
    }
    await checked(await db.from("source_personalities").upsert({ source_id: sourceId, personality_id: person.id, relationship: "subject", confidence: 1, mapping_method: "manual" }, { onConflict: "source_id,personality_id" }));
    for (const [index, claim] of claims.filter((item) => item[0] === source.key).entries()) {
      const [, anchor, field, type, statement] = claim;
      const passage = passages.get(claim), hash = digest(passage), fieldId = fieldIds.get(field);
      if (!fieldId) throw new Error(`Missing field: ${field}`);
      let chunk = (await rows("source_chunks", "id", (q) => q.eq("source_id", sourceId).eq("content_hash", hash).limit(1)))[0];
      if (!chunk) {
        const prior = (await rows("source_chunks", "id", (q) => q.eq("source_id", sourceId).eq("chunk_index", index).limit(1)))[0];
        const values = { chunk_text: passage, content_hash: hash, token_estimate: Math.ceil(passage.length / 4), section_title: source.title,
          page_or_section: anchor, textual_layer: source.layer, metadata: { shivaji_corpus: true, anchor } };
        if (prior) chunk = await checked(await db.from("source_chunks").update({ ...values, embedding_status: "not_requested", embedding: null, embedding_model: null, embedding_dimensions: null }).eq("id", prior.id).select("id").single());
        else { chunk = await checked(await db.from("source_chunks").insert({ source_id: sourceId, chunk_index: index, ...values }).select("id").single()); counts.chunksAdded++; }
      }
      await checked(await db.from("chunk_personalities").upsert({ chunk_id: chunk.id, personality_id: person.id, relationship: "subject", relevance_score: 1, tagging_method: "manual", confidence: 1 }, { onConflict: "chunk_id,personality_id" }));
      await checked(await db.from("chunk_parameter_fields").upsert({ chunk_id: chunk.id, parameter_field_id: fieldId, confidence: 0.95, tagging_method: "manual" }, { onConflict: "chunk_id,parameter_field_id" }));
      let claimId = claimIds.get(norm(statement));
      if (!claimId) {
        const created = await checked(await db.from("claims").insert({ personality_id: person.id, parameter_field_id: fieldId, claim_text: statement,
          claim_kind: type === "HISTORICAL_FACT" ? "established_fact" : "scholarly_interpretation", certainty: type === "HISTORICAL_FACT" ? "high" : "medium",
          review_status: "draft", approval_origin: "ai_candidate", evidence_type: type === "HISTORICAL_FACT" ? "uncertain" : "scholarly_interpretation",
          researcher_notes: `Shivaji curated corpus; ${source.key}; ${type}. Anchor verified. Human review required.` }).select("id").single());
        claimId = created.id; claimIds.set(norm(statement), claimId); counts.claimsAdded++;
      }
      const link = (await rows("claim_sources", "id", (q) => q.eq("claim_id", claimId).eq("source_id", sourceId).limit(1)))[0];
      if (!link) await checked(await db.from("claim_sources").insert({ claim_id: claimId, source_id: sourceId, relationship: "supports", evidence_excerpt: passage, page_or_section: anchor, notes: `Exact source anchor: ${anchor}; claim requires review.` }));
      else await checked(await db.from("claim_sources").update({ evidence_excerpt: passage, page_or_section: anchor }).eq("id", link.id));
      await checked(await db.from("claim_chunks").upsert({ claim_id: claimId, chunk_id: chunk.id, relationship: "supports" }, { onConflict: "claim_id,chunk_id" }));
      await checked(await db.from("claim_epistemics").upsert({ claim_id: claimId, personality_id: person.id, epistemic_type: null,
        proposed_type: type, type_origin: "deterministic", type_confidence: 0.9, type_review_status: "needs_type_review", classifier_version: "shivaji-source-curation/1",
        contract_status: "NEEDS_TYPE_REVIEW", contract_satisfied: false, contract_version: "evidence-contracts/1",
        contract_detail: { reason: "Historical evidence and interpretation require human review", source: source.url, anchor }
      }, { onConflict: "claim_id" }));
    }
  }
  console.log(JSON.stringify({ mode: "apply", personalityId: person.id, sources: sources.length, claims: claims.length, ...counts }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
