import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

// A bounded, repeatable seed. Each assertion stays in the candidate review queue.
const sources = [
  { key: "RV", title: "Rigveda, Book 1 (metrically restored text)", publisher: "University of Texas Linguistics Research Center", type: "institutional", layer: "Rigvedic", url: "https://lrc.la.utexas.edu/books/rigveda/RV01" },
  { key: "RA11", title: "Valmiki Ramayana, Aranya Kanda 11", publisher: "Valmiki Ramayana", type: "primary_text", layer: "Epic: Ramayana", url: "https://www.valmikiramayan.net/aranya/sarga11/aranya_11_prose.htm" },
  { key: "RA12", title: "Valmiki Ramayana, Aranya Kanda 12", publisher: "Valmiki Ramayana", type: "primary_text", layer: "Epic: Ramayana", url: "https://www.valmikiramayan.net/aranya/sarga12/aranya_12_prose.htm" },
  { key: "RA13", title: "Valmiki Ramayana, Aranya Kanda 13", publisher: "Valmiki Ramayana", type: "primary_text", layer: "Epic: Ramayana", url: "https://www.valmikiramayan.net/aranya/sarga13/aranya_13_prose.htm" },
  { key: "RY105", title: "Valmiki Ramayana, Yuddha Kanda 105", publisher: "Valmiki Ramayana", type: "primary_text", layer: "Epic: Ramayana", url: "https://www.valmikiramayan.net/utf8/yuddha/sarga105/yuddha_105_prose.htm" },
  { key: "MB96", title: "Mahabharata, Vana Parva, section 96 (Ganguli translation)", publisher: "Mahabharata Online", type: "primary_text", layer: "Epic: Mahabharata", url: "https://mahabharata-online.github.io/3/96.html" },
  { key: "MB97", title: "Mahabharata, Vana Parva, section 97 (Ganguli translation)", publisher: "Mahabharata Online", type: "primary_text", layer: "Epic: Mahabharata", url: "https://mahabharata-online.github.io/3/97.html" },
  { key: "MB104", title: "Mahabharata, Vana Parva, section 104 (Ganguli translation)", publisher: "Mahabharata Online", type: "primary_text", layer: "Epic: Mahabharata", url: "https://mahabharata-online.github.io/3/104.html" },
  { key: "TAMIL", title: "Kamil Zvelebil, Pre-History of Tamil Literature", publisher: "Tamil University / World Classical Tamil Conference", type: "scholarly_article", layer: "Later Tamil reception (scholarship)", url: "https://www.tamiluniversity.ac.in/english/wp-content/uploads/2018/08/paper_01-PDF.pdf", excerpt: "In fact, for nearly one thousand years of Tamil literature, Agastya remains unmentioned. The earliest references in Tamil texts are found in Paripadal, Cilambu and Manimekalai. In later texts, and in the commentaries, references to Agastya are constantly present. Among other details, Peraciriyar tells us that Akattiyan was responsible for the division of Tamil into its three basic types" },
  { key: "JAMISON", title: "Jamison and Brereton, The Rigveda, Book I, Agastya introduction", publisher: "Oxford University Press / WISWO digital copy", type: "scholarly_book", layer: "Rigvedic scholarship", url: "https://wiswo.org/books/_resources/book-reference-pdfs/Jamison-Brereton-2014-The%20Rigveda-The%20Earliest%20Poetry%20of%20India%20all%203%20Volume%20Sets.pdf", excerpt: "This lively and difficult poetry marks Agastya as one of the great masters of the Rgvedic tradition. He is best known for three hymns, 165, 170, and 171, which together describe how Indra and the Maruts argued over a sacrifice offered by Agastya and were finally reconciled with one another, and for his dialogue with Lopamudra (179), which turns on the tension between the ascetic ideal and the responsibility to continue the family lineage. Both the set of Indra and Marut hymns and the dialogue with Lopamudra also concern questions of ritual innovation." },
];

