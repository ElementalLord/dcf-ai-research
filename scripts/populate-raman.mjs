import fs from "node:fs";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import { createClient } from "@supabase/supabase-js";

// Source anchors are checked against the original page or PDF before any write.
// Claims are draft research records; only the independently checked passages enter Ask.
const sources = [
  { key: "BIO", title: "Sir Chandrasekhara Venkata Raman — Biographical", publisher: "NobelPrize.org", type: "institutional", layer: "Contemporary award biography", url: "https://www.nobelprize.org/prizes/physics/1930/raman/biographical/" },
  { key: "LECTURE", title: "The Molecular Scattering of Light — Nobel Lecture", publisher: "NobelPrize.org", author: "C. V. Raman", type: "primary_text", layer: "Raman's 1930 scientific account", url: "https://www.nobelprize.org/uploads/2018/06/raman-lecture.pdf" },
  { key: "HISTORY", title: "The Nobel Prizes in Physics 1901–2000", publisher: "NobelPrize.org", type: "scholarly_article", layer: "History of physics", url: "https://www.nobelprize.org/prizes/themes/the-nobel-prize-in-physics-1901-2000/" },
  { key: "RRI", title: "Raman Research Institute — Overview", publisher: "Raman Research Institute", type: "institutional", layer: "Institutional history", url: "https://www.rri.res.in/about/overview" },
  { key: "IAS", title: "Science Education Programmes — Indian Academy of Sciences", publisher: "Indian Academy of Sciences", type: "institutional", layer: "Institutional history and education", url: "https://webjapps.ias.ac.in/SEP/index.jsp" },
  { key: "IISC", title: "CV Raman and Physics at IISc", publisher: "Indian Institute of Science", type: "institutional", layer: "Institutional archive", url: "https://iisc.ac.in/wp-content/uploads/2018/03/CV_RAMAN_AND_PHYSICS_AT_IISc.pdf" },
  { key: "IACS", title: "80 Years Ago: The Discovery of the Raman Effect at IACS", publisher: "Indian Journal of Physics / IACS", author: "Rajinder Singh", type: "scholarly_article", layer: "Scholarly history of science; abstract", url: "https://www.iacs.res.in/ijp/ijp_august_08_abstract.pdf" },
];

