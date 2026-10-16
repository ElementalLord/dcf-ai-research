import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] ??= match[2].replace(/^['"]|['"]$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const normalize = (value) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const one = (value) => Array.isArray(value) ? value[0] || null : value || null;
async function checked(result) { if (result.error) throw result.error; return result.data; }

const profiles = [
  {
    name: "Swami Vivekananda",
    gaps: ["identity and public vocation", "works and teachings", "Ramakrishna relationship", "service and institution-building", "competing interpretations"],
    supports: [
      ["Chicago Inter Ocean, September 21, 1893", "Hindoo monk", ["vocation", "context"]],
      ["Swami Vivekananda", "Parliament of Religions", ["vocation", "works", "context"]],
      ["Swami Vivekananda", "founded on 1 May 1897", ["vocation", "service", "context"]],
      ["My Master", "I owe it to my Master", ["lineage", "teachings"]],
      ["Vivekananda: Cosmopolitan Vedantic Philosopher?", "two prevailing interpretations", ["teachings", "complexity", "context"]],
      ["Paper on Hinduism", "Hinduism", ["works", "teachings"]],
      ["Raja Yoga: Introductory", "knowledge is based upon experience", ["works", "practice", "teachings"]],
      ["Practical Vedanta, Part I", "Vedanta", ["works", "teachings", "service"]],
    ],
    claims: [
      ["The evidence supports describing Vivekananda as a Hindu monk and public Vedanta teacher whose international speaking, Ramakrishna lineage, and institution-building were distinct but connected parts of his vocation.", "vocation", [0, 1, 2, 3]],
      ["Vivekananda explicitly credited Ramakrishna for his spiritual teaching, while later scholars debate whether his philosophy is best read as classical Advaita, neo-Vedanta, or a more original synthesis.", "complexity", [3, 4]],
    ],
  },
  {
    name: "Adi Shankaracharya",
    gaps: ["secure chronology", "core Advaita teaching", "works and commentarial tradition", "practice and liberation", "hagiography versus history"],
    supports: [
      ["Sankara", "flourished during the eighth century CE", ["vocation", "context", "teachings"]],
      ["Sankara", "There are no dependable historical records", ["vocation", "context", "complexity"]],
      ["Sankara", "Hagiographical accounts", ["vocation", "context", "complexity"]],
      ["The Upaniṣads", "atman and brahman are one and the same", ["teachings", "works"]],
      ["The Upaniṣads", "three main branches", ["works", "context", "teachings"]],
      ["Advaita Vedanta", "Knowledge of Brahman alone", ["practice", "teachings"]],
      ["Advaita Vedanta", "fourfold", ["practice", "teachings"]],
      ["Bhagavadgita Sankarabhasya", "Shankara", ["works", "teachings"]],
    ],
    claims: [
      ["Shankara is securely described as an influential early Advaita Vedanta philosopher, commonly placed in the eighth century, while exact dates and most biographical details remain disputed.", "vocation", [0, 1, 2]],
      ["Shankara's documented significance lies in a systematic nondual interpretation of the Upanishads and in a teaching path centered on liberating knowledge; received commentarial attributions and later hagiography require separate assessment.", "teachings", [3, 4, 5, 7]],
    ],
  },
  {
    name: "Vasistha",
    gaps: ["Rigvedic attribution", "epic royal-priest role", "Vishvamitra relationship", "textual-layer chronology", "limits of cross-text biography"],
    supports: [
      ["Rigveda, Shakala Samhita, Mandala 7 — Sukta 089", "", ["textual_contribution", "historical_context", "contested"]],
      ["Rigveda, Shakala Samhita, Mandala 7 — Sukta 070", "", ["textual_contribution", "historical_context"]],
      ["Valmiki Ramayana, Ayodhya Kanda 67", "family priest", ["role", "social_role", "historical_context"]],
      ["Valmiki Ramayana, Bala Kanda, Sarga 22", "Vasishta", ["role", "social_role", "parampara"]],
      ["Valmiki Ramayana, Bala Kanda 52", "offers hospitality", ["role", "social_role", "historical_context"]],
      ["Valmiki Ramayana, Bala Kanda, Sarga 53", "Shabala", ["role", "social_role", "contested"]],
      ["Valmiki Ramayana, Bala Kanda 56", "Vashishta", ["role", "tapas_sadhana", "contested"]],
      ["Valmiki Ramayana, Bala Kanda, Sarga 65", "", ["role", "social_role", "tapas_sadhana"]],
    ],
    claims: [
      ["The approved evidence presents Vasistha in more than one textual layer: Rigvedic Mandala 7 source attributions and later Ramayana narratives about a royal priest, counselor, and counterpart of Vishvamitra.", "historical_context", [0, 1, 2, 4]],
      ["Ramayana passages directly support Vasistha's roles in royal counsel and in the Vishvamitra-Shabala conflict, but they do not by themselves establish a continuous biography back to the Rigvedic seer attribution.", "contested", [2, 3, 4, 5, 6, 7]],
    ],
  },
  {
    name: "Satyajit Ray",
    gaps: ["multi-role identity", "major works", "craft and influences", "collaboration and public support", "social interpretation and legacy"],
    supports: [
      ["Official Biography of Satyajit Ray", "director, screenwriter", ["formation", "works", "craft", "legacy"]],
      ["Satyajit Ray – Biography", "born in Calcutta", ["formation", "works"]],
      ["Pather Panchali (1955)", "first film of the Apu Trilogy", ["works", "craft", "international", "legacy"]],
      ["Pather Panchali (1955)", "Italian neorealism", ["craft", "interpretation", "international"]],
      ["Making of Pather Panchali", "Subrata Mitra", ["relationships", "craft"]],
      ["Making of Pather Panchali", "West Bengal government", ["relationships", "institutions", "craft"]],
      ["Where to begin with Satyajit Ray", "family life, gender, class", ["interpretation", "society_politics", "works"]],
      ["Academy Honorary Award to Satyajit Ray", "influence on filmmakers", ["international", "legacy"]],
    ],
    claims: [
      ["Ray's documented identity spans direction, screenwriting, design, illustration, editing, writing, and composition; his importance cannot be reduced to the Apu Trilogy even though it established his international reputation.", "works", [0, 2, 7]],
      ["Pather Panchali joined literary adaptation, neorealist encouragement, close collaboration, and public financial support, so accounts of Ray's authorship should preserve both his direction and the production's collective conditions.", "relationships", [2, 3, 4, 5]],
    ],
  },
  {
    name: "Verghese Kurien",
    gaps: ["engineering and institutional role", "farmer-owned cooperative model", "Operation Flood", "collaborator attribution", "measured impact and limits"],
    supports: [
      ["1989 Laureate: Dr. Verghese Kurien", "Government Research Creamery", ["formation", "cooperative_model", "technology"]],
      ["The Anand Pattern", "owned and controlled by farmers", ["cooperative_model", "institutions", "farmer_impact"]],
      ["Operation Flood", "Launched in 1970", ["operation_flood", "institutions", "technology", "farmer_impact"]],
      ["Operation Flood", "Phase II", ["operation_flood", "institutions", "legacy"]],
      ["India’s Milk Revolution: Investing in Rural Producer Organizations", "H. M. Dalaya", ["people", "technology", "cooperative_model"]],
      ["Remembering Father of White Revolution on this World Milk Day", "Tribhuvandas", ["people", "sector_context", "cooperative_model"]],
      ["India: The Dairy Revolution", "small fraction", ["criticisms", "farmer_impact", "legacy"]],
      ["India: The Dairy Revolution", "cowless and landless", ["criticisms", "farmer_impact"]],
    ],
    claims: [
      ["Kurien's major contribution was institutional rather than solitary: he helped connect engineering, professional management, farmer ownership, processing, and national market infrastructure in the Anand pattern and Operation Flood.", "institutions", [0, 1, 2]],
      ["Claims about the White Revolution must credit farmers, Tribhuvandas Patel, H. M. Dalaya, government support, and other institutions, while independent evaluation cautions against attributing all milk-production growth or poverty reduction to Operation Flood alone.", "criticisms", [4, 5, 6, 7]],
    ],
  },
];

async function loadProfile(profile) {
  const person = await checked(await db.from("personalities").select("id,personality_categories!inner(category_id,is_primary)").eq("canonical_name", profile.name).single());
  const category = person.personality_categories.find((item) => item.is_primary) || person.personality_categories[0];
  const fields = await checked(await db.from("parameter_fields").select("id,code,label,parameters!inner(code,name,category_id)").eq("parameters.category_id", category.category_id));
  const fieldIds = new Map();
  for (const field of fields) {
    fieldIds.set(field.code, field.id);
    fieldIds.set(one(field.parameters)?.code, field.id);
  }
  const [links, sourceLinks] = await Promise.all([
    checked(await db.from("chunk_personalities").select("source_chunks!inner(id,source_id,chunk_text,page_or_section,textual_layer,is_active,sources!inner(id,title,url,source_status))").eq("personality_id", person.id).eq("source_chunks.is_active", true).limit(2000)),
    checked(await db.from("source_personalities").select("sources!inner(id,title,url,source_status,source_chunks(id,source_id,chunk_text,page_or_section,textual_layer,is_active))").eq("personality_id", person.id).limit(500)),
  ]);
  const linkedChunks = links.map((link) => one(link.source_chunks)).filter(Boolean);
  const associatedChunks = sourceLinks.flatMap((link) => {
    const source = one(link.sources);
    return (source?.source_chunks || []).filter((chunk) => chunk.is_active).map((chunk) => ({ ...chunk, sources: { id: source.id, title: source.title, url: source.url, source_status: source.source_status } }));
  });
  const chunks = [...new Map([...linkedChunks, ...associatedChunks].map((chunk) => [chunk.id, chunk])).values()];
  const claims = await checked(await db.from("claims").select("id,claim_text,review_status").eq("personality_id", person.id).limit(1000));
  return { person, fieldIds, chunks, claims };
}

function findSupport(profile, chunks, [sourceTitle, needle]) {
  const matches = chunks.filter((chunk) => one(chunk.sources)?.title === sourceTitle && one(chunk.sources)?.source_status === "approved"
    && (!needle || chunk.chunk_text.toLowerCase().includes(needle.toLowerCase())));
  if (!matches.length) throw new Error(`${profile.name}: approved support not found: ${sourceTitle} / ${needle}`);
  return matches.sort((left, right) => right.chunk_text.length - left.chunk_text.length)[0];
}

async function main() {
  const report = { mode: apply ? "apply" : "dry-run", profiles: [] };
  for (const profile of profiles) {
    const state = await loadProfile(profile);
    const selected = profile.supports.map((support) => findSupport(profile, state.chunks, support));
    for (const support of profile.supports) for (const code of support[2]) if (!state.fieldIds.has(code)) throw new Error(`${profile.name}: missing field ${code}`);
    for (const claim of profile.claims) if (!state.fieldIds.has(claim[1])) throw new Error(`${profile.name}: missing claim field ${claim[1]}`);
    const counts = { passagesReused: selected.length, passageTagsAdded: 0, claimsAdded: 0, claimsReused: 0, evidenceLinksAdded: 0 };
    const priorities = [];
    if (apply) {
      for (let index = 0; index < profile.supports.length; index += 1) {
        await checked(await db.from("chunk_personalities").upsert({ chunk_id: selected[index].id, personality_id: state.person.id, relationship: "subject", relevance_score: 1,
          tagging_method: "manual", confidence: 1 }, { onConflict: "chunk_id,personality_id" }));
        for (const code of profile.supports[index][2]) {
          const existing = await checked(await db.from("chunk_parameter_fields").select("chunk_id").eq("chunk_id", selected[index].id).eq("parameter_field_id", state.fieldIds.get(code)).limit(1));
          if (!existing.length) {
            await checked(await db.from("chunk_parameter_fields").insert({ chunk_id: selected[index].id, parameter_field_id: state.fieldIds.get(code), confidence: 0.95, tagging_method: "manual" }));
            counts.passageTagsAdded += 1;
          }
        }
      }
      const known = new Map(state.claims.map((claim) => [normalize(claim.claim_text), claim]));
      for (const [claimText, field, supportIndexes] of profile.claims) {
        let claim = known.get(normalize(claimText));
        if (!claim) {
          claim = await checked(await db.from("claims").insert({ personality_id: state.person.id, parameter_field_id: state.fieldIds.get(field), claim_text: claimText,
            claim_kind: "scholarly_interpretation", certainty: "medium", review_status: "draft", approval_origin: "ai_candidate", evidence_type: "scholarly_interpretation",
            researcher_notes: "Targeted corpus-strengthening synthesis across approved source passages. Human review required; no automatic approval." }).select("id,claim_text,review_status").single());
          known.set(normalize(claimText), claim); counts.claimsAdded += 1;
        } else counts.claimsReused += 1;
        for (const supportIndex of supportIndexes) {
          const chunk = selected[supportIndex], source = one(chunk.sources);
          const sourceLink = await checked(await db.from("claim_sources").select("id").eq("claim_id", claim.id).eq("source_id", source.id).limit(1));
          if (!sourceLink.length) {
            await checked(await db.from("claim_sources").insert({ claim_id: claim.id, source_id: source.id, relationship: "supports", evidence_excerpt: chunk.chunk_text,
              page_or_section: chunk.page_or_section, notes: "Foundational corpus-strengthening evidence; synthesis remains draft pending human review." }));
            counts.evidenceLinksAdded += 1;
          }
          await checked(await db.from("claim_chunks").upsert({ claim_id: claim.id, chunk_id: chunk.id, relationship: "supports", confidence: 0.95, link_method: "manual" }, { onConflict: "claim_id,chunk_id" }));
        }
        await checked(await db.from("claim_epistemics").upsert({ claim_id: claim.id, personality_id: state.person.id, epistemic_type: null, proposed_type: "SYNTHESIS_ACROSS_SOURCES",
          type_origin: "deterministic", type_confidence: 0.9, type_review_status: "needs_type_review", classifier_version: "corpus-strengthening/1",
          contract_status: "NEEDS_TYPE_REVIEW", contract_satisfied: false, contract_version: "evidence-contracts/1",
          contract_detail: { reason: "Broad synthesis links multiple approved passages and requires human review.", sprint: "priority-five-corpus-strengthening" } }, { onConflict: "claim_id" }));
        priorities.push({ claimId: claim.id, claim: claim.claim_text, currentReviewStatus: claim.review_status, priorityReason: "Broad foundational synthesis covering multiple Ask question clusters." });
      }
    } else {
      priorities.push(...profile.claims.map(([claim]) => ({ claim, currentReviewStatus: "draft", priorityReason: "Broad foundational synthesis covering multiple Ask question clusters." })));
    }
    report.profiles.push({ personality: profile.name, personalityId: state.person.id, gaps: profile.gaps, sourcesReused: [...new Set(selected.map((chunk) => one(chunk.sources)?.title))],
      selectedPassages: selected.map((chunk) => ({ chunkId: chunk.id, source: one(chunk.sources)?.title, locator: chunk.page_or_section })), foundationalReviewPriorities: priorities, ...counts });
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