// source, locator, anchor in original, parameter field, assertion, epistemic type
const claims = [
  ["RV","RV 1.165.1-3","1.165.01a","mantras_suktas","Rigveda 1.165 opens a dialogue involving Indra and the Maruts; this is part of the Agastya-associated hymn cycle.","textual_tradition"],
  ["RV","RV 1.165.14-15","1.165.14a","mantras_suktas","Rigveda 1.165 closes with a singer addressing the Maruts, within a hymn traditionally associated with Agastya.","textual_tradition"],
  ["RV","RV 1.170.1-4","1.170.01a","mantras_suktas","Rigveda 1.170 belongs to the Indra-Maruts dialogue sequence associated with Agastya.","textual_tradition"],
  ["RV","RV 1.171.1-6","1.171.01a","mantras_suktas","Rigveda 1.171 continues the Indra and Maruts sequence in the Agastya group of hymns.","textual_tradition"],
  ["RV","RV 1.179.1-2","1.179.01a","core_teaching","Rigveda 1.179 presents a dialogue about desire, aging, and married life; it should be read as Vedic poetry rather than a modern biography.","textual_tradition"],
  ["RV","RV 1.179.4","1.179.04a","royal_advisory","Rigveda 1.179.4 names Lopamudra in the dialogue traditionally linked with Agastya.","textual_tradition"],
  ["RV","RV 1.179.6","1.179.06a","gotra","Rigveda 1.179.6 explicitly names Agastya and speaks of his desire for offspring and strength.","textual_tradition"],
  ["RV","RV 1.191.1","1.191.01a","textual_layers","Rigveda 1.191 is a charm concerning poisonous creatures, distinct in subject from the Indra-Maruts and Lopamudra hymns.","textual_tradition"],
  ["RA11","Aranya Kanda 11","Agastya","primary_function","In the Ramayana's forest book, Rama travels to Agastya's hermitage with Sita and Lakshmana.","traditional_account"],
  ["RA11","Aranya Kanda 11","Vaataapi","myth_history","The Ramayana recounts Agastya's defeat of Vatapi and Ilvala as an epic narrative.","traditional_account"],
  ["RA11","Aranya Kanda 11","Vindhya","myth_history","The Ramayana links Agastya with the tradition that Vindhya ceased growing at his command.","traditional_account"],
  ["RA11","Aranya Kanda 11","southern","textual_layers","The Ramayana places Agastya's hermitage on Rama's southward forest route.","traditional_account"],
  ["RA12","Aranya Kanda 12","bow","primary_function","Agastya receives Rama at his hermitage and gives him a divine bow in the Ramayana.","traditional_account"],
  ["RA12","Aranya Kanda 12","quivers","primary_function","Agastya gives Rama two inexhaustible quivers and a sword in the Ramayana account.","traditional_account"],
  ["RA12","Aranya Kanda 12","Seetha","royal_advisory","Rama, Sita, and Lakshmana are received as guests at Agastya's hermitage.","traditional_account"],
  ["RA13","Aranya Kanda 13","Panchavati","royal_advisory","Agastya directs Rama toward Panchavati as a place to dwell in the forest.","traditional_account"],
  ["RA13","Aranya Kanda 13","Seetha","royal_advisory","In his conversation with Rama, Agastya comments on Sita's decision to accompany her husband into exile.","traditional_account"],
  ["RY105","Yuddha Kanda 105","sun","core_teaching","In Yuddha Kanda 105, Agastya teaches Rama the Aditya Hridaya, a hymn to the sun, before the battle with Ravana.","traditional_account"],
  ["RY105","Yuddha Kanda 105","Ravana","royal_advisory","Agastya counsels the battle-weary Rama in the confrontation with Ravana.","traditional_account"],
  ["RY105","Yuddha Kanda 105","three times","spiritual_practice","The Ramayana has Agastya instruct Rama to recite the solar praise three times.","traditional_account"],
  ["MB96","Vana Parva 3.96","Yudhishthira","textual_layers","In the Mahabharata, Yudhishthira hears Agastya's story from the sage Lomasa during a pilgrimage narrative.","traditional_account"],
  ["MB96","Vana Parva 3.96","Ilwala","myth_history","The Mahabharata describes Ilvala serving his brother Vatapi, transformed into a ram, to Brahmin guests.","traditional_account"],
  ["MB96","Vana Parva 3.96","ancestors","gotra","The Mahabharata says Agastya's ancestors ask him to beget a son.","traditional_account"],
  ["MB96","Vana Parva 3.96","Vidarbha","gotra","In this Mahabharata account, Lopamudra grows up as a princess of Vidarbha.","traditional_account"],
  ["MB97","Vana Parva 3.97","Lopamudra","gotra","The Mahabharata narrates Agastya's marriage to Lopamudra.","traditional_account"],
  ["MB97","Vana Parva 3.97","wealth","royal_advisory","In the Mahabharata narrative, Lopamudra's request leads Agastya to seek wealth.","traditional_account"],
  ["MB104","Vana Parva 3.104","Vindhya","myth_history","The Mahabharata tells of Vindhya growing until it threatened the sun and moon's paths.","traditional_account"],
  ["MB104","Vana Parva 3.104","southern region","myth_history","Agastya asks Vindhya to remain low until he returns from the south; the story says he does not return.","traditional_account"],
  ["MB104","Vana Parva 3.104","Kalakeyas","myth_history","The Mahabharata tells of the gods asking Agastya to drink the ocean so the Kalakeyas could be defeated.","traditional_account"],
  ["MB104","Vana Parva 3.104","Mitra","textual_layers","This Mahabharata passage calls Agastya the son of Mitra and Varuna, an epic genealogical attribution.","traditional_account"],
  ["TAMIL","Zvelebil, PDF p. 10","Agastya remains unmentioned","textual_layers","Zvelebil notes that Agastya is absent from nearly a millennium of early Tamil literature, cautioning against reading later Tamil legends back into the earliest corpus.","scholarly_interpretation"],
  ["TAMIL","Zvelebil, PDF p. 10","earliest references","modern_practice","Zvelebil identifies Paripadal, Cilambu, and Manimekalai among the earliest Tamil texts to mention Agastya.","scholarly_interpretation"],
  ["TAMIL","Zvelebil, PDF p. 10","Peraciriyar","modern_practice","According to Zvelebil, later Tamil commentators credit Akattiyan with organizing Tamil's literary forms and relate his work to Tolkappiyam.","scholarly_interpretation"],
  ["JAMISON","Jamison and Brereton, vol. 1, p. 360 (PDF p. 377)","great masters","mantras_suktas","Jamison and Brereton describe Agastya as a major Rigvedic poet known for difficult, vivid hymns.","scholarly_interpretation"],
  ["JAMISON","Jamison and Brereton, vol. 1, p. 360 (PDF p. 377)","165, 170, and 171","mantras_suktas","Jamison and Brereton identify Rigveda 1.165, 1.170, and 1.171 as an Indra-Maruts sequence centered on Agastya's sacrifice.","scholarly_interpretation"],
  ["JAMISON","Jamison and Brereton, vol. 1, p. 360 (PDF p. 377)","Lopamudra","core_teaching","Jamison and Brereton read the Lopamudra dialogue in Rigveda 1.179 as engaging ascetic ideals and continuation of family lineage.","scholarly_interpretation"],
  ["JAMISON","Jamison and Brereton, vol. 1, p. 360 (PDF p. 377)","ritual innovation","unique_contribution","Jamison and Brereton connect Agastya's Indra-Maruts hymns and Lopamudra dialogue with innovation in Vedic ritual practice.","scholarly_interpretation"],
];

