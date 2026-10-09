import fs from "node:fs";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import { createClient } from "@supabase/supabase-js";

// Source anchors are checked against the original page or PDF before any write.
// Claims are draft research records; only the independently checked passages enter Ask.
const sources = [
  { key: "MAC", title: "Srinivasa Ramanujan — Biography", publisher: "MacTutor History of Mathematics, University of St Andrews", author: "J. J. O'Connor and E. F. Robertson", type: "scholarly_article", layer: "Scholarly biography", url: "https://mathshistory.st-andrews.ac.uk/Biographies/Ramanujan/" },
  { key: "CAM", title: "The man who taught infinity: Hardy and Ramanujan", publisher: "University of Cambridge", author: "Béla Bollobás", year: 2016, type: "scholarly_article", layer: "Mathematician's historical interpretation", url: "https://www.cam.ac.uk/research/news/opinion-the-man-who-taught-infinity-how-gh-hardy-tamed-srinivasa-ramanujans-genius" },
  { key: "RS", title: "Revisiting Ramanujan", publisher: "Royal Society", author: "Ellen Embleton", year: 2018, type: "institutional", layer: "Institutional archive account", url: "https://royalsociety.org/blog/2018/10/revisiting-ramanujan/" },
  { key: "DSB", title: "Ramanujan — Complete Dictionary of Scientific Biography", publisher: "Charles Scribner's Sons; hosted by MacTutor", author: "Øystein Ore", year: 2008, type: "scholarly_article", layer: "Scholarly history of mathematics", url: "https://mathshistory.st-andrews.ac.uk/DSB/Ramanujan.pdf" },
  { key: "HARDY", title: "Srinivasa Ramanujan — Obituary Notices of Fellows Deceased", publisher: "Royal Society; hosted by MacTutor", author: "G. H. Hardy", year: 1921, type: "primary_text", layer: "Hardy's first-person testimony and mathematical assessment", url: "https://mathshistory.st-andrews.ac.uk/RS/ramanujan_rs.pdf" },
  { key: "ILL", title: "Fifty Golden Years with Ramanujan", publisher: "Bhāvanā; hosted by University of Illinois Mathematics", author: "Bruce C. Berndt in conversation with Atul Dixit", year: 2024, type: "scholarly_article", layer: "Scholar interview on the notebooks' reception", url: "https://math.illinois.edu/sites/default/files/2025-03/Berndt-Dixit-interview.pdf" },
];

