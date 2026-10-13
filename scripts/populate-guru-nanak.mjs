import fs from "node:fs";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import { createClient } from "@supabase/supabase-js";
import { sources, claims } from "../data/guru-nanak-corpus.mjs";

const name = "Guru Nanak", categorySlug = "spiritual_teacher";
const aliases = [name, "Guru Nanak Dev", "Guru Nanak Dev Ji", "Nanak", "Baba Nanak"];
const apply = process.argv.includes("--apply");
const norm = (text) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const claimShape = {
  TEXTUAL_ASSERTION: ["textual_tradition", "high", "direct_primary_text"],
  HISTORICAL_FACT: ["established_fact", "high", "historical_inference"],
  HISTORICAL_INFERENCE: ["scholarly_interpretation", "medium", "historical_inference"],
  SCHOLARLY_INTERPRETATION: ["scholarly_interpretation", "medium", "scholarly_interpretation"],
  INSTITUTIONAL_ACCOUNT: ["traditional_account", "medium", "traditional_narrative"],
  TRADITIONAL_NARRATIVE: ["traditional_account", "medium", "traditional_narrative"],
};
if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match) process.env[match[1]] ||= match[2].replace(/^['"]|['"]$/g, "");
}
const db = apply ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
async function checked(result) { if (result.error) throw result.error; return result.data; }
async function rows(table, columns, filter = (q) => q) { return checked(await filter(db.from(table).select(columns))); }
async function sourceText(source) {
  const response = await fetch(source.url, { headers: { "user-agent": "Mozilla/5.0 (DCF corpus source verification)" }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${source.key}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.subarray(0, 5).toString() === "%PDF-") { const parser = new PDFParse({ data }); try { return (await parser.getText()).text.replace(/\s+/g, " ").trim(); } finally { await parser.destroy(); } }
  const $ = cheerio.load(data.toString("utf8")); $("script,style,nav,footer,header,aside").remove();
  return ($("main").first().text() || $("article").first().text() || $("body").text()).replace(/\s+/g, " ").trim();
}
function cut(text, anchor) {
  const at = norm(text).indexOf(norm(anchor)); if (at < 0) return null;
  // Use the original text index so the stored evidence remains readable.
  const rawAt = text.toLowerCase().indexOf(anchor.toLowerCase());
  const start = Math.max(0, text.lastIndexOf(". ", rawAt - 1) + 2 || rawAt - 300);
  const next = text.indexOf(". ", rawAt + anchor.length + 120);
  return text.slice(start, next > rawAt && next - start < 1400 ? next + 1 : Math.min(text.length, rawAt + anchor.length + 450)).trim();
}
async function identity() {
  const category = (await rows("categories", "id", q => q.eq("slug", categorySlug)))[0]; if (!category) throw new Error("Missing shared spiritual_teacher category");
  let person = (await rows("personalities", "id", q => q.eq("canonical_name", name)))[0];
  if (!person) person = await checked(await db.from("personalities").insert({ canonical_name: name, alternate_names: aliases.slice(1) }).select("id").single());
  await checked(await db.from("personality_categories").upsert({ personality_id: person.id, category_id: category.id, is_primary: true }, { onConflict: "personality_id,category_id" }));
  for (const alias of aliases) if (!(await rows("personality_aliases", "id", q => q.eq("personality_id", person.id).ilike("alias", alias))).length)
    await checked(await db.from("personality_aliases").insert({ personality_id: person.id, alias, alias_type: alias === name ? "canonical" : "alternate_name", confidence: alias === "Nanak" ? 0.98 : 1 }));
  return person;
}
async function main() {
  const passages = new Map();
  for (const source of sources) {
    const text = await sourceText(source), selected = claims.filter(c => c[0] === source.key);
    const missing = selected.filter(c => !cut(text, c[1]));
    console.log(`${source.key}: ${selected.length - missing.length}/${selected.length} anchors verified in ${text.length} characters`);
    if (missing.length) throw new Error(`${source.key}: missing ${missing.map(c => c[1]).join(" | ")}`);
    for (const claim of selected) passages.set(claim, cut(text, claim[1]));
  }
  if (!apply) return console.log(JSON.stringify({ mode: "dry-run", sources: sources.length, claims: claims.length }, null, 2));
  const person = await identity();
  const fields = await rows("parameter_fields", "id,code,parameters!inner(categories!inner(slug))", q => q.eq("parameters.categories.slug", categorySlug));
  const fieldIds = new Map(fields.map(f => [f.code, f.id]));
  const sourceIds = new Map((await rows("sources", "id,url", q => q.in("url", sources.map(s => s.url)))).map(s => [s.url, s.id]));
  const claimIds = new Map((await rows("claims", "id,claim_text", q => q.eq("personality_id", person.id))).map(c => [norm(c.claim_text), c.id]));
  const counts = { sourcesAdded: 0, claimsAdded: 0, chunksAdded: 0 };
  for (const source of sources) {
    let sourceId = sourceIds.get(source.url);
    if (!sourceId) { const inserted = await checked(await db.from("sources").insert({ title: source.title, author: source.author || null, publisher_or_institution: source.publisher, source_type: source.type, url: source.url, citation: `${source.author ? `${source.author}. ` : ""}${source.title}. ${source.publisher}. ${source.url}`, source_status: "approved", approval_origin: "ai_candidate", approval_note: "Original source and anchors checked; source layer recorded. Claims remain review-required.", ingestion_status: "ready", textual_layer: source.layer, rights_or_access_note: "Publicly accessible source; short research excerpts only.", metadata: { guru_nanak_corpus: true, verified_at: new Date().toISOString() } }).select("id").single()); sourceId = inserted.id; sourceIds.set(source.url, sourceId); counts.sourcesAdded++; }
    await checked(await db.from("source_personalities").upsert({ source_id: sourceId, personality_id: person.id, relationship: "subject", confidence: 1, mapping_method: "manual" }, { onConflict: "source_id,personality_id" }));
    for (const [index, claim] of claims.filter(c => c[0] === source.key).entries()) {
      const [, anchor, field, type, statement] = claim, excerpt = passages.get(claim), digest = hash(excerpt), fieldId = fieldIds.get(field);
      if (!fieldId) throw new Error(`Missing shared field ${field}`);
      let chunk = (await rows("source_chunks", "id", q => q.eq("source_id", sourceId).eq("content_hash", digest).limit(1)))[0];
      const values = { chunk_text: excerpt, content_hash: digest, token_estimate: Math.ceil(excerpt.length / 4), section_title: `${name}: ${statement}`, page_or_section: anchor, textual_layer: source.layer, metadata: { guru_nanak_corpus: true, anchor }, embedding_status: "not_requested", embedding: null, embedding_model: null, embedding_dimensions: null };
      if (!chunk) { const old = (await rows("source_chunks", "id,metadata", q => q.eq("source_id", sourceId).eq("chunk_index", index).limit(1)))[0]; if (old?.metadata?.guru_nanak_corpus) chunk = await checked(await db.from("source_chunks").update(values).eq("id", old.id).select("id").single()); else { chunk = await checked(await db.from("source_chunks").insert({ source_id: sourceId, chunk_index: index, ...values }).select("id").single()); counts.chunksAdded++; } }
      await checked(await db.from("source_chunks").update({ is_active: true, section_title: values.section_title }).eq("id", chunk.id));
      await checked(await db.from("chunk_personalities").upsert({ chunk_id: chunk.id, personality_id: person.id, relationship: "subject", relevance_score: 1, tagging_method: "manual", confidence: 1 }, { onConflict: "chunk_id,personality_id" }));
      await checked(await db.from("chunk_parameter_fields").upsert({ chunk_id: chunk.id, parameter_field_id: fieldId, confidence: 0.95, tagging_method: "manual" }, { onConflict: "chunk_id,parameter_field_id" }));
      let claimId = claimIds.get(norm(statement));
      if (!claimId) { const [claim_kind, certainty, evidence_type] = claimShape[type] || claimShape.SCHOLARLY_INTERPRETATION; const inserted = await checked(await db.from("claims").insert({ personality_id: person.id, parameter_field_id: fieldId, claim_text: statement, claim_kind, certainty, evidence_type, review_status: "draft", approval_origin: "ai_candidate", researcher_notes: `Guru Nanak curated corpus; ${source.key}; ${type}. Exact source anchor checked. Human review required.` }).select("id").single()); claimId = inserted.id; claimIds.set(norm(statement), claimId); counts.claimsAdded++; }
      const link = (await rows("claim_sources", "id", q => q.eq("claim_id", claimId).eq("source_id", sourceId).limit(1)))[0];
      if (!link) await checked(await db.from("claim_sources").insert({ claim_id: claimId, source_id: sourceId, relationship: "supports", evidence_excerpt: excerpt, page_or_section: anchor, notes: `Exact source anchor: ${anchor}; corpus source layer: ${source.layer}.` }));
      else await checked(await db.from("claim_sources").update({ evidence_excerpt: excerpt, page_or_section: anchor }).eq("id", link.id));
      await checked(await db.from("claim_chunks").upsert({ claim_id: claimId, chunk_id: chunk.id, relationship: "supports" }, { onConflict: "claim_id,chunk_id" }));
      await checked(await db.from("claim_epistemics").upsert({ claim_id: claimId, personality_id: person.id, epistemic_type: null, proposed_type: type, type_origin: "deterministic", type_confidence: 0.9, type_review_status: "needs_type_review", classifier_version: "guru-nanak-source-curation/1", contract_status: "NEEDS_TYPE_REVIEW", contract_satisfied: false, contract_version: "evidence-contracts/1", contract_detail: { source: source.url, layer: source.layer, anchor, reason: "Human review required before approval" } }, { onConflict: "claim_id" }));
    }
  }
  console.log(JSON.stringify({ mode: "apply", personalityId: person.id, sources: sources.length, claims: claims.length, ...counts }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
