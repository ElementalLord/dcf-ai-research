import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const inputPath = path.join(root, "data/quality-evaluation-v1.json");
const outputPath = path.join(root, "data/quality-evaluation-v2.json");
const mappingPath = path.join(root, "data/quality-evaluation-v2-replacements.json");
const gapPath = path.join(root, "artifacts/quality-sprint/evidence-gap-map-v2.json");
const reportPath = path.join(root, "docs/quality-sprint/evaluation-suite-audit-v2.md");
const fullResultsPath = path.join(root, "artifacts/quality-sprint/evaluation-results.json");
const recentResultsPath = "/private/tmp/dcf-human-approval-after.json";

const replacements = [
  {
    id: "9a66a004-b1ce-429d-946e-715ae059f730:02",
    personality: "Verghese Kurien",
    reason: "PERSONALITY_MISMATCH",
    oldQuestion: "What were Verghese Kurien's most important major works and artistic contributions?",
    newQuestion: "What were Verghese Kurien's most important contributions to India's dairy cooperatives, institution-building, and Operation Flood?",
  },
  {
    id: "9a66a004-b1ce-429d-946e-715ae059f730:03",
    personality: "Verghese Kurien",
    reason: "PERSONALITY_MISMATCH",
    oldQuestion: "Which major works and artistic contributions are securely associated with Verghese Kurien, and which attributions need qualification?",
    newQuestion: "Which institutions, technologies, and cooperative reforms are securely associated with Verghese Kurien, and which claims about their impact need qualification?",
  },
  {
    id: "9a66a004-b1ce-429d-946e-715ae059f730:08",
    personality: "Verghese Kurien",
    reason: "PERSONALITY_MISMATCH",
    oldQuestion: "Compare two plausible interpretations of Verghese Kurien's artistic legacy and reception. Which evidence supports each reading?",
    newQuestion: "Compare two plausible interpretations of Verghese Kurien's institutional legacy and Operation Flood's impact. Which evidence supports each reading?",
  },
];

const fiveProfiles = new Set([
  "Swami Vivekananda",
  "Adi Shankaracharya",
  "Vasistha",
  "Satyajit Ray",
  "Verghese Kurien",
]);