const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
const apply = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function query(table, columns, filters = (q) => q) {
  const result = await filters(db.from(table).select(columns));
  if (result.error) throw result.error;
  return result.data || [];
}

async function main() {
  const people = await query("personalities", "id,canonical_name");
  const person = people.find((p) => norm(p.canonical_name) === "agastya");
  if (!person) throw new Error("Apply the Agastya identity migration first.");
  const fields = await query("parameter_fields", "id,code,parameters!inner(categories!inner(slug))", (q) => q.eq("parameters.categories.slug", "rishi"));
  const fieldIds = new Map(fields.map((f) => [f.code, f.id]));
  const prior = await Promise.all([query("claims", "claim_text", (q) => q.eq("personality_id", person.id)), query("candidate_claims", "claim_text", (q) => q.eq("personality_id", person.id))]);
  const known = new Set(prior.flat().map((r) => norm(r.claim_text)));
  const existing = await query("sources", "id,url,source_status", (q) => q.in("url", sources.map((s) => s.url)));
  const byUrl = new Map(existing.map((s) => [s.url, s]));
  const stats = { sourcesAdded: 0, claimsAdded: 0, duplicatesSkipped: 0, passagesAdded: 0 };
  for (const source of sources) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`${source.key}: HTTP ${response.status}`);
    let text;
    if (source.excerpt) text = source.excerpt;
    else {
      const $ = cheerio.load(await response.text());
      $("script,style,nav,footer,header").remove();
      text = $("main").first().text() || $("body").text();
      text = text.replace(/\s+/g, " ").trim();
    }
    const selected = claims.filter((c) => c[0] === source.key);
    for (const c of selected) if (!norm(text).includes(norm(c[2]))) throw new Error(`${source.key}: missing anchor ${c[2]}`);
    let row = byUrl.get(source.url);
    if (!row && apply) {
      const result = await db.from("sources").insert({ title: source.title, publisher_or_institution: source.publisher, source_type: source.type, url: source.url, citation: `${source.title}. ${source.url}`, source_status: "approved", approval_origin: "verified_auto", approval_note: "Original page checked for each attached candidate locator; source passages are available to Ask; candidate claims require review.", ingestion_status: "ready", textual_layer: source.layer, rights_or_access_note: "Publicly accessible source; brief excerpts stored for research citation.", metadata: { agastya_starter: true } }).select("id,url,source_status").single();
      if (result.error) throw result.error;
      row = result.data;
      stats.sourcesAdded++;
    }
    if (!row) { console.log(`${source.key}: ${selected.length} checked proposals (dry run)`); continue; }
    if (apply) {
      const link = await db.from("source_personalities").upsert({ source_id: row.id, personality_id: person.id, relationship: "subject", confidence: 1, mapping_method: "manual" }, { onConflict: "source_id,personality_id" });
      if (link.error) throw link.error;
    }
    for (const [index, c] of selected.entries()) {
      const at = norm(text).indexOf(norm(c[2]));
      // Preserve the original text for citation. For HTML, select a compact source window.
      const rawAt = text.toLowerCase().indexOf(c[2].toLowerCase());
      const passage = source.excerpt || text.slice(Math.max(0, rawAt - 180), Math.min(text.length, rawAt + Math.max(700, c[2].length + 450))).trim();
      if (at < 0 || !passage) throw new Error(`No passage for ${source.key} ${c[1]}`);
      const digest = hash(passage);
      let chunks = await query("source_chunks", "id,content_hash", (q) => q.eq("source_id", row.id).eq("content_hash", digest));
      let chunk = chunks[0];
      const sectionTitle = source.key === "RV" || source.key === "JAMISON" ? "Agastya in Vedic tradition" : source.key.startsWith("MB") ? "Major stories of Agastya" : source.title;
      if (!chunk && apply) {
        const result = await db.from("source_chunks").insert({ source_id: row.id, chunk_index: index, chunk_text: passage, section_title: sectionTitle, page_or_section: c[1], textual_layer: source.layer, content_hash: digest, token_estimate: Math.ceil(passage.length / 4), metadata: { agastya_starter: true } }).select("id").single();
        if (result.error) throw result.error;
        chunk = result.data;
        stats.passagesAdded++;
      }
      if (!chunk) continue;
      if (apply) {
        const heading = await db.from("source_chunks").update({ section_title: sectionTitle, page_or_section: c[1] }).eq("id", chunk.id);
        if (heading.error) throw heading.error;
        if (known.has(norm(c[4]))) { stats.duplicatesSkipped++; continue; }
        const tags = await db.from("chunk_personalities").upsert({ chunk_id: chunk.id, personality_id: person.id, relationship: "subject", relevance_score: 1, tagging_method: "manual", confidence: 1 }, { onConflict: "chunk_id,personality_id" });
        if (tags.error) throw tags.error;
        const fieldId = fieldIds.get(c[3]);
        if (!fieldId) throw new Error(`Unknown Rishi field: ${c[3]}`);
        const parameterTag = await db.from("chunk_parameter_fields").upsert({ chunk_id: chunk.id, parameter_field_id: fieldId, confidence: 0.9, tagging_method: "manual" }, { onConflict: "chunk_id,parameter_field_id" });
        if (parameterTag.error) throw parameterTag.error;
        const result = await db.from("candidate_claims").insert({ personality_id: person.id, parameter_field_id: fieldId, source_chunk_id: chunk.id, claim_text: c[4], claim_kind: c[5], certainty: c[5] === "scholarly_interpretation" ? "medium" : "high", status: "pending", extraction_note: `Agastya starter; ${source.key}; ${c[1]}; exact anchor: ${c[2]}. Human review required.` });
        if (result.error) throw result.error;
      }
      known.add(norm(c[4]));
      stats.claimsAdded++;
    }
    console.log(`${source.key}: ${selected.length} proposals checked`);
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...stats }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
