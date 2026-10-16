import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const apply = process.argv.includes("--apply");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const checked = (result) => { if (result.error) throw result.error; return result.data; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const entry = (person, title, url, anchor, claim, field, publisher, type = "institutional", layer = "Publisher page") =>
  ({ person, title, url, anchor, claim, field, publisher, type, layer });

const additions = [
  // Original scientific work, institutional archives, and contemporary records.
  entry("C. V. Raman", "A New Radiation (1928)", "https://repository.ias.ac.in/70648/1/36-PUb.pdf", "A NEW RADIATION", "Raman's 1928 paper presented his observations under the title A New Radiation.", "discoveries", "Indian Academy of Sciences repository", "primary_text", "1928 original paper"),
  entry("C. V. Raman", "A New Type of Secondary Radiation (1928)", "https://repository.ias.ac.in/28460/", "A new type of secondary radiation", "Raman and K. S. Krishnan reported a new type of secondary radiation in Nature in 1928.", "discoveries", "Indian Academy of Sciences repository", "primary_text", "1928 original paper record"),
  entry("C. V. Raman", "The Raman Effect: Investigation of Molecular Structure by Light Scattering (1929)", "https://repository.ias.ac.in/50709/1/24_pub.pdf", "Investigation of molecular structure by light scattering", "Raman wrote a 1929 study on using the Raman effect to investigate molecular structure by light scattering.", "discoveries", "Indian Academy of Sciences repository", "primary_text", "1929 original paper"),
  entry("C. V. Raman", "On Some Indian Stringed Instruments (1921)", "https://repository.ias.ac.in/69870/1/69870.pdf", "On some Indian stringed instruments", "Raman studied the acoustics of Indian stringed instruments, including the tanpura and veena.", "discoveries", "Indian Academy of Sciences repository", "primary_text", "1921 original paper"),
  entry("C. V. Raman", "The Indian Musical Drums (1934)", "https://repository.ias.ac.in/50700/", "The Indian musical drums", "Raman published a study of Indian musical drums in 1934.", "discoveries", "Indian Academy of Sciences repository", "primary_text", "1934 original paper record"),
  entry("C. V. Raman", "The Heat Capacity of Diamond Between 0 and 1000 K (1957)", "https://repository.ias.ac.in/69772/", "The heat capacity of diamond", "Raman published a 1957 analysis of diamond's heat capacity over a wide temperature range.", "discoveries", "Indian Academy of Sciences repository", "primary_text", "1957 original paper record"),
  entry("C. V. Raman", "Nobel Nomination Archive: C. V. Raman", "https://www.nobelprize.org/nomination/archive/show_people.php?id=7540&lang=en", "Nominee in 12 nominations", "The Nobel nomination archive lists twelve Physics nominations for Raman in 1929 and 1930.", "historical_context", "NobelPrize.org", "institutional", "Nobel archival record"),
  entry("C. V. Raman", "Royal Society Election Certificate for C. V. Raman", "https://catalogues.royalsociety.org/CalmView/Record.aspx?id=EC%2F1924%2F11&src=CalmView.Catalog", "Raman, Sir Chandrasekhara Venkata", "The Royal Society archive holds Raman's 1924 certificate of election.", "historical_context", "Royal Society archive", "institutional", "1924 archival record"),
  entry("C. V. Raman", "IACS: Raman Effect Discovery Site", "https://www.indiascienceandtechnology.gov.in/organisations/ministry-and-departments/department-science-technology-dst/indian-association", "historic discovery of the 'Raman Effect' at IACS", "The Indian government science portal identifies the Indian Association for the Cultivation of Science as the site of Raman's discovery.", "institutions", "India Science, Technology & Innovation Portal", "institutional", "Government institutional history"),
  entry("C. V. Raman", "Raman's Diamond Research with D. Krishnamurti", "https://wwws.rri.res.in/htmls/library/raman_era/Bios/krishnamurti.html", "worked with Raman investigating", "Raman Research Institute records D. Krishnamurti's work with Raman on diamond vibrational spectra.", "mentorship", "Raman Research Institute", "institutional", "Research group biography"),

  // Separate catalogued manuscripts and contemporary archival records.
  entry("Srinivasa Ramanujan", "Ramanujan's Lost Notebook — Trinity Archive", "https://archives.trin.cam.ac.uk/index.php/the-so-called-lost-notebook-2", "The so-called Lost Notebook", "Trinity College archives a manuscript catalogued as Ramanujan's Lost Notebook.", "impact", "Trinity College Library, Cambridge", "primary_text", "Archival manuscript record"),
  entry("Srinivasa Ramanujan", "Letters from Ramanujan to G. H. Hardy — Trinity Archive", "https://archives.trin.cam.ac.uk/index.php/letters-from-ramanujan-to-g-h-hardy", "Letters from Srinivasa Ramanujan to G. H. Hardy", "Trinity College preserves letters from Ramanujan to G. H. Hardy.", "historical_context", "Trinity College Library, Cambridge", "primary_text", "Archival correspondence record"),
  entry("Srinivasa Ramanujan", "Ramanujan: Properties of p(n) and tau(n) — Trinity Archive", "https://archives.trin.cam.ac.uk/index.php/s-ramanujan-properties-of-p-n-and-n", "Properties of p(n)", "Trinity College catalogues Ramanujan manuscript work on the functions p(n) and tau(n).", "discoveries", "Trinity College Library, Cambridge", "primary_text", "Archival manuscript record"),
  entry("Srinivasa Ramanujan", "Collected Works Correspondence — Trinity Archive", "https://archives.trin.cam.ac.uk/index.php/correspondence-of-g-h-hardy-with-cambridge-university-press-and-others-about-ramanujans-collected-works1916-291-bundle", "Ramanujan’s Collected Works", "Trinity College holds Hardy's correspondence about publication of Ramanujan's Collected Works.", "impact", "Trinity College Library, Cambridge", "primary_text", "Archival publication record"),
  entry("Srinivasa Ramanujan", "Hardy's Letter to Ramanujan on Partition Series — Trinity Archive", "https://archives.trin.cam.ac.uk/index.php/letter-from-g-h-hardy-to-ramanujan-on-summing-partition-series-for-xxxx-2", "partition series", "A Trinity College archival record documents Hardy's letter to Ramanujan concerning partition series.", "discoveries", "Trinity College Library, Cambridge", "primary_text", "Archival correspondence record"),
  entry("Srinivasa Ramanujan", "G. N. Watson's Notes on Ramanujan — Trinity Archive", "https://archives.trin.cam.ac.uk/index.php/notes-on-ramanujan-and-his-work-by-g-n-watson", "Notes on Ramanujan and his work", "Trinity College holds G. N. Watson's notes on Ramanujan and his mathematical work.", "impact", "Trinity College Library, Cambridge", "primary_text", "Archival research note"),
  entry("Srinivasa Ramanujan", "Ramanujan Correspondence and Life Records — Trinity Archive", "https://archives.trin.cam.ac.uk/index.php/correspondence-of-ramanujan-and-miscellaneous-correspondence-relating-to-his-life-and-works", "Correspondence of Ramanujan", "The Trinity archive groups correspondence related to Ramanujan's life and mathematical work.", "historical_context", "Trinity College Library, Cambridge", "primary_text", "Archival correspondence record"),
  entry("Srinivasa Ramanujan", "Ramanujan's 1918 Letter to Eric Neville — Trinity Archive", "https://archives.trin.cam.ac.uk/index.php/letter-from-srinivasa-ramanujan-to-eric-harold-neville-2", "continued fraction", "A 1918 letter from Ramanujan to Eric Neville discusses a continued fraction, according to Trinity's catalog.", "discoveries", "Trinity College Library, Cambridge", "primary_text", "1918 archival letter description"),
  entry("Srinivasa Ramanujan", "Royal Society Election Certificate for Ramanujan", "https://catalogues.royalsociety.org/CalmView/Record.aspx?id=EC%2F1918%2F18&src=CalmView.Catalog", "Ramanujan, Srinivasa Aaiyangar", "The Royal Society archive holds Ramanujan's certificate of election to its Fellowship.", "historical_context", "Royal Society archive", "institutional", "1918 archival record"),
  entry("Srinivasa Ramanujan", "Hardy's London Mathematical Society Obituary of Ramanujan", "https://mathshistory.st-andrews.ac.uk/LMS/ramanujan_lms_obit.pdf", "Ramanujan wrote to me first", "In his London Mathematical Society obituary, Hardy recalled that Ramanujan first wrote to him in January 1913.", "historical_context", "London Mathematical Society via MacTutor", "scholarly_article", "Contemporary obituary"),

  // Distinct chapters and lectures in Vivekananda's collected works.
  entry("Swami Vivekananda", "Karma-Yoga: Freedom", "https://www.ramakrishnavivekananda.info/vivekananda/volume_1/karma-yoga/freedom.htm", "freedom is indeed the goal", "Vivekananda presents freedom as the goal of Karma-Yoga.", "teachings", "Complete Works of Swami Vivekananda", "primary_text", "Collected lecture"),
  entry("Swami Vivekananda", "Karma-Yoga: What Is Duty?", "https://www.ramakrishnavivekananda.info/vivekananda/volume_1/karma-yoga/what_is_duty.htm", "different in different nations", "Vivekananda argues that ideas of duty vary across societies and circumstances.", "teachings", "Complete Works of Swami Vivekananda", "primary_text", "Collected lecture"),
  entry("Swami Vivekananda", "Karma-Yoga: The Ideal", "https://www.ramakrishnavivekananda.info/vivekananda/volume_1/karma-yoga/the_ideal.htm", "unselfish work", "Vivekananda describes Karma-Yoga as a path of unselfish work toward freedom.", "practice", "Complete Works of Swami Vivekananda", "primary_text", "Collected lecture"),
  entry("Swami Vivekananda", "Karma-Yoga: The Secret of Work", "https://www.ramakrishnavivekananda.info/vivekananda/volume_1/karma-yoga/secret_of_work.htm", "secret of work", "Vivekananda connects spiritual discipline with the way work is performed in The Secret of Work.", "practice", "Complete Works of Swami Vivekananda", "primary_text", "Collected lecture"),
  entry("Swami Vivekananda", "Karma-Yoga: Karma in Its Effect on Character", "https://www.ramakrishnavivekananda.info/vivekananda/volume_1/karma-yoga/effect_on_character.htm", "Karma in its effect on character", "Vivekananda treats work and its effect on character as a central Karma-Yoga theme.", "teachings", "Complete Works of Swami Vivekananda", "primary_text", "Collected lecture"),
  entry("Swami Vivekananda", "Karma-Yoga: Each Is Great in His Own Place", "https://www.ramakrishnavivekananda.info/vivekananda/volume_1/karma-yoga/each_is_great.htm", "each is great in his own place", "Vivekananda's Karma-Yoga includes a chapter on the dignity of different roles in life.", "teachings", "Complete Works of Swami Vivekananda", "primary_text", "Collected lecture"),
  entry("Swami Vivekananda", "The Future of India", "https://www.ramakrishnavivekananda.info/vivekananda/volume_3/lectures_from_colombo_to_almora/the_future_of_india.htm", "unification of religion", "Vivekananda called for religious unity in his lecture The Future of India.", "service", "Complete Works of Swami Vivekananda", "primary_text", "Collected lecture"),
  entry("Swami Vivekananda", "Response to Welcome at Chicago", "https://www.ramakrishnavivekananda.info/vivekananda/volume_1/addresses_at_the_parliament/v1_c1_response_to_welcome.htm", "warm and cordial welcome", "Vivekananda's Chicago response opened by acknowledging the Parliament of Religions' welcome.", "context", "Complete Works of Swami Vivekananda", "primary_text", "1893 Parliament address"),

  // Government heritage pages; each is a different site and episode.
  entry("Chhatrapati Shivaji Maharaj", "Pratapgad Fort — Maharashtra Tourism", "https://maharashtratourism.gov.in/fort/pratapgad/", "constructed under the orders of Chhatrapati Shivaji Maharaj", "Maharashtra Tourism attributes Pratapgad's construction to Shivaji's order.", "forts_sea", "Department of Tourism, Government of Maharashtra", "institutional", "Government heritage page"),
  entry("Chhatrapati Shivaji Maharaj", "Rajgad Fort — Maharashtra Tourism", "https://maharashtratourism.gov.in/fort/rajgad/", "capital of the Maratha Empire", "Rajgad served as Shivaji's capital before the move to Raigad, according to Maharashtra Tourism.", "forts_sea", "Department of Tourism, Government of Maharashtra", "institutional", "Government heritage page"),
  entry("Chhatrapati Shivaji Maharaj", "Torna Fort — Maharashtra Tourism", "https://maharashtratourism.gov.in/fort/torna/", "first fort captured", "Maharashtra Tourism identifies Torna as the first fort captured by Shivaji.", "formation", "Department of Tourism, Government of Maharashtra", "institutional", "Government heritage page"),
  entry("Chhatrapati Shivaji Maharaj", "Sindhudurg Fort — Maharashtra Tourism", "https://maharashtratourism.gov.in/fort/sindhudurg/", "commissioned the construction of Sindhudurg Fort", "Maharashtra Tourism says Shivaji commissioned Sindhudurg as a coastal stronghold.", "forts_sea", "Department of Tourism, Government of Maharashtra", "institutional", "Government heritage page"),
  entry("Chhatrapati Shivaji Maharaj", "Panhala Fort — Maharashtra Tourism", "https://maharashtratourism.gov.in/fort/panhala/", "during the reign of Chhatrapati Shivaji Maharaj", "Panhala was a military base associated with Shivaji's reign, according to Maharashtra Tourism.", "forts_sea", "Department of Tourism, Government of Maharashtra", "institutional", "Government heritage page"),
  entry("Chhatrapati Shivaji Maharaj", "Shivneri Fort — Maharashtra Tourism", "https://maharashtratourism.gov.in/fort/shivneri/", "birthplace of Chhatrapati Shivaji Maharaj", "Maharashtra Tourism identifies Shivneri Fort as Shivaji's birthplace.", "context", "Department of Tourism, Government of Maharashtra", "institutional", "Government heritage page"),
  entry("Chhatrapati Shivaji Maharaj", "Purandar Fort — Maharashtra Tourism", "https://maharashtratourism.gov.in/fort/purandar/", "Shivaji Maharaj captured Purandar", "Maharashtra Tourism records Shivaji's capture of Purandar as part of his early expansion.", "formation", "Department of Tourism, Government of Maharashtra", "institutional", "Government heritage page"),
  entry("Chhatrapati Shivaji Maharaj", "Sinhagad Fort — Maharashtra Tourism", "https://maharashtratourism.gov.in/fort/sinhagad/", "mission to reclaim the fort", "Maharashtra Tourism connects Shivaji's campaign to retake Sinhagad with Tanaji Malusare's assault.", "warfare", "Department of Tourism, Government of Maharashtra", "institutional", "Government heritage page"),
  entry("Chhatrapati Shivaji Maharaj", "Vijaydurg Fort — Maharashtra Tourism", "https://maharashtratourism.gov.in/fort/vijaydurg/", "renamed it Vijaydurg", "Maharashtra Tourism says Shivaji renamed the captured fort Vijaydurg and developed it as a naval base.", "forts_sea", "Department of Tourism, Government of Maharashtra", "institutional", "Government heritage page"),
  entry("Chhatrapati Shivaji Maharaj", "Vishalgad Fort — Maharashtra Tourism", "https://maharashtratourism.gov.in/fort/vishalgad/", "Shivaji renamed it Vishalgad", "Maharashtra Tourism reports that Shivaji renamed Khilna as Vishalgad.", "forts_sea", "Department of Tourism, Government of Maharashtra", "institutional", "Government heritage page"),

  // The President's own speech archive, with source-attributed policy positions.
  entry("A. P. J. Abdul Kalam", "All India Radio Address on Science Day (2004)", "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/all-india-radio-address-science-day", "Science ignites the young", "Kalam's 2004 Science Day radio address emphasized science education for young people.", "impact", "President of India", "primary_text", "Presidential speech"),
  entry("A. P. J. Abdul Kalam", "Science Day Address to the Nation (2005)", "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-nation-president-india-science-day-2005", "Can Indian science inspire youth", "Kalam's 2005 Science Day address asked how Indian science could inspire young people.", "impact", "President of India", "primary_text", "Presidential speech"),
  entry("A. P. J. Abdul Kalam", "Technology Day Address (2006)", "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-president-india-technology-day-2006", "Technology Empowers the Nation", "Kalam used his 2006 Technology Day address to argue for technological self-reliance.", "impact", "President of India", "primary_text", "Presidential speech"),
  entry("A. P. J. Abdul Kalam", "Attracting Young People to Careers in Science", "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-inauguration-seminar-attracting-young-people-careers-science", "attracting young people to career in science", "Kalam proposed assured scientific careers and mentorship as ways to attract young people to research.", "mentorship", "President of India", "primary_text", "Presidential speech"),
  entry("A. P. J. Abdul Kalam", "India–EU Science Icons and Students", "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/interaction-meet-eu-and-indian-science-icons-indian-students-india-eu", "Science is the foundation for societal transformation", "Kalam linked scientific work with social and economic transformation in an India–EU student address.", "impact", "President of India", "primary_text", "Presidential speech"),
  entry("A. P. J. Abdul Kalam", "Vision 2026 and Science Communication", "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-inauguration-national-conference-vision-2026-challenges-science", "Missions for Science Communication", "Kalam proposed science museums and communication programs as ways to strengthen scientific learning.", "impact", "President of India", "primary_text", "Presidential speech"),
  entry("A. P. J. Abdul Kalam", "Address at the Summit of the Powerless", "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/addresss-summit-powerless-new-delhi", "physical connectivity", "Kalam described PURA as linking transport, electronic, knowledge, and economic connectivity in village clusters.", "impact", "President of India", "primary_text", "Presidential speech"),
  entry("A. P. J. Abdul Kalam", "Cultural Harmony and Peace Summit Address", "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-international-summit-towards-cultural-harmony-and-peace", "India Vision 2020", "Kalam linked his India Vision 2020 program with social development and cultural harmony.", "impact", "President of India", "primary_text", "Presidential speech"),
  entry("A. P. J. Abdul Kalam", "Conference on Moral Values in Education", "https://presidentofindia.nic.in/dr-apj-abdul-kalam/speeches/address-conference-moral-values-education", "Moral Values in Education", "Kalam discussed moral values as part of his approach to education and national development.", "mentorship", "President of India", "primary_text", "Presidential speech"),
];

for (const n of [166, 167, 168, 169, 171, 172, 173, 174, 175, 176]) additions.push(entry(
  "Agastya", `Rigveda 1.${n}: Agastya hymn`,
  `https://vedicheritage.gov.in/samhitas/rigveda/shakala-samhita/rigveda-shakala-samhitas-mandal-01-sukta-${n}/`,
  "अगस्त्य", `The Vedic Heritage Portal attributes Rigveda 1.${n} to the seer Agastya Maitravaruni.`,
  "mantras_suktas", "Vedic Heritage Portal, Government of India", "primary_text", `Rigveda 1.${n}`,
));

const vasisthaToReview = [53, 89, 70, 100, 104, 15, 16, 17, 18, 34];

async function pageText(url) {
  const cache = path.join(".corpus-cache", "twenty-source-verification", `${sha(url)}.txt`);
  if (fs.existsSync(cache)) return fs.readFileSync(cache, "utf8");
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (DCF source verification)" }, signal: AbortSignal.timeout(45000) }); }
    catch (error) { if (attempt === 2) throw error; await sleep(500); continue; }
    if (response.ok) break;
    if (![429, 502, 503, 504].includes(response.status) || attempt === 2) throw new Error(`${url}: HTTP ${response.status}`);
    await sleep(600);
  }
  let text;
  if (url.toLowerCase().split(/[?#]/)[0].endsWith(".pdf") || /application\/pdf/i.test(response.headers.get("content-type") || "")) {
    const parser = new PDFParse({ data: Buffer.from(await response.arrayBuffer()) });
    try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
  } else {
    const $ = cheerio.load(await response.text());
    $("script,style,nav,footer,header,aside").remove();
    text = [$("main").first().text(), $("article").first().text(), $("body").text()].map((part) => part.replace(/\s+/g, " ").trim()).find(Boolean) || "";
  }
  text = text.replace(/\s+/g, " ").trim();
  if (text.length < 200) throw new Error(`${url}: no substantial readable text`);
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, text);
  return text;
}

async function allRows(table, columns) {
  const output = [];
  for (let start = 0;; start += 500) {
    const page = checked(await db.from(table).select(columns).range(start, start + 499));
    output.push(...page);
    if (page.length < 500) return output;
  }
}

async function main() {
  const [people, fields, sources, links, claims] = await Promise.all([
    allRows("personalities", "id,canonical_name,categories(slug)"),
    allRows("parameter_fields", "id,code,parameters!inner(categories!inner(slug))"),
    allRows("sources", "id,title,url,source_status"),
    allRows("source_personalities", "source_id,personality_id"),
    allRows("claims", "id,personality_id,claim_text,review_status"),
  ]);
  const personMap = new Map(people.map((person) => [person.canonical_name, person]));
  const urls = new Set();
  for (const item of additions) {
    if (urls.has(item.url)) throw new Error(`Duplicate proposed URL: ${item.url}`);
    urls.add(item.url);
    const person = personMap.get(item.person);
    if (!person) throw new Error(`Missing person: ${item.person}`);
    item.personId = person.id;
    item.fieldId = fields.find((field) => field.code === item.field && field.parameters?.categories?.slug === person.categories?.[0]?.slug)?.id;
    if (!item.fieldId) throw new Error(`Missing field: ${item.person}/${item.field}`);
    const old = sources.find((source) => source.url === item.url);
    if (old?.source_status === "rejected") throw new Error(`Proposed URL is rejected: ${item.url}`);
  }
  const errors = [];
  let cursor = 0;
  async function worker() {
    while (cursor < additions.length) {
      const item = additions[cursor++];
      try {
        const text = await pageText(item.url);
        const at = text.toLowerCase().indexOf(item.anchor.toLowerCase());
        if (at < 0) throw new Error(`Anchor not found: ${item.anchor}`);
        if (item.person === "Agastya") {
          const marker = text.toLowerCase().indexOf(`sukta ${item.layer.split(".")[1]}`);
          if (marker < 0 || !text.slice(marker, marker + 350).includes("अगस्त्य")) throw new Error("Hymn-specific Agastya metadata not found");
        }
        item.excerpt = text.slice(Math.max(0, at - 140), Math.min(text.length, at + Math.max(item.anchor.length, 30) + 330)).trim();
        console.log(`Verified ${item.person}: ${item.title}`);
      } catch (error) { errors.push(`${item.title}: ${error.message}`); }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));
  const vasistha = personMap.get("Vasistha");
  const verifiedVasistha = [];
  for (const n of vasisthaToReview) {
    const source = sources.find((row) => row.source_status !== "rejected" && row.title?.includes(`Sukta ${String(n).padStart(3, "0")}`) && links.some((link) => link.source_id === row.id && link.personality_id === vasistha.id));
    if (!source) { errors.push(`Vasistha 7.${n}: candidate not linked`); continue; }
    try {
      const text = await pageText(source.url);
      const marker = text.toLowerCase().indexOf(`sukta ${String(n).padStart(3, "0")}`);
      if (marker < 0 || !text.slice(marker, marker + 350).includes("वसिष्ठ")) throw new Error("Hymn-specific Vasistha metadata not found");
      verifiedVasistha.push(source);
      console.log(`Verified Vasistha: ${source.title}`);
    } catch (error) { errors.push(`${source.title}: ${error.message}`); }
  }
  if (errors.length) throw new Error(`Verification failed before any write:\n${errors.join("\n")}`);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", additions: additions.length,
    byPerson: Object.fromEntries([...new Set(additions.map((item) => item.person))].map((name) => [name, additions.filter((item) => item.person === name).length])),
    vasisthaPromotions: verifiedVasistha.length }, null, 2));
  if (!apply) return;

  for (const [index, item] of additions.entries()) {
    let source = sources.find((row) => row.url === item.url);
    if (!source) source = checked(await db.from("sources").insert({ title: item.title, author: null,
      publisher_or_institution: item.publisher, source_type: item.type, url: item.url,
      citation: `${item.title}. ${item.publisher}. ${item.url}`, textual_layer: item.layer,
      source_status: "approved", approval_origin: "ai_candidate", approval_note: "Publisher page and cited passage checked on 2026-10-10; individual claims require review.",
      ingestion_status: "ready", rights_or_access_note: "Original publisher page is linked; research excerpt stored below.",
      metadata: { twenty_source_enrichment: true, verified_at: new Date().toISOString() },
    }).select("id").single());
    checked(await db.from("source_personalities").upsert({ source_id: source.id, personality_id: item.personId,
      relationship: "subject", confidence: 1, mapping_method: "manual" }, { onConflict: "source_id,personality_id" }));
    let chunk = checked(await db.from("source_chunks").select("id").eq("source_id", source.id).eq("content_hash", sha(item.excerpt)).maybeSingle());
    if (!chunk) chunk = checked(await db.from("source_chunks").insert({ source_id: source.id, chunk_index: 2000 + index,
      chunk_text: item.excerpt, content_hash: sha(item.excerpt), token_estimate: Math.ceil(item.excerpt.length / 4),
      section_title: item.title, page_or_section: item.layer, textual_layer: item.layer,
      metadata: { twenty_source_enrichment: true, anchor: item.anchor },
    }).select("id").single());
    checked(await db.from("chunk_personalities").upsert({ chunk_id: chunk.id, personality_id: item.personId,
      relationship: "subject", relevance_score: 1, tagging_method: "manual", confidence: 1 }, { onConflict: "chunk_id,personality_id" }));
    checked(await db.from("chunk_parameter_fields").upsert({ chunk_id: chunk.id, parameter_field_id: item.fieldId,
      confidence: 0.95, tagging_method: "manual" }, { onConflict: "chunk_id,parameter_field_id" }));
    let claim = claims.find((row) => row.personality_id === item.personId && row.claim_text === item.claim);
    if (!claim) claim = checked(await db.from("claims").insert({ personality_id: item.personId, parameter_field_id: item.fieldId,
      claim_text: item.claim, claim_kind: item.person === "Agastya" ? "textual_tradition" : "scholarly_interpretation",
      certainty: "medium", review_status: "needs_review", approval_origin: "ai_candidate",
      evidence_type: item.type === "primary_text" ? "direct_primary_text" : "historical_inference",
      researcher_notes: `Publisher anchor verified: ${item.anchor}. Human review remains required.`,
    }).select("id").single());
    const priorEvidence = checked(await db.from("claim_sources").select("id").eq("claim_id", claim.id).eq("source_id", source.id).maybeSingle());
    if (!priorEvidence) checked(await db.from("claim_sources").insert({ claim_id: claim.id, source_id: source.id,
      relationship: "supports", evidence_excerpt: item.excerpt, page_or_section: item.layer,
      notes: `Original anchor: ${item.anchor}` }));
    checked(await db.from("claim_chunks").upsert({ claim_id: claim.id, chunk_id: chunk.id, relationship: "supports" }, { onConflict: "claim_id,chunk_id" }));
    console.log(`Added ${item.person}: ${item.title}`);
  }
  for (const source of verifiedVasistha.filter((row) => row.source_status === "candidate")) {
    checked(await db.from("sources").update({ source_status: "approved", approval_origin: "ai_candidate",
      approval_note: "Original Vedic Heritage hymn and Vasistha attribution checked on 2026-10-10; linked claims still require review."
    }).eq("id", source.id).select("id").single());
  }
  const [finalSources, finalLinks, finalClaims] = await Promise.all([
    allRows("sources", "id,source_status"), allRows("source_personalities", "source_id,personality_id"), allRows("claims", "personality_id,review_status"),
  ]);
  const rows = people.filter((person) => finalLinks.some((link) => link.personality_id === person.id)).map((person) => ({
    person: person.canonical_name,
    approvedSources: finalLinks.filter((link) => link.personality_id === person.id && finalSources.find((source) => source.id === link.source_id)?.source_status === "approved").length,
    currentClaims: finalClaims.filter((claim) => claim.personality_id === person.id && claim.review_status !== "rejected").length,
  }));
  console.log(JSON.stringify(rows, null, 2));
  if (rows.some((row) => row.approvedSources < 20 || row.currentClaims < 20)) throw new Error("At least one person is below the 20/20 minimum after enrichment.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