// key, source locator, exact source anchor, existing Scientist field, proposed epistemic type, substantive claim.
// Anecdotes and Hardy's judgments are attributed; none is asserted as an independently established event or supernatural fact.
const claims = [
  ["MAC","Biography, opening","analytical theory of numbers","scientific_role","HISTORICAL_FACT","Srinivasa Ramanujan was an Indian mathematician whose main contributions were to analytic number theory, alongside work on continued fractions and infinite series."],
  ["MAC","Biography, early life","born in his grandmother's house in Erode","historical_context","HISTORICAL_FACT","Ramanujan was born in Erode in 1887 and grew up chiefly in Kumbakonam in South India."],
  ["MAC","Biography, early education","mathematics book by G S Carr","research_methods","HISTORICAL_FACT","As a student, Ramanujan studied G. S. Carr's compendium of mathematical results, an important resource for his independent mathematical learning."],
  ["MAC","Biography, college","scholarship was not renewed","persistence","HISTORICAL_FACT","Ramanujan lost his Government College scholarship after concentrating on mathematics and neglecting other subjects."],
  ["MAC","Biography, independent study","without any help","persistence","HISTORICAL_FACT","Without a university mathematics education or regular access to current research, Ramanujan continued developing ideas independently."],
  ["MAC","Biography, early publication","Bernoulli numbers in 1911","discoveries","HISTORICAL_FACT","Ramanujan's 1911 paper on Bernoulli numbers in the Journal of the Indian Mathematical Society brought wider notice to his mathematical work."],
  ["MAC","Biography, employment","Madras Port Trust","persistence","HISTORICAL_FACT","Ramanujan supported himself as a clerk at the Madras Port Trust while continuing mathematical research."],
  ["MAC","Biography, first letter","no university education","research_methods","SCHOLARLY_ATTRIBUTION","In his letter to Hardy, Ramanujan emphasized that he had no university education and was pursuing an unconventional path in mathematics."],
  ["MAC","Biography, Madras support","scholarship in May 1913","institutions","HISTORICAL_FACT","The University of Madras awarded Ramanujan a two-year scholarship in 1913, enabling him to pursue research."],
  ["MAC","Biography, later reception","unpublished notebooks","impact","MODERN_RECEPTION","Ramanujan left unpublished notebooks whose theorems continued to attract mathematical research after his death."],

  ["CAM","Hardy correspondence","a letter to Hardy in Cambridge","institutions","HISTORICAL_FACT","Ramanujan sent Hardy a long list of mathematical discoveries in 1913, beginning the correspondence that changed his research opportunities."],
  ["CAM","Hardy and Littlewood assessment","others they could disprove","contested","SCHOLARLY_ATTRIBUTION","Béla Bollobás recounts that Hardy and Littlewood found Ramanujan's first letter mixed familiar, provable, disprovable, and striking unresolved assertions."],
  ["CAM","Hardy's reply","encouraging reply to Ramanujan","institutions","HISTORICAL_FACT","Hardy's encouraging reply led to a sustained exchange of letters with Ramanujan."],
  ["CAM","Mathematical training","solid foundation in mathematics","mentorship","SCHOLARLY_ATTRIBUTION","Bollobás argues that Hardy tried to give Ramanujan the mathematical foundations needed to develop his exceptional talent."],
  ["CAM","Journey to Cambridge","arrived in Cambridge in April 1914","institutions","HISTORICAL_FACT","With help from Hardy and E. H. Neville, Ramanujan reached Cambridge in April 1914."],
  ["CAM","Cambridge collaboration","published one excellent paper after another","impact","SCHOLARLY_ATTRIBUTION","Bollobás describes Ramanujan's Cambridge years as a productive period of papers and joint work with Hardy."],
  ["CAM","Illness in England","spring of 1917 Ramanujan fell ill","persistence","HISTORICAL_FACT","Ramanujan became seriously ill in 1917 and spent much of his remaining time in England in sanatoria."],
  ["CAM","Final mathematical work","mock theta functions","discoveries","HISTORICAL_FACT","Near the end of his life, Ramanujan sent Hardy examples of his new mock theta functions."],
  ["CAM","Later mathematics","larger class of mock modular forms","impact","MODERN_RECEPTION","Later mathematicians connected Ramanujan's mock theta functions with the broader theory of mock modular forms."],

  ["RS","Royal Society archive, early work","Some properties of Bernoulli’s numbers","historical_context","HISTORICAL_FACT","Ramanujan published mathematical work in India before going to Cambridge, including his 1911 Bernoulli-numbers paper."],
  ["RS","Royal Society archive, joint paper","coefficients in the expansions of certain modular functions","discoveries","HISTORICAL_FACT","Ramanujan and Hardy jointly published work on coefficients of modular functions in the Royal Society's Proceedings in 1918."],
  ["RS","Royal Society archive, election","2 May 1918","impact","HISTORICAL_FACT","Ramanujan was elected a Fellow of the Royal Society on 2 May 1918."],
  ["RS","Royal Society archive, Hardy testimony","mathematician of the highest quality","qualities","SCHOLARLY_ATTRIBUTION","Hardy later characterized the 1913 letter's author as a mathematician of exceptional originality and power."],

  ["DSB","Biography, first letter","more than 100 theorems","research_methods","HISTORICAL_FACT","Ramanujan's first letter to Hardy presented more than one hundred mathematical assertions across several topics."],
  ["DSB","Biography, Cambridge","admitted to Trinity College in 1914","institutions","HISTORICAL_FACT","Ramanujan entered Trinity College, Cambridge, in 1914 and developed his work with Hardy and Littlewood's guidance."],
  ["DSB","Biography, mathematical background","consisted of rediscoveries","contested","SCHOLARLY_INTERPRETATION","The scholarly biography notes that limited training and library access led Ramanujan to rediscover some results already known elsewhere."],
  ["DSB","Biography, proof practice","not proved in the standard sense","research_methods","SCHOLARLY_INTERPRETATION","Many notebook results were recorded without proofs meeting the standard mathematical expectations of his Cambridge peers."],
  ["DSB","Biography, European papers","Approximations to π","discoveries","HISTORICAL_FACT","Ramanujan published unusually effective approximations to pi in his work on modular equations."],
  ["DSB","Biography, highly composite numbers","Highly Composite Numbers","discoveries","HISTORICAL_FACT","Ramanujan's study of highly composite numbers established important properties of integers with exceptionally many divisors."],
  ["DSB","Biography, partitions","partition of numbers into summands","discoveries","HISTORICAL_FACT","Ramanujan studied integer partitions and identified striking congruence patterns in partition counts."],
  ["DSB","Biography, Hardy collaboration","asymptotic value of p(n)","discoveries","HISTORICAL_FACT","Hardy and Ramanujan developed an asymptotic formula for the partition function p(n)."],
  ["DSB","Biography, later proof","Rademacher later established","impact","MODERN_RECEPTION","Hans Rademacher later established an exact convergent formula extending the Hardy–Ramanujan partition work."],
  ["DSB","Biography, recognition","fellow of Trinity College","impact","HISTORICAL_FACT","In 1918 Ramanujan became a Fellow of Trinity College as well as a Fellow of the Royal Society."],

  ["HARDY","Hardy obituary, pp. xvi–xvii","Indian work on primes","contested","SCHOLARLY_ATTRIBUTION","Hardy judged that some of Ramanujan's early prime-number results were false, illustrating the limits of intuition without rigorous proof."],
  ["HARDY","Hardy obituary, p. xx","learnt from him much more","mentorship","SCHOLARLY_ATTRIBUTION","Hardy said he taught Ramanujan some modern mathematics but learned even more from him."],
  ["HARDY","Hardy obituary, p. xxviii","by induction from numerical","research_methods","SCHOLARLY_ATTRIBUTION","Hardy described Ramanujan as often generalizing from numerical examples, including in his discoveries about partition congruences."],
  ["HARDY","Hardy obituary, p. xxviii","insight into algebraical formulae","qualities","SCHOLARLY_ATTRIBUTION","Hardy especially admired Ramanujan's insight into algebraic formulas and transformations of infinite series."],
  ["HARDY","Hardy obituary, p. xxviii","taxicab No. 1729","contested","SCHOLARLY_ATTRIBUTION","Hardy recounted the 1729 taxicab exchange as his own memory of Ramanujan's unusual familiarity with numbers; it remains attributed testimony rather than an independently verified transcript."],
  ["HARDY","Hardy obituary, p. xxvii","Rogers-Ramanujan","contested","SCHOLARLY_ATTRIBUTION","Hardy noted that Ramanujan's work on the Rogers–Ramanujan identities should share credit with L. J. Rogers, who had earlier results."],

  ["ILL","Berndt interview, p. 5","3254 theorems contained in the Notebooks","impact","MODERN_RECEPTION","Bruce Berndt's long-running study of Ramanujan's notebooks counted more than three thousand recorded theorems and sought proofs for them."],
  ["ILL","Berndt interview, lost notebook discussion","spring of 1976 at Trinity College","impact","SCHOLARLY_ATTRIBUTION","Berndt recalls that George Andrews found Ramanujan's lost notebook at Trinity College in 1976, opening another major line of study."],
  ["ILL","Berndt interview, notebook editions","five volumes published by Springer","impact","MODERN_RECEPTION","Berndt and collaborators published five volumes explaining and proving results from Ramanujan's earlier notebooks."],
  ["ILL","Berndt interview, methods discussion","we really don’t un- derstand","research_methods","SCHOLARLY_ATTRIBUTION","Berndt says that even after extensive proof work, mathematicians do not fully understand how Ramanujan found some of his deeper identities."],
];