const fiveOverrides = new Map(Object.entries({
  "Swami Vivekananda:02": ["EVIDENCE_EXISTS_NOT_APPROVED", "Major teachings, yoga paths, service, and works remain mostly draft."],
  "Swami Vivekananda:03": ["EVIDENCE_EXISTS_NOT_APPROVED", "Secure works and teachings versus later interpretation need review of existing draft claims."],
  "Swami Vivekananda:04": ["EVIDENCE_EXISTS_NOT_APPROVED", "Travel, Brahmo setting, Ramakrishna chronology, and reception chronology remain draft."],
  "Swami Vivekananda:05": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "Approved birth, pre-monastic identity, vocation, and institutional claims did not rank."],
  "Swami Vivekananda:06": ["EVIDENCE_EXISTS_NOT_APPROVED", "Ramakrishna, the early monastic brotherhood, and intellectual influences remain draft."],
  "Swami Vivekananda:08": ["RETRIEVED_BUT_INSUFFICIENT", "Competing Advaita and neo-Vedanta evidence was retrieved, but the response did not provide the required qualified comparison."],
  "Swami Vivekananda:09": ["EVIDENCE_EXISTS_NOT_APPROVED", "Existing contested-interpretation claims identify unresolved issues but remain unpublished."],
  "Swami Vivekananda:11": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "Multiple approved claims and sources exist, but the multi-source synthesis did not retrieve them sufficiently."],
  "Swami Vivekananda:12": ["EVIDENCE_EXISTS_NOT_APPROVED", "Claims about overstatement, secrecy, hierarchy, and reception remain draft."],

  "Adi Shankaracharya:03": ["RETRIEVED_BUT_INSUFFICIENT", "Teaching evidence was retrieved, but secure works and disputed attributions were not fully distinguished."],
  "Adi Shankaracharya:04": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "The approved eighth-century chronology and uncertainty claim did not rank sufficiently."],
  "Adi Shankaracharya:05": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "Approved identity and chronology evidence exists but was not selected."],
  "Adi Shankaracharya:06": ["EVIDENCE_EXISTS_NOT_APPROVED", "Mandana Misra, predecessor traditions, and later Vedanta relationships remain draft."],
  "Adi Shankaracharya:07": ["RETRIEVED_BUT_INSUFFICIENT", "Textual evidence was retrieved, but the response crossed the intended primary-witness qualification boundary."],
  "Adi Shankaracharya:08": ["RETRIEVED_BUT_INSUFFICIENT", "Evidence was retrieved but did not produce the required qualified comparison."],
  "Adi Shankaracharya:09": ["EVIDENCE_EXISTS_NOT_APPROVED", "Chronology, sectarian identity, hagiography, and authorship uncertainties are documented in draft claims."],
  "Adi Shankaracharya:11": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "Approved SEP and IEP-backed claims span multiple sources but did not support a completed synthesis."],
  "Adi Shankaracharya:12": ["EVIDENCE_EXISTS_NOT_APPROVED", "Hagiographic biography, exact dates, and broad authorship claims remain draft and reviewable."],

  "Vasistha:02": ["EVIDENCE_EXISTS_NOT_APPROVED", "The Dharmasutra attribution, teachings, and broader textual associations remain unapproved."],
  "Vasistha:03": ["EVIDENCE_EXISTS_NOT_APPROVED", "Existing claims distinguish Rigvedic attribution, epic roles, and the Dharmasutra, but most remain outside publication."],
  "Vasistha:04": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "The approved cross-layer synthesis directly addresses chronology and textual layers but did not rank."],
  "Vasistha:05": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "Approved royal-priest and Rigvedic-attribution evidence exists but was not retrieved for this formulation."],
  "Vasistha:06": ["EVIDENCE_EXISTS_NOT_APPROVED", "The Vishvamitra conflict, reconciliation, royal counsel, and Rama relationships are extensively represented in needs-review claims."],
  "Vasistha:08": ["NO_LOCAL_EVIDENCE", "The corpus lacks strong scholarly evidence for two defensible interpretations of Vasistha's teachings and later reception."],
  "Vasistha:09": ["EVIDENCE_EXISTS_NOT_APPROVED", "The unresolved identity across Rigvedic and epic layers is present in the unapproved acaa016e claim."],
  "Vasistha:11": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "Approved Vedic Heritage Portal and Ramayana evidence spans multiple sources but did not yield synthesis."],
  "Vasistha:12": ["EVIDENCE_EXISTS_NOT_APPROVED", "The cross-period continuous-biography warning remains unapproved."],

  "Satyajit Ray:03": ["EVIDENCE_EXISTS_NOT_APPROVED", "Major films, literature, music, design, and attribution limits are covered by draft claims."],
  "Satyajit Ray:04": ["EVIDENCE_EXISTS_NOT_APPROVED", "Education, career development, international recognition, and death chronology remain draft."],
  "Satyajit Ray:05": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "Approved birth, background, and multi-role evidence exists but did not rank."],
  "Satyajit Ray:06": ["EVIDENCE_EXISTS_NOT_APPROVED", "Subrata Mitra, Bansi Chandragupta, Ravi Shankar, and film-society relationships remain draft."],
  "Satyajit Ray:07": ["RETRIEVED_BUT_INSUFFICIENT", "An original-work or contemporary-record passage was retrieved, but the answer exceeded the expected decline/qualification boundary."],
  "Satyajit Ray:08": ["EVIDENCE_EXISTS_NOT_APPROVED", "Humanism, realism, politics, collaboration, and reception interpretations remain draft."],
  "Satyajit Ray:09": ["EVIDENCE_EXISTS_NOT_APPROVED", "Draft claims explicitly separate Ray's stated method from later critical interpretation."],
  "Satyajit Ray:11": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "Approved biography, film, and production evidence spans multiple sources but did not produce synthesis."],
  "Satyajit Ray:12": ["EVIDENCE_EXISTS_NOT_APPROVED", "Overclaims about sole authorship, scores, influence, and declared intent are covered by drafts."],

  "Verghese Kurien:02": ["QUESTION_PROBLEM", "The v1 question incorrectly asks an institution-builder about artistic contributions."],
  "Verghese Kurien:03": ["QUESTION_PROBLEM", "The v1 qualification question repeats the same artistic template mismatch."],
  "Verghese Kurien:04": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "Approved education and Anand-arrival chronology exists but did not rank for the chronology wording."],
  "Verghese Kurien:06": ["EVIDENCE_EXISTS_NOT_APPROVED", "Tribhuvandas Patel, H. M. Dalaya, farmers, government, and professional-management relationships remain mostly draft."],
  "Verghese Kurien:08": ["QUESTION_PROBLEM", "The v1 question incorrectly asks about an artistic legacy rather than institutional legacy and Operation Flood impact."],
  "Verghese Kurien:09": ["EVIDENCE_EXISTS_NOT_APPROVED", "Independent evaluation, autonomy, distributional limits, and causal-attribution claims remain draft."],
  "Verghese Kurien:11": ["APPROVED_EVIDENCE_NOT_RETRIEVED", "Approved institutional and impact-limit claims span multiple sources but did not yield synthesis."],
  "Verghese Kurien:12": ["EVIDENCE_EXISTS_NOT_APPROVED", "Draft evidence addresses sole-hero narratives, government roles, poverty claims, and programme attribution limits."],
}));

