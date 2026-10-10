import fs from "node:fs";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

// Each anchor is checked against the live institutional source before writing.
// Claims remain drafts until a human reviews their evidence and epistemic type.
const sources = [
  { key: "PROFILE", title: "Dr. A.P.J. Abdul Kalam: Profile", publisher: "President of India", type: "institutional", layer: "Official biographical profile", url: "https://presidentofindia.nic.in/dr-apj-abdul-kalam-profile" },
  { key: "SLV", title: "Satellite Launch Vehicle-3", publisher: "Indian Space Research Organisation", type: "institutional", layer: "ISRO mission history", url: "https://www.isro.gov.in/SLV.html" },
  { key: "DRDO", title: "Cabinet condoles death of former President Dr. A. P. J. Abdul Kalam", publisher: "Press Information Bureau, Government of India", year: 2015, type: "institutional", layer: "Government career record", url: "https://www.pib.gov.in/newsite/PrintRelease.aspx?lang=2&reg=48&relid=123859" },
  { key: "EARLY", title: "Address at St Aloysius College", publisher: "President of India", author: "A. P. J. Abdul Kalam", year: 2003, type: "primary_text", layer: "Kalam's account of his education", url: "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-st-aloysius-college" },
  { key: "CAREER", title: "Questionnaire from a Foreign Journalist", publisher: "President of India", author: "A. P. J. Abdul Kalam", type: "primary_text", layer: "Kalam's retrospective account", url: "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/questionnaire-foreign-journalist" },
  { key: "TEACH", title: "Address to the Nation on Teachers' Day, 2005", publisher: "President of India", author: "A. P. J. Abdul Kalam", year: 2005, type: "primary_text", layer: "Presidential speech", url: "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-nation-teachers-day-2005" },
  { key: "VISION", title: "India 2020: A Vision for the New Millennium", publisher: "President of India; Penguin Books India", author: "A. P. J. Abdul Kalam and Y. S. Rajan", type: "primary_text", layer: "Book preface by the authors", url: "https://www.presidentofindia.gov.in/dr-apj-abdul-kalam/book/2020-vision-new-millennium" },
  { key: "PURA", title: "Address at the National Workshop on Vision 2020 and PURA", publisher: "President of India", author: "A. P. J. Abdul Kalam", type: "primary_text", layer: "Presidential policy speech", url: "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-inauguration-national-workshop-vision-2020-india-pura-and" },
  { key: "RED", title: "Address to the Nation from the Red Fort", publisher: "President of India", author: "A. P. J. Abdul Kalam", year: 2007, type: "primary_text", layer: "Presidential development vision", url: "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-nation-ramparts-red-fort-new-delhi" },
  { key: "POKHRAN", title: "Pokhran-II tests were fully successful: DRDO and DAE scientists", publisher: "Press Information Bureau, Government of India", year: 2009, type: "institutional", layer: "Official response to contested test yields", url: "https://www.pib.gov.in/newsite/PrintRelease.aspx?lang=2&reg=48&relid=52813" },
  { key: "RECALL", title: "Reminiscences of President Mukherjee on Dr. Kalam", publisher: "President of India", author: "Pranab Mukherjee", year: 2015, type: "primary_text", layer: "First-person recollection of a political colleague", url: "https://presidentofindia.nic.in/pranab-mukherjee/press_releases/reminiscences-president-mukherjee-former-president-india-dr-apj" },
];