const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const digest = (s) => crypto.createHash("sha256").update(s).digest("hex");
const apply = process.argv.includes("--apply");
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function rows(table, columns, filter = (query) => query) {
  const result = await filter(db.from(table).select(columns));
  if (result.error) throw result.error;
  return result.data || [];
}
async function checked(result) { if (result.error) throw result.error; return result.data; }
async function sourceText(source) {
  const response = await fetch(source.url, { headers: { "User-Agent": "Mozilla/5.0 (DCF research source verification)" }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`${source.key}: HTTP ${response.status}`);
  if (source.url.endsWith(".pdf")) {
    const parser = new PDFParse({ data: Buffer.from(await response.arrayBuffer()) });
    try { return (await parser.getText()).text.replace(/\s+/g, " ").trim(); }
    finally { await parser.destroy(); }
  }
  const $ = cheerio.load(await response.text());
  $("script,style,nav,footer,header").remove();
  return ($("main").first().text() || $("body").text()).replace(/\s+/g, " ").trim();
}

async function main() {
  const people = await rows("personalities", "id,canonical_name", (q) => q.eq("canonical_name", "Srinivasa Ramanujan"));
  const person = people[0];
  if (!person) throw new Error("Apply the Ramanujan identity migration first.");
  const fields = await rows("parameter_fields", "id,code,parameters!inner(categories!inner(slug))", (q) => q.eq("parameters.categories.slug", "scientist"));
  const fieldIds = new Map(fields.map((field) => [field.code, field.id]));
  const existingSources = await rows("sources", "id,url,publication_year", (q) => q.in("url", sources.map((source) => source.url)));
  const sourceIds = new Map(existingSources.map((source) => [source.url, source.id]));
  const sourceYears = new Map(existingSources.map((source) => [source.url, source.publication_year]));
  const existingClaims = await rows("claims", "id,claim_text", (q) => q.eq("personality_id", person.id));
  const claimIds = new Map(existingClaims.map((claim) => [norm(claim.claim_text), claim.id]));
  let createdSources = 0, createdClaims = 0, createdPassages = 0;
  for (const source of sources) {
    const text = await sourceText(source);
    const selected = claims.filter((claim) => claim[0] === source.key);
    const passages = selected.map((claim) => {
      const at = norm(text).indexOf(norm(claim[2]));
      const rawAt = text.toLowerCase().indexOf(claim[2].toLowerCase());
      if (at < 0 || rawAt < 0) throw new Error(`${source.key}: missing exact anchor: ${claim[2]}`);
      const priorSentence = text.lastIndexOf(". ", rawAt - 1) + 2;
      const floor = Math.max(0, rawAt - 450);
      const start = priorSentence >= floor ? priorSentence : (text.indexOf(" ", floor) + 1 || floor);
      const nextSentence = text.indexOf(". ", rawAt + claim[2].length + 80);
      const end = nextSentence > 0 && nextSentence - rawAt < 550 ? nextSentence + 1 : Math.min(text.length, rawAt + claim[2].length + 350);
      return text.slice(start, end).trim();
    });
    console.log(`${source.key}: verified ${selected.length} anchors in ${text.length} source characters`);
    if (!apply) continue;
    let sourceId = sourceIds.get(source.url);
    if (!sourceId) {
      const inserted = await checked(await db.from("sources").insert({ title: source.title, author: source.author || null,
        publisher_or_institution: source.publisher, source_type: source.type, publication_year: source.year || null, url: source.url,
        citation: `${source.author ? `${source.author}. ` : ""}${source.title}. ${source.publisher}. ${source.url}`,
        source_status: "approved", approval_origin: "ai_candidate", approval_note: "Original source and every cited passage anchor checked; source record is editable through Resources review workflow.",
        ingestion_status: "ready", textual_layer: source.layer, rights_or_access_note: "Public source; short research excerpts only.",
        metadata: { ramanujan_corpus: true, verified_at: new Date().toISOString() } }).select("id").single());
      sourceId = inserted.id; sourceIds.set(source.url, sourceId); createdSources++;
    }
    if (source.year && !sourceYears.get(source.url)) await checked(await db.from("sources").update({ publication_year: source.year }).eq("id", sourceId));
    await checked(await db.from("source_personalities").upsert({ source_id: sourceId, personality_id: person.id, relationship: "subject", confidence: 1, mapping_method: "manual" }, { onConflict: "source_id,personality_id" }));
    for (const [index, claim] of selected.entries()) {
      const passage = passages[index];
      const hash = digest(passage);
      const same = await rows("source_chunks", "id,content_hash", (q) => q.eq("source_id", sourceId).eq("content_hash", hash).limit(1));
      const old = await rows("source_chunks", "id,content_hash", (q) => q.eq("source_id", sourceId).eq("chunk_index", index).limit(1));
      let chunkId = same[0]?.id || old[0]?.id;
      if (same[0]) await checked(await db.from("source_chunks").update({ is_active: true }).eq("id", same[0].id));
      if (same[0] && old[0] && same[0].id !== old[0].id) await checked(await db.from("source_chunks").update({ is_active: false }).eq("id", old[0].id));
      if (chunkId && !same[0] && old[0]?.content_hash !== hash) await checked(await db.from("source_chunks").update({ chunk_text: passage,
        content_hash: hash, token_estimate: Math.ceil(passage.length / 4), section_title: claim[1], page_or_section: claim[1],
        embedding_status: "not_requested", embedding: null, embedding_model: null, embedding_dimensions: null }).eq("id", chunkId));
      if (!chunkId) {
        const inserted = await checked(await db.from("source_chunks").insert({ source_id: sourceId, chunk_index: index,
          chunk_text: passage, section_title: claim[1], page_or_section: claim[1], textual_layer: source.layer,
          content_hash: hash, token_estimate: Math.ceil(passage.length / 4), metadata: { ramanujan_corpus: true } }).select("id").single());
        chunkId = inserted.id; createdPassages++;
      }
      await checked(await db.from("chunk_personalities").upsert({ chunk_id: chunkId, personality_id: person.id,
        relationship: "subject", relevance_score: 1, tagging_method: "manual", confidence: 1 }, { onConflict: "chunk_id,personality_id" }));
      const fieldId = fieldIds.get(claim[3]);
      if (!fieldId) throw new Error(`Unknown scientist field: ${claim[3]}`);
      await checked(await db.from("chunk_parameter_fields").upsert({ chunk_id: chunkId, parameter_field_id: fieldId,
        confidence: 0.95, tagging_method: "manual" }, { onConflict: "chunk_id,parameter_field_id" }));
      let claimId = claimIds.get(norm(claim[5]));
      if (!claimId) {
        const inserted = await checked(await db.from("claims").insert({ personality_id: person.id, parameter_field_id: fieldId,
          claim_text: claim[5], claim_kind: claim[4] === "HISTORICAL_FACT" ? "established_fact" : "scholarly_interpretation",
          certainty: claim[4] === "HISTORICAL_FACT" ? "high" : "medium", review_status: "draft",
          approval_origin: "ai_candidate", evidence_type: claim[4] === "HISTORICAL_FACT" ? "uncertain" : "scholarly_interpretation",
          researcher_notes: `Ramanujan starter corpus; ${source.key}; ${claim[1]}. Evidence and epistemic type require human review.` }).select("id").single());
        claimId = inserted.id; claimIds.set(norm(claim[5]), claimId); createdClaims++;
      }
      const existingLink = await rows("claim_sources", "id", (q) => q.eq("claim_id", claimId).eq("source_id", sourceId).limit(1));
      if (!existingLink.length) await checked(await db.from("claim_sources").insert({ claim_id: claimId, source_id: sourceId,
        relationship: "supports", evidence_excerpt: passage, page_or_section: claim[1],
        notes: `Exact source anchor: ${claim[2]}. Claim remains review-required.` }));
      else await checked(await db.from("claim_sources").update({ evidence_excerpt: passage, page_or_section: claim[1] }).eq("id", existingLink[0].id));
      await checked(await db.from("claim_chunks").upsert({ claim_id: claimId, chunk_id: chunkId, relationship: "supports" }, { onConflict: "claim_id,chunk_id" }));
      if (old[0] && old[0].id !== chunkId) await checked(await db.from("claim_chunks").delete().eq("claim_id", claimId).eq("chunk_id", old[0].id));
      await checked(await db.from("claim_epistemics").upsert({ claim_id: claimId, personality_id: person.id,
        epistemic_type: null, proposed_type: claim[4], type_origin: "deterministic", type_confidence: 0.9,
        type_review_status: "needs_type_review", classifier_version: "ramanujan-source-curation/1",
        contract_status: "NEEDS_TYPE_REVIEW", contract_satisfied: false, contract_version: "evidence-contracts/1",
        contract_detail: { reason: "Human review required before claim approval", source: source.url, locator: claim[1] }
      }, { onConflict: "claim_id" }));
    }
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", sources: sources.length, claims: claims.length,
    createdSources, createdClaims, createdPassages }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
