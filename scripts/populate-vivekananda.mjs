import fs from "node:fs";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import { createClient } from "@supabase/supabase-js";
import { sources, claims } from "../data/vivekananda-corpus.mjs";

const framework = [
  ["vocation", "Life and vocation", "Identity, formation, and public role.", ["who", "life", "born", "monk"]],
  ["teachings", "Teachings and philosophy", "Spiritual and philosophical ideas.", ["teach", "vedanta", "philosophy", "religion"]],
  ["practice", "Practice and discipline", "Methods of spiritual development.", ["yoga", "practice", "meditation", "sadhana"]],
  ["lineage", "Teachers and lineage", "Teachers, disciples, and transmission.", ["ramakrishna", "teacher", "guru", "disciple"]],
  ["works", "Works and speeches", "Significant books, lectures, and letters.", ["book", "speech", "chicago", "lecture"]],
  ["service", "Service and institutions", "Social work, education, and institutions.", ["mission", "service", "education", "poor"]],
  ["context", "Historical context and reception", "Contemporary setting and later interpretations.", ["history", "colonial", "west", "impact", "nationalism"]],
  ["complexity", "Challenges and contested interpretations", "Difficulties, limitations, and scholarly disagreement.", ["challenge", "controversy", "dispute", "interpretation"]],
];
const aliases = ["Swami Vivekananda", "Vivekananda", "Narendranath Datta", "Narendra Nath Datta"];
const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
const apply = process.argv.includes("--apply");
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function checked(result) { if (result.error) throw result.error; return result.data; }
async function rows(table, columns, filter = (q) => q) { return await checked(await filter(db.from(table).select(columns))); }
async function pageText(source) {
  const response = await fetch(source.url, { headers: { "User-Agent": "Mozilla/5.0 (DCF source verification)" }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`${source.key}: HTTP ${response.status}`);
  if (source.url.endsWith(".pdf") || (response.headers.get("content-type") || "").includes("application/pdf")) {
    const parser = new PDFParse({ data: Buffer.from(await response.arrayBuffer()) });
    try { return (await parser.getText()).text.replace(/\s+/g, " ").trim(); }
    finally { await parser.destroy(); }
  }
  const $ = cheerio.load(await response.text());
  $("script,style,nav,footer,header,aside").remove();
  return ($("main").first().text() || $("article").first().text() || $("body").text()).replace(/\s+/g, " ").trim();
}
function passage(text, anchor, sourceKey) {
  const i = text.toLowerCase().indexOf(anchor.toLowerCase());
  if (i < 0) return null;
  const before = Math.max(0, i - 220);
  let after = Math.min(text.length, i + anchor.length + 330);
  if (sourceKey === "GOS") {
    const nextVisit = text.indexOf("During his second visit", i);
    if (nextVisit > i && nextVisit < after) after = nextVisit;
  }
  return text.slice(before, after).trim();
}
async function identity() {
  let category = (await rows("categories", "id,slug", (q) => q.eq("slug", "spiritual_teacher")))[0];
  let createdFramework = false;
  if (!category) {
    category = await checked(await db.from("categories").insert({ slug: "spiritual_teacher", name: "Saints and Spiritual Teachers", description: "Teachings, practices, lineages, institutions, and historical reception." }).select("id,slug").single());
    createdFramework = true;
  }
  for (const [index, [code, name, description, routing_hints]] of framework.entries()) {
    let parameter = (await rows("parameters", "id", (q) => q.eq("category_id", category.id).eq("code", code)))[0];
    if (!parameter) {
      parameter = await checked(await db.from("parameters").insert({ category_id: category.id, code, name, description, sort_order: index + 1, routing_hints }).select("id").single());
      createdFramework = true;
    }
    if (!(await rows("parameter_fields", "id", (q) => q.eq("parameter_id", parameter.id).eq("code", code))).length) {
      await checked(await db.from("parameter_fields").insert({ parameter_id: parameter.id, code, label: name, description, sort_order: 1 }));
    }
  }
  let person = (await rows("personalities", "id", (q) => q.eq("canonical_name", "Swami Vivekananda")))[0];
  if (!person) person = await checked(await db.from("personalities").insert({ canonical_name: "Swami Vivekananda", alternate_names: aliases.slice(1) }).select("id").single());
  await checked(await db.from("personality_categories").upsert({ personality_id: person.id, category_id: category.id, is_primary: true }, { onConflict: "personality_id,category_id" }));
  for (const alias of aliases) {
    if (!(await rows("personality_aliases", "id", (q) => q.eq("personality_id", person.id).ilike("alias", alias))).length)
      await checked(await db.from("personality_aliases").insert({ personality_id: person.id, alias, alias_type: alias === aliases[0] ? "canonical" : "alternate_name", confidence: 1 }));
  }
  return { person, createdFramework };
}
async function main() {
  const texts = new Map();
  const passages = new Map();
  for (const source of sources) {
    const text = await pageText(source);
    texts.set(source.key, text);
    const selected = claims.filter((c) => c[0] === source.key);
    const absent = selected.filter((c) => !passage(text, c[1], source.key));
    console.log(`${source.key}: ${text.length} chars, ${selected.length - absent.length}/${selected.length} anchors verified${absent.length ? `; missing ${absent.map((c) => c[1]).join(" | ")}` : ""}`);
    for (const claim of selected) if (passage(text, claim[1], source.key)) passages.set(claim, passage(text, claim[1], source.key));
  }
  if (passages.size !== claims.length) throw new Error(`${claims.length - passages.size} source anchors missing; no writes made`);
  if (!apply) return console.log(JSON.stringify({ mode: "dry-run", sources: sources.length, claims: claims.length }));
  const { person, createdFramework } = await identity();
  const fields = await rows("parameter_fields", "id,code,parameters!inner(categories!inner(slug))", (q) => q.eq("parameters.categories.slug", "spiritual_teacher"));
  const fieldIds = new Map(fields.map((f) => [f.code, f.id]));
  const sourceIds = new Map((await rows("sources", "id,url", (q) => q.in("url", sources.map((s) => s.url)))).map((s) => [s.url, s.id]));
  const claimIds = new Map((await rows("claims", "id,claim_text", (q) => q.eq("personality_id", person.id))).map((c) => [norm(c.claim_text), c.id]));
  const counts = { createdFramework, sourcesAdded: 0, sourcesReused: 0, claimsAdded: 0, duplicatesSkipped: 0, chunksAdded: 0 };
  for (const source of sources) {
    let sourceId = sourceIds.get(source.url);
    if (!sourceId) {
      const created = await checked(await db.from("sources").insert({ title: source.title, author: source.author || null, publisher_or_institution: source.publisher, source_type: source.type, url: source.url,
        citation: `${source.author ? `${source.author}. ` : ""}${source.title}. ${source.publisher}. ${source.url}`,
        source_status: "approved", approval_origin: "ai_candidate", approval_note: "Original page and cited anchors checked; curated claim review remains open.", ingestion_status: "ready",
        textual_layer: source.layer, rights_or_access_note: "Publicly accessible page; short research excerpts only.", metadata: { vivekananda_corpus: true } }).select("id").single());
      sourceId = created.id; counts.sourcesAdded++;
    } else counts.sourcesReused++;
    await checked(await db.from("source_personalities").upsert({ source_id: sourceId, personality_id: person.id, relationship: "subject", confidence: 1, mapping_method: "manual" }, { onConflict: "source_id,personality_id" }));
    for (const [index, claim] of claims.filter((c) => c[0] === source.key).entries()) {
      const [, anchor, field, type, statement] = claim;
      const excerpt = passages.get(claim), digest = hash(excerpt);
      const section = field === "lineage" ? "Ramakrishna relationship and influence" : source.title;
      let chunk = (await rows("source_chunks", "id", (q) => q.eq("source_id", sourceId).eq("content_hash", digest)))[0];
      if (!chunk) {
        const prior = (await rows("source_chunks", "id", (q) => q.eq("source_id", sourceId).eq("chunk_index", index).limit(1)))[0];
        if (prior) chunk = await checked(await db.from("source_chunks").update({ chunk_text: excerpt, content_hash: digest, token_estimate: Math.ceil(excerpt.length / 4),
          section_title: section, page_or_section: source.title, textual_layer: source.layer, metadata: { vivekananda_corpus: true, anchor }, embedding_status: "not_requested", embedding: null, embedding_model: null, embedding_dimensions: null }).eq("id", prior.id).select("id").single());
        else {
          chunk = await checked(await db.from("source_chunks").insert({ source_id: sourceId, chunk_index: index, chunk_text: excerpt, content_hash: digest, token_estimate: Math.ceil(excerpt.length / 4),
            section_title: section, page_or_section: source.title, textual_layer: source.layer, metadata: { vivekananda_corpus: true, anchor } }).select("id").single());
          counts.chunksAdded++;
        }
      }
      if (field === "lineage") await checked(await db.from("source_chunks").update({ section_title: section }).eq("id", chunk.id));
      const fieldId = fieldIds.get(field);
      if (!fieldId) throw new Error(`Missing field ${field}`);
      await checked(await db.from("chunk_personalities").upsert({ chunk_id: chunk.id, personality_id: person.id, relationship: "subject", relevance_score: 1, tagging_method: "manual", confidence: 1 }, { onConflict: "chunk_id,personality_id" }));
      await checked(await db.from("chunk_parameter_fields").upsert({ chunk_id: chunk.id, parameter_field_id: fieldId, confidence: 0.95, tagging_method: "manual" }, { onConflict: "chunk_id,parameter_field_id" }));
      let claimId = claimIds.get(norm(statement));
      if (!claimId) {
        const created = await checked(await db.from("claims").insert({ personality_id: person.id, parameter_field_id: fieldId, claim_text: statement,
          claim_kind: type === "HISTORICAL_FACT" ? "established_fact" : "scholarly_interpretation", certainty: type === "HISTORICAL_FACT" ? "high" : "medium",
          review_status: "draft", approval_origin: "ai_candidate", evidence_type: type === "SCHOLARLY_INTERPRETATION" ? "scholarly_interpretation" : "uncertain",
          researcher_notes: `Vivekananda starter corpus; ${source.key}; ${type}. Anchor verified in original source. Human review required.` }).select("id").single());
        claimId = created.id; claimIds.set(norm(statement), claimId); counts.claimsAdded++;
      } else counts.duplicatesSkipped++;
      const existingEvidence = (await rows("claim_sources", "id,evidence_excerpt", (q) => q.eq("claim_id", claimId).eq("source_id", sourceId)))[0];
      if (!existingEvidence)
        await checked(await db.from("claim_sources").insert({ claim_id: claimId, source_id: sourceId, relationship: "supports", evidence_excerpt: excerpt, page_or_section: source.title, notes: `Verified anchor: ${anchor}; claim requires human review.` }));
      else if (existingEvidence.evidence_excerpt !== excerpt)
        await checked(await db.from("claim_sources").update({ evidence_excerpt: excerpt }).eq("id", existingEvidence.id));
      await checked(await db.from("claim_chunks").upsert({ claim_id: claimId, chunk_id: chunk.id, relationship: "supports" }, { onConflict: "claim_id,chunk_id" }));
      await checked(await db.from("claim_epistemics").upsert({ claim_id: claimId, personality_id: person.id, epistemic_type: null,
        proposed_type: ({ PERSONALITY_STATEMENT: "TEXTUAL_ASSERTION", INSTITUTIONAL_ACCOUNT: "TRADITIONAL_NARRATIVE", DISCIPLE_TESTIMONY: "TRADITIONAL_NARRATIVE", CONTEMPORARY_REPORT: "HISTORICAL_INFERENCE" })[type] || type,
        type_origin: "deterministic", type_confidence: 0.9, type_review_status: "needs_type_review", classifier_version: "vivekananda-source-curation/1",
        contract_status: "NEEDS_TYPE_REVIEW", contract_satisfied: false, contract_version: "evidence-contracts/1", contract_detail: { source: source.url, anchor, attribution: type } }, { onConflict: "claim_id" }));
    }
  }
  console.log(JSON.stringify({ ...counts, sources: sources.length, claims: claims.length }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