// source, locator, exact anchor, existing Scientist field, proposed epistemic type, substantive claim.
const claims = [
  ["PROFILE","Profile, early life","Born on 15th October 1931","historical_context","HISTORICAL_FACT","Kalam was born in Rameswaram, Tamil Nadu, in 1931 and trained in aeronautical engineering at Madras Institute of Technology."],
  ["PROFILE","Profile, space programme","Project Director to develop India's first indigenous Satellite Launch Vehicle","scientific_role","HISTORICAL_FACT","As project director, Kalam led development of India's first indigenous satellite launch vehicle, SLV-III, which put Rohini into near-Earth orbit in July 1980."],
  ["PROFILE","Profile, launch vehicles","particularly the PSLV configuration","discoveries","HISTORICAL_FACT","The presidential profile credits Kalam with helping shape the later Indian launch vehicle programme, especially the PSLV configuration."],
  ["PROFILE","Profile, missiles","Chief Executive of Integrated Guided Missile Development Programme","institutions","HISTORICAL_FACT","After his ISRO career, Kalam led DRDO's Integrated Guided Missile Development Programme as its chief executive."],
  ["PROFILE","Profile, national policy","Scientific Advisory Committee to the Cabinet","institutions","HISTORICAL_FACT","Kalam combined technical leadership with national advisory duties, including chairing the Scientific Advisory Committee to the Cabinet."],
  ["PROFILE","Profile, university","Professor, Technology & Societal Transformation at Anna University","mentorship","HISTORICAL_FACT","From November 2001, Kalam pursued teaching and research at Anna University as professor of technology and societal transformation."],
  ["PROFILE","Profile, books","Wings of Fire","impact","HISTORICAL_FACT","His major books include Wings of Fire, India 2020, My Journey, and Ignited Minds, linking personal history with scientific and national-development ideas."],
  ["PROFILE","Profile, recognition","Bharat Ratna (1997)","impact","HISTORICAL_FACT","Kalam received the Padma Bhushan, Padma Vibhushan, and Bharat Ratna, reflecting recognition before his presidency."],
  ["PROFILE","Profile, presidency","11th President of India","historical_context","HISTORICAL_FACT","Kalam served as India's eleventh president from 25 July 2002 to 25 July 2007."],

  ["SLV","SLV-3, design","all solid, four stage vehicle","research_methods","HISTORICAL_FACT","The SLV-3 programme developed a four-stage solid-propellant launch vehicle able to place small payloads in low Earth orbit."],
  ["SLV","SLV-3, first flight","first experimental flight of SLV-3, in August 1979","persistence","HISTORICAL_FACT","The first experimental SLV-3 flight in August 1979 was only partially successful; the programme reached orbit on its next attempt in July 1980."],
  ["SLV","SLV-3, success","Rohini satellite, RS-1, was placed in orbit","discoveries","HISTORICAL_FACT","The July 1980 SLV-3 launch placed Rohini RS-1 in orbit and established an indigenous Indian satellite-launch capability."],
  ["SLV","SLV-3, successors","showed the way to advanced launch vehicle projects","impact","SCHOLARLY_ATTRIBUTION","ISRO presents SLV-3 as a foundation for later ASLV, PSLV, and GSLV projects, rather than as Kalam's achievement alone."],

  ["DRDO","DRDO, tenure","1992-99","institutions","HISTORICAL_FACT","Kalam served as scientific adviser to the defence minister and secretary of defence R&D during 1992–1999."],
  ["DRDO","DRDO, missile leadership","development and operationalisation of AGNI and PRITHVI Missiles","scientific_role","HISTORICAL_FACT","The government's memorial account credits Kalam with leadership in the development and operationalisation of the Agni and Prithvi missile systems."],
  ["DRDO","DRDO, national advisory role","Principal Scientific Advisor","institutions","HISTORICAL_FACT","After the defence R&D role, Kalam was principal scientific adviser to the Government of India from 1999 to 2001."],

  ["EARLY","My education","Schwarts High School","historical_context","SCHOLARLY_ATTRIBUTION","Kalam recalled schooling at Schwartz High School and study at St Joseph's College before his engineering training."],
  ["EARLY","My education","Libraries and what we learn in the laboratories","research_methods","SCHOLARLY_ATTRIBUTION","Kalam described education as learning from teachers, libraries, and laboratories, a view that joined classroom knowledge with practical inquiry."],
  ["EARLY","My education","investment for an assured future","mentorship","SCHOLARLY_ATTRIBUTION","Kalam argued that meaningful education of young people was a central investment in India's future."],

  ["CAREER","Career recollection","couldn't get into Air force as a pilot","persistence","SCHOLARLY_ATTRIBUTION","Kalam recalled missing selection as an Air Force pilot and moving into technical work in aerospace and defence instead."],
  ["CAREER","Career recollection","rockets and missiles","scientific_role","SCHOLARLY_ATTRIBUTION","Kalam described work spanning rockets, target aircraft, hovercraft, missiles, and fighter-aircraft design across ISRO and DRDO."],
  ["CAREER","SLV leadership recollection","Satish Dhawan appointed me as a Project Director","institutions","SCHOLARLY_ATTRIBUTION","Kalam credited Satish Dhawan with appointing him SLV project director and supporting him through its first failed orbital attempt."],
  ["CAREER","SLV leadership recollection","he gave the whole credit to me and my team","qualities","SCHOLARLY_ATTRIBUTION","Kalam used Dhawan's response to SLV failure and success as a model of leaders taking responsibility for setbacks and sharing credit for success."],

  ["TEACH","Teachers' Day 2005","Being a teacher myself","mentorship","SCHOLARLY_ATTRIBUTION","Kalam identified teaching as part of his own vocation while serving as president."],
  ["TEACH","Teachers' Day 2005","six hundred thousands students","mentorship","SCHOLARLY_ATTRIBUTION","In 2005 Kalam said he had interacted with roughly 600,000 students in five years, reflecting the scale of his public education work."],
  ["TEACH","Teachers' Day 2005","cull the relevant knowledge","mentorship","SCHOLARLY_ATTRIBUTION","Kalam argued that schools should teach students how to identify useful knowledge amid rapidly expanding information."],

  ["VISION","India 2020, authorship","APJ Abdul Kalam With YS Rajan","impact","HISTORICAL_FACT","India 2020 was co-authored by Kalam and Y. S. Rajan; its national development vision should not be credited to Kalam alone."],
  ["VISION","India 2020, origins","Technology Information, Forecasting and Assessment Council","institutions","SCHOLARLY_ATTRIBUTION","Kalam and Rajan situated India 2020 in a TIFAC technology-forecasting exercise involving hundreds of experts and wider consultation."],
  ["VISION","India 2020, priorities","health and education for all","qualities","SCHOLARLY_ATTRIBUTION","In India 2020, Kalam and Rajan linked scientific and technological strength with poverty reduction, health, education, and economic opportunity."],
  ["VISION","India 2020, horizon","developed country status by 2020","contested","SCHOLARLY_ATTRIBUTION","The book's 2020 developed-nation horizon was a stated aspiration and proposed mission, not an established forecast or achieved result."],

  ["PURA","PURA workshop","Providing Urban Amenities in Rural Areas","discoveries","SCHOLARLY_ATTRIBUTION","Kalam advocated PURA, or Providing Urban Amenities in Rural Areas, as a development model for village clusters."],
  ["PURA","PURA workshop","three Connectivities - physical, electronic and knowledge","research_methods","SCHOLARLY_ATTRIBUTION","Kalam's PURA proposal joined physical, electronic, and knowledge connectivity to expand rural economic opportunity."],

  ["RED","Red Fort, development priorities","Agriculture and Food processing","qualities","SCHOLARLY_ATTRIBUTION","Kalam's development agenda combined agriculture and food processing, education and healthcare, ICT, infrastructure, and strategic technological self-reliance."],
  ["RED","Red Fort, rural equity","rural and urban divide","qualities","SCHOLARLY_ATTRIBUTION","He envisaged narrowing the rural–urban divide and improving access to water, energy, and education as measures of national development."],
  ["RED","Red Fort, 2020 vision","developed India 2020","contested","SCHOLARLY_ATTRIBUTION","Kalam publicly urged a developed India by 2020; this was a political and social goal whose realization requires separate evaluation."],

  ["POKHRAN","Pokhran-II, contested yields","K. Santhanam","contested","SCHOLARLY_ATTRIBUTION","The yield of the 1998 Pokhran-II thermonuclear test became contested: K. Santhanam challenged its success, while R. Chidambaram and Anil Kakodkar publicly defended the official assessment."],
  ["POKHRAN","Pokhran-II, official response","scientific objectives","contested","SCHOLARLY_ATTRIBUTION","A 2009 government release reported Chidambaram and Kakodkar's position that Pokhran-II achieved its scientific objectives; that official view does not settle the public dispute by itself."],
  ["RECALL","Pokhran-II, political briefing","technical aspects of the tests at Pokhran II","historical_context","SCHOLARLY_ATTRIBUTION","Pranab Mukherjee recalled Kalam briefing Congress leaders on the technical aspects of Pokhran-II after the 1998 tests, evidence of his advisory role rather than sole authorship of the operation."],
  ["RECALL","Presidential reception","people’s President","impact","SCHOLARLY_ATTRIBUTION","Former president Pranab Mukherjee remembered Kalam as a widely loved 'people's President' and emphasized his rapport with children and students."],
  ["RECALL","Later years","last visit, he presented me his book","impact","SCHOLARLY_ATTRIBUTION","Mukherjee recalled that Kalam remained an active writer and interlocutor about books after leaving the presidency."],
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
    const $ = cheerio.load(await response.text());
  $("script,style,nav,footer,header").remove();
  return ($("main").first().text() || $("body").text()).replace(/\s+/g, " ").trim();
}