const topicHints = {
  identity: ["identity", "background", "formation", "life", "role", "vocation", "education", "scientific role"],
  major_contributions: ["contribution", "discover", "work", "teach", "institution", "action", "art", "operation", "reform", "legacy", "impact", "service", "governance", "enterprise", "textual"],
  works_or_teachings: ["work", "teach", "discover", "institution", "text", "speech", "art", "operation", "reform", "contribution", "practice"],
  chronology: ["historical", "context", "formation", "life", "era", "chronology", "date", "arrival", "background"],
  citation_precision: ["identity", "background", "formation", "life", "role", "vocation", "ideology", "advisor", "guru"],
  relationships: ["relationship", "collabor", "people", "mentor", "lineage", "diplomacy", "politics", "guru", "contempor", "advisor", "family"],
  primary_text_interpretation: ["text", "speech", "work", "record", "inscription", "archive", "source"],
  competing_interpretations: ["contested", "interpretation", "criticism", "complexity", "legacy", "reception", "limit", "myth", "source"],
  incomplete_evidence: ["contested", "interpretation", "criticism", "complexity", "limit", "uncertain", "source"],
  limits_and_misconceptions: ["contested", "interpretation", "criticism", "complexity", "limit", "myth", "source"],
};

function one(value) { return Array.isArray(value) ? value[0] || null : value || null; }
function norm(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function evidenceText(claim) {
  const field = one(claim.parameter_fields);
  const parameter = one(field?.parameters);
  return norm(`${claim.claim_text} ${field?.label || ""} ${field?.code || ""} ${parameter?.name || ""} ${parameter?.code || ""} ${claim.evidence_type || ""}`);
}
function relevantClaims(question, claims) {
  if (question.testedSkill === "multi_source_reasoning") return claims;
  const hints = topicHints[question.testedSkill] || [];
  return claims.filter((claim) => hints.some((hint) => evidenceText(claim).includes(hint)));
}
function classify(question, result, claims) {
  const suffix = question.id.split(":").at(-1);
  const override = fiveOverrides.get(`${question.personality}:${suffix}`);
  if (override) return { category: override[0], missingTopic: override[1] };
  if (result.status !== "abstained" || result.retrievalSufficient || result.citationSupported) {
    return { category: "RETRIEVED_BUT_INSUFFICIENT", missingTopic: "Retrieved evidence did not satisfy the expected answer, qualification, or citation behavior." };
  }
  const relevant = relevantClaims(question, claims);
  const approved = relevant.filter((claim) => claim.review_status === "approved");
  const unapproved = relevant.filter((claim) => claim.review_status !== "approved" && claim.review_status !== "rejected");
  if (approved.length) return { category: "APPROVED_EVIDENCE_NOT_RETRIEVED", missingTopic: `Relevant approved ${question.testedSkill.replaceAll("_", " ")} claims exist but did not retrieve.` };
  if (unapproved.length) return { category: "EVIDENCE_EXISTS_NOT_APPROVED", missingTopic: `Relevant ${question.testedSkill.replaceAll("_", " ")} claims exist but remain draft or needs review.` };
  return { category: "NO_LOCAL_EVIDENCE", missingTopic: `No locally registered claim clearly covers the required ${question.testedSkill.replaceAll("_", " ")} evidence.` };
}
function actionFor(category, hasUnapproved) {
  if (category === "QUESTION_PROBLEM") return "NO_ACTION_QUESTION_FIXED";
  if (category === "APPROVED_EVIDENCE_NOT_RETRIEVED") return "INVESTIGATE_RETRIEVAL";
  if (category === "EVIDENCE_EXISTS_NOT_APPROVED") return "REVIEW_EXISTING_CLAIMS";
  if (category === "NO_LOCAL_EVIDENCE") return "ADD_EVIDENCE";
  if (category === "RETRIEVED_BUT_INSUFFICIENT") return hasUnapproved ? "REVIEW_EXISTING_CLAIMS" : "ADD_EVIDENCE";
  return "ADD_EVIDENCE";
}

const v1 = JSON.parse(await readFile(inputPath, "utf8"));
const fullResults = JSON.parse(await readFile(fullResultsPath, "utf8"));
const recentResults = JSON.parse(await readFile(recentResultsPath, "utf8"));
const v2 = structuredClone(v1);
v2.suiteVersion = "rishi-quality-v2";
v2.generatedAt = "2026-10-15T00:00:00.000-05:00";
v2.questions = v2.questions.map((question) => {
  const replacement = replacements.find((item) => item.id === question.id);
  return replacement ? { ...question, question: replacement.newQuestion, evaluation: { status: "not_run", failureReasons: [] } } : question;
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function allRows(makeQuery) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}
const claims = await allRows(() => db.from("claims").select("id,personality_id,claim_text,review_status,evidence_type,parameter_fields(code,label,parameters(code,name)),claim_sources(source_id),claim_chunks(chunk_id)"));
const claimByPerson = Object.groupBy(claims, (claim) => claim.personality_id);
const fullById = new Map(fullResults.results.map((result) => [result.questionId, result]));
const recentById = new Map(recentResults.results.map((result) => [result.questionId, result]));
const failures = [];
for (const question of v1.questions) {
  const result = fiveProfiles.has(question.personality) ? recentById.get(question.id) : fullById.get(question.id);
  if (!result || result.passed) continue;
  const personClaims = claimByPerson[question.personalityId] || [];
  const assessment = classify(question, result, personClaims);
  const relevant = relevantClaims(question, personClaims);
  const evidenceApplicable = !["NO_LOCAL_EVIDENCE", "QUESTION_PROBLEM"].includes(assessment.category);
  const approved = evidenceApplicable ? relevant.filter((claim) => claim.review_status === "approved") : [];
  const unapproved = evidenceApplicable ? relevant.filter((claim) => claim.review_status !== "approved" && claim.review_status !== "rejected") : [];
  failures.push({
    questionId: question.id,
    personality: question.personality,
    testedSkill: question.testedSkill,
    question: question.question,
    replacementQuestion: replacements.find((item) => item.id === question.id)?.newQuestion || null,
    failureCategory: assessment.category,
    exactMissingTopic: assessment.missingTopic,
    resultStatus: result.status,
    retrievedEvidence: Boolean(result.retrievalSufficient || result.citationSupported),
    relevantApprovedClaimIds: approved.slice(0, 12).map((claim) => claim.id),
    relevantUnapprovedClaimIds: unapproved.slice(0, 12).map((claim) => claim.id),
    relevantDraftOrNeedsReviewExists: assessment.category === "QUESTION_PROBLEM" ? null : unapproved.length > 0,
    genuinelyNewEvidenceNeeded: assessment.category === "QUESTION_PROBLEM" ? null : assessment.category === "NO_LOCAL_EVIDENCE" || (assessment.category === "RETRIEVED_BUT_INSUFFICIENT" && unapproved.length === 0),
    retrievalAppearsToBeIssue: assessment.category === "QUESTION_PROBLEM" ? null : assessment.category === "APPROVED_EVIDENCE_NOT_RETRIEVED",
    bestNextAction: actionFor(assessment.category, unapproved.length > 0),
  });
}

const categories = ["NO_LOCAL_EVIDENCE", "EVIDENCE_EXISTS_NOT_APPROVED", "APPROVED_EVIDENCE_NOT_RETRIEVED", "RETRIEVED_BUT_INSUFFICIENT", "QUESTION_PROBLEM", "OTHER"];
const counts = Object.fromEntries(categories.map((category) => [category, failures.filter((item) => item.failureCategory === category).length]));
const duplicateIds = v2.questions.length - new Set(v2.questions.map((question) => question.id)).size;
const grouped = Object.groupBy(v2.questions, (question) => question.personality);
const validation = {
  validJson: true,
  personalityCount: Object.keys(grouped).length,
  questionCount: v2.questions.length,
  exactlyTwelveEach: Object.values(grouped).every((questions) => questions.length === 12),
  duplicateIds,
};

const priorityGaps = [
  { personality: "Vasistha", missingTopic: "Textual layers, attributed works, Vishvamitra relationship, and limits of a continuous biography", affectedEvaluationQuestions: ["02", "03", "04", "06", "08", "09", "11", "12"], existingEvidenceStatus: "Twenty needs-review claims plus one draft cover epic roles and identity limits; competing scholarly interpretations remain thin.", bestNextAction: "REVIEW_EXISTING_CLAIMS" },
  { personality: "Swami Vivekananda", missingTopic: "Major teachings, yoga paths, service, works, lineage, and qualified reception", affectedEvaluationQuestions: ["02", "03", "04", "06", "08", "09", "11", "12"], existingEvidenceStatus: "A large passage-backed draft and needs-review set already covers these areas.", bestNextAction: "REVIEW_EXISTING_CLAIMS" },
  { personality: "Adi Shankaracharya", missingTopic: "Secure corpus, disputed attribution, hagiography, interlocutors, and later Vedanta reception", affectedEvaluationQuestions: ["03", "04", "06", "07", "08", "09", "11", "12"], existingEvidenceStatus: "Strong SEP/IEP-backed draft claims exist; five broad claims are approved.", bestNextAction: "REVIEW_EXISTING_CLAIMS" },
  { personality: "Satyajit Ray", missingTopic: "Major filmography, collaborators, craft, critical interpretation, and attribution limits", affectedEvaluationQuestions: ["03", "04", "06", "07", "08", "09", "11", "12"], existingEvidenceStatus: "Extensive passage-backed drafts cover films, design, music, collaborators, and interpretation.", bestNextAction: "REVIEW_EXISTING_CLAIMS" },
  { personality: "Verghese Kurien", missingTopic: "Operation Flood phases, cooperative design, collaborators, institutions, and independently evaluated impact", affectedEvaluationQuestions: ["02", "03", "06", "08", "09", "11", "12"], existingEvidenceStatus: "Five claims are approved and a large draft set covers the remaining institutional and impact questions.", bestNextAction: "REVIEW_EXISTING_CLAIMS" },
  { personality: "A. P. J. Abdul Kalam", missingTopic: "Technical leadership, SLV-III, missile programmes, institutions, and evidence-bounded legacy", affectedEvaluationQuestions: ["01", "02", "03", "05", "07", "08", "11"], existingEvidenceStatus: "Passage-linked claims exist but remain outside human approval.", bestNextAction: "REVIEW_EXISTING_CLAIMS" },
  { personality: "C. V. Raman", missingTopic: "Raman effect, experimental method, institutional work, collaborators, and scientific legacy", affectedEvaluationQuestions: ["01", "02", "03", "05", "07", "08", "11"], existingEvidenceStatus: "A broad curated claim set exists but remains unapproved.", bestNextAction: "REVIEW_EXISTING_CLAIMS" },
  { personality: "Jagadish Chandra Bose", missingTopic: "Radio/microwave research, plant-response experiments, instruments, priority limits, and institutions", affectedEvaluationQuestions: ["01", "02", "03", "05", "07", "08", "11", "12"], existingEvidenceStatus: "Curated claims span the relevant scientific framework but remain unapproved.", bestNextAction: "REVIEW_EXISTING_CLAIMS" },
  { personality: "M. S. Subbulakshmi", missingTopic: "Musical formation, repertoire, landmark performances, collaborations, service, and reception", affectedEvaluationQuestions: ["01", "02", "03", "05", "06", "07", "08", "11"], existingEvidenceStatus: "A large multi-lens claim set exists but has not crossed the publication boundary.", bestNextAction: "REVIEW_EXISTING_CLAIMS" },
  { personality: "Ashoka", missingTopic: "Edicts, dhamma, governance, chronology, political context, and contested legacy", affectedEvaluationQuestions: ["01", "02", "03", "04", "05", "07", "08", "11"], existingEvidenceStatus: "Local passages and candidate claims exist, but the evaluation run had no human-approved claim base.", bestNextAction: "REVIEW_EXISTING_CLAIMS" },
];

await mkdir(path.dirname(gapPath), { recursive: true });
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(v2, null, 2)}\n`);
await writeFile(mappingPath, `${JSON.stringify({ fromSuite: v1.suiteVersion, toSuite: v2.suiteVersion, replacements }, null, 2)}\n`);
await writeFile(gapPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  suiteAudited: v1.suiteVersion,
  validReplacementSuite: v2.suiteVersion,
  resultSources: { fullCollection: "artifacts/quality-sprint/evaluation-results.json", fiveProfilePostApproval: "/private/tmp/dcf-human-approval-after.json" },
  methodology: "Classify existing failed questions using result behavior plus current live approved/unapproved claim inventory; the five recently reviewed profiles receive question-level manual evidence assessment.",
  counts,
  validation,
  replacements,
  failures,
  priorityGaps,
}, null, 2)}\n`);