// key, source locator, short exact anchor, framework field, epistemic type, atomic claim
const claims = [
  ["BIO","Biographical, opening","born at Tiruchirappalli","scientific_role","HISTORICAL_FACT","C. V. Raman was born in Tiruchirappalli in 1888."],
  ["BIO","Biographical, education","Presidency College","scientific_role","HISTORICAL_FACT","Raman studied at Presidency College in Madras and earned his M.A. in 1907."],
  ["BIO","Biographical, early research","optics and acoustics","scientific_role","HISTORICAL_FACT","Raman's early research covered optics and acoustics."],
  ["BIO","Biographical, civil service","Indian Finance Department","persistence","HISTORICAL_FACT","Raman conducted experimental research at IACS while employed in the Indian Finance Department."],
  ["BIO","Biographical, Calcutta University","Palit Chair of Physics","institutions","HISTORICAL_FACT","Raman accepted the Palit Chair of Physics at Calcutta University in 1917."],
  ["BIO","Biographical, 1928 discovery","28th of February, 1928","discoveries","HISTORICAL_FACT","Raman made the discovery of the light-scattering effect bearing his name on 28 February 1928."],
  ["BIO","Biographical, later research","structure and properties of diamond","discoveries","HISTORICAL_FACT","Raman's later laboratory work examined diamond and the optical properties of iridescent materials."],
  ["BIO","Biographical, recognition","Fellow of the Royal Society","impact","HISTORICAL_FACT","Raman was elected a Fellow of the Royal Society in 1924."],
  ["BIO","Biographical, recognition","knighted in 1929","impact","HISTORICAL_FACT","Raman was knighted in 1929."],

  ["LECTURE","Nobel lecture, pp. 267–268","blue opalescence of the Mediter","qualities","SCHOLARLY_ATTRIBUTION","In his Nobel lecture, Raman traced his light-scattering research to curiosity about the blue Mediterranean Sea."],
  ["LECTURE","Nobel lecture, p. 267","experiments with this object were started","research_methods","SCHOLARLY_ATTRIBUTION","Raman said he began experiments on light scattering in liquids after returning to Calcutta in 1921."],
  ["LECTURE","Nobel lecture, p. 269","succession of able collaborators","mentorship","SCHOLARLY_ATTRIBUTION","Raman's Nobel lecture credited a succession of collaborators in the Calcutta light-scattering program."],
  ["LECTURE","Nobel lecture, p. 269","Krishnan examined a great many liquids","research_methods","SCHOLARLY_ATTRIBUTION","Raman specifically credited K. S. Krishnan with examining many liquids in the scattering experiments."],
  ["LECTURE","Nobel lecture, p. 270","not due to any fluorescent impurity","research_methods","SCHOLARLY_ATTRIBUTION","The research group used purification and repeated distillation to test whether the new radiation came from an impurity."],
  ["LECTURE","Nobel lecture, p. 270","highly purified sample of glycerine","research_methods","SCHOLARLY_ATTRIBUTION","Raman described glycerine observations that helped reveal a clear color shift in scattered light."],
  ["LECTURE","Nobel lecture, p. 271","7-inch refracting telescope","research_methods","SCHOLARLY_ATTRIBUTION","The group concentrated sunlight with a seven-inch refracting telescope to make the weak effect visible."],
  ["LECTURE","Nobel lecture, p. 271","mercury arc","research_methods","SCHOLARLY_ATTRIBUTION","Raman's team then used the monochromatic light of a mercury arc to inspect the scattered spectrum."],
  ["LECTURE","Nobel lecture, p. 272","sharp lines or bands","discoveries","SCHOLARLY_ATTRIBUTION","Raman reported new sharp spectral lines in scattered light that were absent from the incident mercury light."],
  ["LECTURE","Nobel lecture, pp. 273–274","rotation, vibration","discoveries","SCHOLARLY_ATTRIBUTION","Raman explained that shifted frequencies can reveal molecular rotation and vibration."],
  ["LECTURE","Nobel lecture, p. 274","wide range of problems in physics and chemistry","impact","SCHOLARLY_ATTRIBUTION","Raman argued that the effect could help investigate a wide range of problems in physics and chemistry."],

  ["HISTORY","1930 Raman paragraph","shifted in frequency","discoveries","HISTORICAL_FACT","The Raman effect includes light scattered at frequencies different from the incident light."],
  ["HISTORY","1930 Raman paragraph","gain or loss of characteristic amounts of energy","discoveries","HISTORICAL_FACT","The frequency shifts reflect molecules gaining or losing energy in rotational or vibrational changes."],
  ["HISTORY","1930 Raman paragraph","information on molecular structure and dynamics","impact","MODERN_RECEPTION","Raman spectroscopy became a tool for studying molecular structure and dynamics."],
  ["HISTORY","1930 Raman paragraph","received the Physics Prize","impact","HISTORICAL_FACT","Raman received the 1930 Nobel Prize in Physics for his work on light scattering."],

  ["RRI","Overview, founding","founded in 1948","institutions","HISTORICAL_FACT","Raman founded the Raman Research Institute in 1948 after retiring from IISc."],
  ["RRI","Overview, founding","served as its director","institutions","HISTORICAL_FACT","Raman directed the Raman Research Institute and pursued research there until 1970."],
  ["RRI","Overview, funding","funded personally by him","institutions","HISTORICAL_FACT","The Raman Research Institute was initially funded by Raman and private donations."],
  ["RRI","Overview, history","Indian Academy of Sciences was founded","institutions","HISTORICAL_FACT","Raman founded the Indian Academy of Sciences in 1934."],

  ["IAS","Science Education Programmes, founding","promoting the progress and upholding the cause of science","institutions","HISTORICAL_FACT","The Academy Raman founded set promotion of pure and applied science among its objectives."],
  ["IAS","Science Education Programmes, education","nurturing of scientific talent","mentorship","SCHOLARLY_ATTRIBUTION","The Indian Academy of Sciences presents scientific creativity and nurturing young talent as linked to science education."],

  ["IISC","CV Raman and Physics at IISc, p. 1","first Indian Director","historical_context","HISTORICAL_FACT","Raman became the first Indian Director of the Indian Institute of Science in 1933."],
  ["IISC","CV Raman and Physics at IISc, p. 1","Department of Physics","institutions","HISTORICAL_FACT","Raman established IISc's Department of Physics in 1933."],
  ["IISC","CV Raman and Physics at IISc, p. 1","His students","mentorship","HISTORICAL_FACT","G. N. Ramachandran, S. Ramaseshan, and Vikram Sarabhai were among Raman's students at IISc."],
  ["IISC","CV Raman and Physics at IISc, p. 1","invited Max Born","institutions","HISTORICAL_FACT","Raman invited Max Born to IISc as a Reader in Theoretical Physics in 1935."],

  ["IACS","Singh 2008, abstract, p. 969","his student K S Krishnan","mentorship","SCHOLARLY_ATTRIBUTION","Historian Rajinder Singh identifies K. S. Krishnan as Raman's student and collaborator in the 1928 discovery."],
  ["IACS","Singh 2008, abstract, p. 969","Russian physicists","contested","SCHOLARLY_ATTRIBUTION","Singh notes that Landsberg and Mandelstam observed a similar effect independently around the same time."],
  ["IACS","Singh 2008, abstract, p. 969","awarded to C V Raman alone","contested","SCHOLARLY_ATTRIBUTION","Singh notes that the 1930 Physics Nobel Prize went to Raman alone despite other contributors and parallel observers."],
  ["IACS","Singh 2008, abstract, p. 969","Krishnan’s diary","contested","SCHOLARLY_ATTRIBUTION","Singh used Krishnan's diary to examine Krishnan's part in the discovery."],
  ["IACS","Singh 2008, abstract, p. 969","well thought step","research_methods","SCHOLARLY_ATTRIBUTION","Singh argues that Raman's use of a mercury vapor lamp was deliberate rather than accidental."],
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
  const people = await rows("personalities", "id,canonical_name", (q) => q.eq("canonical_name", "C. V. Raman"));
  const person = people[0];
  if (!person) throw new Error("Apply the scientist framework and Raman identity migration first.");
  const fields = await rows("parameter_fields", "id,code,parameters!inner(categories!inner(slug))", (q) => q.eq("parameters.categories.slug", "scientist"));
  const fieldIds = new Map(fields.map((field) => [field.code, field.id]));
  const existingSources = await rows("sources", "id,url", (q) => q.in("url", sources.map((source) => source.url)));
  const sourceIds = new Map(existingSources.map((source) => [source.url, source.id]));
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
        publisher_or_institution: source.publisher, source_type: source.type, url: source.url,
        citation: `${source.author ? `${source.author}. ` : ""}${source.title}. ${source.publisher}. ${source.url}`,
        source_status: "approved", approval_origin: "ai_candidate", approval_note: "Original source and every cited passage anchor checked; source record is editable through Resources review workflow.",
        ingestion_status: "ready", textual_layer: source.layer, rights_or_access_note: "Public source; short research excerpts only.",
        metadata: { raman_corpus: true, verified_at: new Date().toISOString() } }).select("id").single());
      sourceId = inserted.id; sourceIds.set(source.url, sourceId); createdSources++;
    }
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
          content_hash: hash, token_estimate: Math.ceil(passage.length / 4), metadata: { raman_corpus: true } }).select("id").single());
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
          certainty: claim[4] === "SCHOLARLY_ATTRIBUTION" ? "medium" : "high", review_status: "draft",
          approval_origin: "ai_candidate", evidence_type: claim[4] === "HISTORICAL_FACT" ? "uncertain" : "scholarly_interpretation",
          researcher_notes: `Raman starter corpus; ${source.key}; ${claim[1]}. Evidence and epistemic type require human review.` }).select("id").single());
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
        type_review_status: "needs_type_review", classifier_version: "raman-source-curation/1",
        contract_status: "NEEDS_TYPE_REVIEW", contract_satisfied: false, contract_version: "evidence-contracts/1",
        contract_detail: { reason: "Human review required before claim approval", source: source.url, locator: claim[1] }
      }, { onConflict: "claim_id" }));
    }
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", sources: sources.length, claims: claims.length,
    createdSources, createdClaims, createdPassages }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