async function main() {
  if (process.argv.includes("--verify")) {
    for (const source of sources) {
      const sourceBody = await sourceText(source);
      for (const claim of claims.filter((item) => item[0] === source.key)) {
        if (!sourceBody.toLowerCase().includes(claim[2].toLowerCase())) throw new Error(`${source.key}: missing exact anchor: ${claim[2]}`);
      }
      console.log(`${source.key}: verified ${claims.filter((item) => item[0] === source.key).length} anchors`);
    }
    return;
  }
  let people = await rows("personalities", "id,canonical_name", (q) => q.eq("canonical_name", "A. P. J. Abdul Kalam"));
  if (!people[0] && apply) {
    const created = await checked(await db.from("personalities").insert({ canonical_name: "A. P. J. Abdul Kalam",
      alternate_names: ["APJ Abdul Kalam", "Abdul Kalam", "Avul Pakir Jainulabdeen Abdul Kalam"] }).select("id,canonical_name").single());
    people = [created];
  }
  const person = people[0];
  if (!person) throw new Error("Apply the Abdul Kalam identity migration or run with --apply.");
  if (apply) {
    const categories = await rows("categories", "id,slug", (q) => q.in("slug", ["scientist", "political_leader"]));
    for (const category of categories) await checked(await db.from("personality_categories").upsert({
      personality_id: person.id, category_id: category.id, is_primary: category.slug === "scientist"
    }, { onConflict: "personality_id,category_id" }));
    for (const alias of ["A. P. J. Abdul Kalam", "APJ Abdul Kalam", "Dr APJ Abdul Kalam", "Abdul Kalam", "Avul Pakir Jainulabdeen Abdul Kalam"]) {
      if (!(await rows("personality_aliases", "id", (q) => q.eq("personality_id", person.id).ilike("alias", alias))).length)
        await checked(await db.from("personality_aliases").insert({ personality_id: person.id, alias,
          alias_type: alias === "A. P. J. Abdul Kalam" ? "canonical" : "alternate_name", confidence: alias === "Abdul Kalam" ? 0.95 : 1 }));
    }
  }
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
        metadata: { abdul_kalam_corpus: true, verified_at: new Date().toISOString() } }).select("id").single());
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
          content_hash: hash, token_estimate: Math.ceil(passage.length / 4), metadata: { abdul_kalam_corpus: true } }).select("id").single());
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
          researcher_notes: `Abdul Kalam starter corpus; ${source.key}; ${claim[1]}. Evidence and epistemic type require human review.` }).select("id").single());
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
        type_review_status: "needs_type_review", classifier_version: "abdul_kalam-source-curation/1",
        contract_status: "NEEDS_TYPE_REVIEW", contract_satisfied: false, contract_version: "evidence-contracts/1",
        contract_detail: { reason: "Human review required before claim approval", source: source.url, locator: claim[1] }
      }, { onConflict: "claim_id" }));
    }
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", sources: sources.length, claims: claims.length,
    createdSources, createdClaims, createdPassages }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