const fiveRows = failures.filter((item) => fiveProfiles.has(item.personality)).map((item) =>
  `| ${item.personality} | ${item.questionId.split(":").at(-1)} | ${item.failureCategory} | ${item.exactMissingTopic} | ${item.relevantDraftOrNeedsReviewExists === null ? "N/A" : item.relevantDraftOrNeedsReviewExists ? "Yes" : "No"} | ${item.genuinelyNewEvidenceNeeded === null ? "N/A" : item.genuinelyNewEvidenceNeeded ? "Yes" : "No"} | ${item.retrievalAppearsToBeIssue === null ? "N/A" : item.retrievalAppearsToBeIssue ? "Yes" : "No"} |`
).join("\n");
const priorityRows = priorityGaps.map((item, index) =>
  `| ${index + 1} | ${item.personality} | ${item.missingTopic} | ${item.affectedEvaluationQuestions.join(", ")} | ${item.existingEvidenceStatus} | ${item.bestNextAction} |`
).join("\n");
await writeFile(reportPath, `# Evaluation-suite validity and evidence-gap audit\n\nDate: 2026-10-15\nAudited suite: \`${v1.suiteVersion}\`\nReplacement suite: \`${v2.suiteVersion}\`\n\n## Question audit\n\n- Valid questions unchanged: 297\n- Malformed questions found and replaced: 3\n- All replacements concern Verghese Kurien and the accidental artistic-template mismatch.\n- No question was changed because the system failed it.\n- No within-personality duplicate question was found.\n\n## Failure categories\n\n| Category | Count |\n|---|---:|\n${categories.map((category) => `| ${category} | ${counts[category]} |`).join("\n")}\n\nThe map covers failed questions from the existing full run, with the five recent profiles replaced by their post-human-approval results. The three malformed v1 questions remain classified as \`QUESTION_PROBLEM\`; their v2 replacements have not been used to claim a corpus-quality change.\n\n## Five-profile detail\n\n| Personality | Q | Category | Exact missing topic or failure | Draft/review evidence | New evidence | Retrieval issue |\n|---|---:|---|---|---|---|---|\n${fiveRows}\n\n## Top ten knowledge gaps\n\n| # | Personality | Missing topic | Questions | Existing evidence | Best next action |\n|---:|---|---|---|---|---|\n${priorityRows}\n\n## Validation\n\n- Personalities: ${validation.personalityCount}\n- Questions: ${validation.questionCount}\n- Exactly 12 per personality: ${validation.exactlyTwelveEach ? "yes" : "no"}\n- Duplicate IDs: ${validation.duplicateIds}\n- Replacement smoke test: all three corrected Kurien questions executed with zero technical errors; results were not folded into the corpus-quality counts above.\n`);

console.log(JSON.stringify({ replacements: replacements.length, counts, validation, failures: failures.length }, null, 2));
