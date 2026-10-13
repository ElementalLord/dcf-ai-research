import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sources, claims } from "../data/ashoka-corpus.mjs";

const name = "Ashoka";
const slug = "political_leader";
const aliases = [name, "Aśoka", "Asoka", "Ashoka Maurya", "Emperor Ashoka", "Devanampiya Piyadasi"];
const apply = process.argv.includes("--apply");
const inspect = process.argv.includes("--status");
const norm = (value) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] ||= match[2].replace(/^['"]|['"]$/g, "");
}
const db = apply || inspect ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
const checked = async (result) => { if (result.error) throw result.error; return result.data; };
const rows = async (table, columns, filter = (query) => query) => checked(await filter(db.from(table).select(columns)));
const excerpt = (text, anchor) => {
  const at = text.toLowerCase().indexOf(anchor.toLowerCase());
  if (at < 0) return null;
  const start = Math.max(0, text.lastIndexOf(". ", at) + 2);
  const finish = text.indexOf(". ", at + anchor.length);
  return text.slice(start, finish < 0 ? text.length : finish + 1).trim();
};
async function identity() {
  const category = (await rows("categories", "id", (query) => query.eq("slug", slug)))[0];
  if (!category) throw new Error("The shared political_leader category must be migrated before corpus population.");
  let person = (await rows("personalities", "id", (query) => query.eq("canonical_name", name)))[0];
  if (!person) person = await checked(await db.from("personalities").insert({ canonical_name: name, alternate_names: aliases.slice(1) }).select("id").single());
  await checked(await db.from("personality_categories").upsert({ personality_id: person.id, category_id: category.id, is_primary: true }, { onConflict: "personality_id,category_id" }));
  for (const alias of aliases) {
    const existing = (await rows("personality_aliases", "id", (query) => query.eq("personality_id", person.id).ilike("alias", alias)))[0];
    if (!existing) await checked(await db.from("personality_aliases").insert({ personality_id: person.id, alias, alias_type: alias === name ? "canonical" : "alternate_name", confidence: alias === "Devanampiya Piyadasi" ? 0.9 : 0.99 }));
  }
  return person;
}
async function main() {
  const passages = new Map();
  for (const source of sources) {
    const selected = claims.filter((claim) => claim[0] === source.key);
    const missing = selected.filter((claim) => !excerpt(source.snapshot, claim[1]));
    console.log(`${source.key}: ${selected.length - missing.length}/${selected.length} anchors verified in documented excerpt`);
    for (const claim of selected) passages.set(claim, excerpt(source.snapshot, claim[1]));
    if (missing.length) console.log(`  Missing: ${missing.map((claim) => claim[1]).join(" | ")}`);
  }
  if ([...passages.values()].some((passage) => !passage)) throw new Error("A documented source excerpt is missing an anchor; no corpus writes made.");
  if (inspect) {
    const person = (await rows("personalities", "id", (query) => query.eq("canonical_name", name)))[0];
    const sourceLinks = person ? await rows("source_personalities", "source_id", (query) => query.eq("personality_id", person.id)) : [];
    const savedClaims = person ? await rows("claims", "id", (query) => query.eq("personality_id", person.id)) : [];
    return console.log(JSON.stringify({ mode: "status", personalityId: person?.id || null, sources: sourceLinks.length, claims: savedClaims.length }));
  }
  if (!apply) return console.log(JSON.stringify({ mode: "dry-run", sources: sources.length, claims: claims.length }));

  const person = await identity();
  const fields = await rows("parameter_fields", "id,code,parameters!inner(categories!inner(slug))", (query) => query.eq("parameters.categories.slug", slug));
  const fieldIds = new Map(fields.map((field) => [field.code, field.id]));
  for (const claim of claims) if (!fieldIds.has(claim[2])) throw new Error(`Missing shared parameter field: ${claim[2]}`);
  const existingSources = await rows("sources", "id,url", (query) => query.in("url", sources.map((source) => source.url)));
  const sourceIds = new Map(existingSources.map((source) => [source.url, source.id]));
  const existingClaims = await rows("claims", "id,claim_text", (query) => query.eq("personality_id", person.id));
  const claimIds = new Map(existingClaims.map((claim) => [norm(claim.claim_text), claim.id]));
  const counts = { sourcesAdded: 0, claimsAdded: 0, chunksAdded: 0 };
  for (const source of sources) {
    let sourceId = sourceIds.get(source.url);
    if (!sourceId) {
      const created = await checked(await db.from("sources").insert({ title: source.title, author: source.author || null, publisher_or_institution: source.publisher, source_type: source.type === "primary_source" ? "primary_text" : source.type, publication_year: source.year || null, url: source.url, citation: `${source.author ? `${source.author}. ` : ""}${source.title}. ${source.publisher}. ${source.url}`, source_status: "approved", approval_origin: "ai_candidate", approval_note: "Curated Ashoka corpus; source type is explicit and all stored excerpts were checked against the cited edition or catalogue. Claims remain drafts for review.", ingestion_status: "ready", textual_layer: source.layer, rights_or_access_note: "Short documented research excerpts only; source layer is shown so translation, later tradition and modern scholarship are not conflated.", metadata: { ashoka_corpus: true, verified_at: "2026-10-13", source_kind: source.layer } }).select("id").single());
      sourceId = created.id; counts.sourcesAdded++;
    }
    sourceIds.set(source.url, sourceId);
    await checked(await db.from("source_personalities").upsert({ source_id: sourceId, personality_id: person.id, relationship: "subject", confidence: 1, mapping_method: "manual" }, { onConflict: "source_id,personality_id" }));
    for (const [index, claim] of claims.filter((item) => item[0] === source.key).entries()) {
      const [, anchor, field, type, statement] = claim;
      const passage = passages.get(claim), hash = digest(passage), fieldId = fieldIds.get(field);
      let chunk = (await rows("source_chunks", "id", (query) => query.eq("source_id", sourceId).eq("content_hash", hash).limit(1)))[0];
      if (!chunk) {
        const prior = (await rows("source_chunks", "id", (query) => query.eq("source_id", sourceId).eq("chunk_index", index).limit(1)))[0];
        const values = { chunk_text: passage, content_hash: hash, token_estimate: Math.ceil(passage.length / 4), section_title: `${name}: ${source.title}`, page_or_section: anchor, textual_layer: source.layer, metadata: { ashoka_corpus: true, anchor } };
        if (prior) chunk = await checked(await db.from("source_chunks").update({ ...values, is_active: true, embedding_status: "not_requested", embedding: null, embedding_model: null, embedding_dimensions: null }).eq("id", prior.id).select("id").single());
        else { chunk = await checked(await db.from("source_chunks").insert({ source_id: sourceId, chunk_index: index, ...values }).select("id").single()); counts.chunksAdded++; }
      }
      await checked(await db.from("chunk_personalities").upsert({ chunk_id: chunk.id, personality_id: person.id, relationship: "subject", relevance_score: 1, tagging_method: "manual", confidence: 1 }, { onConflict: "chunk_id,personality_id" }));
      await checked(await db.from("chunk_parameter_fields").upsert({ chunk_id: chunk.id, parameter_field_id: fieldId, confidence: 0.95, tagging_method: "manual" }, { onConflict: "chunk_id,parameter_field_id" }));
      let claimId = claimIds.get(norm(statement));
      if (!claimId) {
        const created = await checked(await db.from("claims").insert({ personality_id: person.id, parameter_field_id: fieldId, claim_text: statement, claim_kind: type === "HISTORICAL_FACT" || type === "TEXTUAL_ASSERTION" ? "established_fact" : "scholarly_interpretation", certainty: type === "TEXTUAL_ASSERTION" ? "high" : "medium", review_status: "draft", approval_origin: "ai_candidate", evidence_type: "uncertain", researcher_notes: `Ashoka curated corpus; ${source.key}; proposed ${type}. Source authority is explicit; human review required.` }).select("id").single());
        claimId = created.id; claimIds.set(norm(statement), claimId); counts.claimsAdded++;
      }
      const link = (await rows("claim_sources", "id", (query) => query.eq("claim_id", claimId).eq("source_id", sourceId).limit(1)))[0];
      if (!link) await checked(await db.from("claim_sources").insert({ claim_id: claimId, source_id: sourceId, relationship: "supports", evidence_excerpt: passage, page_or_section: anchor, notes: `Verified source anchor: ${anchor}; proposed type ${type}.` }));
      else await checked(await db.from("claim_sources").update({ evidence_excerpt: passage, page_or_section: anchor }).eq("id", link.id));
      await checked(await db.from("claim_chunks").upsert({ claim_id: claimId, chunk_id: chunk.id, relationship: "supports" }, { onConflict: "claim_id,chunk_id" }));
      await checked(await db.from("claim_epistemics").upsert({ claim_id: claimId, personality_id: person.id, epistemic_type: null, proposed_type: type, type_origin: "deterministic", type_confidence: 0.92, type_review_status: "needs_type_review", classifier_version: "ashoka-source-curation/1", contract_status: "NEEDS_TYPE_REVIEW", contract_satisfied: false, contract_version: "evidence-contracts/1", contract_detail: { reason: "Source authority is explicit; historical synthesis needs review.", source: source.url, anchor } }, { onConflict: "claim_id" }));
    }
  }
  console.log(JSON.stringify({ mode: "apply", personalityId: person.id, sources: sources.length, claims: claims.length, ...counts }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
