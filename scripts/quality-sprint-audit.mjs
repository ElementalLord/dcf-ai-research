import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const outputDirectory = path.resolve(process.argv[2] || "artifacts/quality-sprint");
const datasetPath = path.resolve(process.argv[3] || "data/quality-evaluation-v1.json");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const now = new Date().toISOString();

async function pages(table, select, configure = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const result = await configure(supabase.from(table).select(select)).range(from, from + 999);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    rows.push(...(result.data || []));
    if ((result.data || []).length < 1000) return rows;
  }
}
const one = (value) => Array.isArray(value) ? value[0] || null : value;
const domain = (url) => { try { return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, "") : null; } catch { return null; } };
const primary = (source) => /primary|speech|letter|text|scripture|inscription|edict/i.test(`${source?.source_type || ""} ${source?.textual_layer || ""}`);
const authoritative = (source) => /government|university|archive|academy|research|institute|journal|scholar|primary/i.test(`${source?.publisher_or_institution || ""} ${source?.source_type || ""}`)
  || /(?:\.gov\.|\.gov$|\.edu$|\.ac\.|jstor|cambridge|oxford|nobelprize|royalsociety|archive\.org)/i.test(domain(source?.url) || "");

function categoryOf(person) {
  return person.personality_categories?.find((item) => item.is_primary)?.categories?.name || one(person.personality_categories)?.categories?.name || "Inspiring Personalities";
}
function categoryLanguage(category) {
  if (/scientist|technologist|innovator/i.test(category)) return { work: "discoveries, experiments, or technical work", primary: "an original paper, lecture, or technical record", legacy: "scientific or technical legacy" };
  if (/saint|spiritual|rishi|sage/i.test(category)) return { work: "works, teachings, and attributed traditions", primary: "a primary text or early textual witness", legacy: "teachings and later reception" };
  if (/monarch|political|warrior|freedom/i.test(category)) return { work: "political actions, institutions, and historical contributions", primary: "a contemporary document, inscription, speech, or letter", legacy: "historical and political legacy" };
  if (/author|artist|music|performer|cultural/i.test(category)) return { work: "major works and artistic contributions", primary: "an original work, interview, or contemporary record", legacy: "artistic legacy and reception" };
  if (/business|entrepreneur|institution|agricultural/i.test(category)) return { work: "institutions, organizational work, and economic contributions", primary: "a contemporary record or first-person account", legacy: "institutional and social legacy" };
  return { work: "major work and contributions", primary: "the closest available primary evidence", legacy: "historical legacy" };
}

function evidenceRefs(claims, count = 3) {
  const selected = claims.filter((claim) => claim.review_status === "approved").slice(0, count);
  return {
    sourceIds: [...new Set(selected.flatMap((claim) => claim.claim_sources?.map((link) => link.source_id) || []))],
    passageIds: [...new Set(selected.flatMap((claim) => claim.claim_chunks?.map((link) => link.chunk_id) || []))],
    answerElements: selected.map((claim) => claim.claim_text),
  };
}

function questionsFor(person, claims) {
  const name = person.canonical_name;
  const category = categoryOf(person);
  const language = categoryLanguage(category);
  const approved = claims.filter((claim) => claim.review_status === "approved");
  const topical = [...approved].sort((a, b) => Number(b.certainty === "high") - Number(a.certainty === "high"));
  const primaryClaims = topical.filter((claim) => claim.claim_sources?.some((link) => primary(one(link.sources))));
  const multiSource = topical.filter((claim) => new Set(claim.claim_sources?.map((link) => link.source_id)).size >= 2);
  const refs = (list, count) => evidenceRefs(list.length ? list : topical, count);
  const topic = (index, fallback) => one(topical[index]?.parameter_fields)?.label || fallback;
  const raw = [
    ["identity", "basic", `Who was ${name}, and what roles are best supported by the available evidence?`, "fully_answered", refs(topical, 3)],
    ["major_contributions", "moderate", `What were ${name}'s most important ${language.work}?`, "fully_answered", refs(topical.slice(1), 4)],
    ["works_or_teachings", "moderate", `Which ${language.work} are securely associated with ${name}, and which attributions need qualification?`, "qualified", refs(topical.slice(2), 4)],
    ["chronology", "hard", `Place ${name} in historical or textual chronology. Which dates or layers are secure, approximate, or disputed?`, "qualified", refs(topical.filter((claim) => /date|chron|histor|period|textual/i.test(`${claim.claim_text} ${one(claim.parameter_fields)?.label || ""}`)), 4)],
    ["citation_precision", "hard", `Using precise citations, explain what the evidence establishes about ${topic(0, "identity and background")} for ${name}.`, "fully_answered", refs(topical, 3)],
    ["relationships", "hard", `What relationships or influences shaped ${name}, and which of them are directly evidenced?`, "qualified", refs(topical.filter((claim) => /teacher|student|mentor|influenc|relationship|family|with /i.test(claim.claim_text)), 4)],
    ["primary_text_interpretation", "hard", `What does ${language.primary} say about ${name}, and what would go beyond the text?`, primaryClaims.length ? "qualified" : "declined", refs(primaryClaims, 3)],
    ["competing_interpretations", "expert", `Compare two plausible interpretations of ${name}'s ${language.legacy}. Which evidence supports each reading?`, "qualified", refs(topical.filter((claim) => /interpret|legacy|signific|reception|contested/i.test(claim.claim_text)), 4)],
    ["incomplete_evidence", "expert", `What important question about ${name} remains unresolved in the current local evidence, and why?`, "qualified", refs(topical.slice(-4), 3)],
    ["unsupported_premise", "moderate", `What was ${name}'s favorite food, and what daily meal did they prefer?`, "declined", { sourceIds: [], passageIds: [], answerElements: [] }],
    ["multi_source_reasoning", "expert", `Synthesize multiple independent sources to explain ${name}'s significance without treating repetition as corroboration.`, multiSource.length ? "fully_answered" : "qualified", refs(multiSource, 5)],
    ["limits_and_misconceptions", "expert", `What is the strongest common misconception or overconfident claim about ${name} that the current evidence cannot justify?`, "qualified", refs(topical, 4)],
  ];
  return raw.map(([skill, difficulty, question, expectedOutcome, evidence], index) => ({
    id: `${person.id}:${String(index + 1).padStart(2, "0")}`, personalityId: person.id, personality: name, category,
    question, testedSkill: skill, difficulty, expectedEvidenceRequirements: skill === "unsupported_premise" ? ["Recognize absent evidence", "Do not invent a citation"]
      : ["Use registered local evidence", "Cite exact passages where available", ...(skill.includes("interpret") || skill.includes("chronology") ? ["Separate fact, inference, text, and tradition"] : [])],
    relevantSourceIds: evidence.sourceIds, relevantPassageIds: evidence.passageIds,
    expectedAnswerElements: evidence.answerElements, expectedOutcome,
    evaluation: { status: "not_run", failureReasons: [] },
  }));
}

function automatedAssessment(claim) {
  const links = claim.claim_chunks || [];
  const contradictory = links.some((link) => link.relationship === "contradicts");
  const exact = links.some((link) => link.relationship === "supports" && (/exact|manual/i.test(link.link_method || "") || Number(link.confidence) >= .85));
  const supporting = links.some((link) => link.relationship === "supports");
  const hasExcerpt = claim.claim_sources?.some((link) => link.evidence_excerpt);
  const status = contradictory ? "Contradicted — conflicts with cited evidence" : exact ? "Supported — ready for human review"
    : supporting || hasExcerpt ? "Partially supported — revision required" : claim.claim_sources?.length ? "Needs investigation — uncertain" : "Unsupported — insufficient evidence";
  const sources = new Set(claim.claim_sources?.map((link) => link.source_id));
  return { status, confidence: exact ? .9 : supporting ? .68 : hasExcerpt ? .5 : claim.claim_sources?.length ? .3 : .1,
    uncertaintyReasons: contradictory ? ["A linked passage is marked contradictory"] : exact ? [] : supporting ? ["Support is not recorded as exact"] : hasExcerpt ? ["Excerpt exists without a resolved local passage"] : ["No passage-level support is linked"],
    independentCorroborationNeeded: sources.size < 2,
  };
}

await mkdir(outputDirectory, { recursive: true });
const [people, claims, sourceLinks, chunkLinks, allSources] = await Promise.all([
  pages("personalities", "id,canonical_name,personality_categories(is_primary,categories(name))", (query) => query.order("canonical_name")),
  pages("claims", "id,personality_id,claim_text,claim_kind,certainty,review_status,evidence_type,approval_origin,parameter_field_id,parameter_fields(label,parameters(name,sort_order)),claim_sources(source_id,relationship,evidence_excerpt,page_or_section,sources(id,title,author,publisher_or_institution,url,source_type,citation,textual_layer)),claim_chunks(chunk_id,relationship,confidence,link_method,metadata,source_chunks(id,chunk_text,page_or_section,textual_layer,sources(id,title,url))),claim_epistemics(epistemic_type,contract_status,contract_satisfied,contract_detail)"),
  pages("source_personalities", "personality_id,source_id,sources(id,title,url,source_type,textual_layer,publisher_or_institution,source_status)"),
  pages("chunk_personalities", "personality_id,chunk_id,source_chunks!inner(id,source_id,page_or_section,textual_layer,is_active)", (query) => query.eq("source_chunks.is_active", true)),
  pages("sources", "id,title,url,source_type,textual_layer,publisher_or_institution,source_status,ingestion_status"),
]);

const statuses = Object.fromEntries(["approved", "needs_review", "draft", "rejected"].map((status) => [status, claims.filter((claim) => claim.review_status === status).length]));
const profiles = people.map((person) => {
  const personClaims = claims.filter((claim) => claim.personality_id === person.id);
  const links = sourceLinks.filter((link) => link.personality_id === person.id);
  const sources = [...new Map(links.map((link) => [link.source_id, one(link.sources)])).values()].filter(Boolean);
  const domains = sources.map((source) => domain(source.url)).filter(Boolean);
  const counts = domains.reduce((map, item) => map.set(item, (map.get(item) || 0) + 1), new Map());
  const approved = personClaims.filter((claim) => claim.review_status === "approved");
  const withPassages = approved.filter((claim) => claim.claim_chunks?.some((link) => link.relationship === "supports"));
  const supported = approved.filter((claim) => one(claim.claim_epistemics)?.contract_satisfied === true);
  const topDomain = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const gaps = [];
  if (sources.filter(primary).length === 0) gaps.push("No classified primary source");
  if (sources.filter(authoritative).length < 2) gaps.push("Insufficient authoritative coverage");
  if (chunkLinks.filter((link) => link.personality_id === person.id).length < 8) gaps.push("Fewer than eight local passages");
  if (withPassages.length < 10) gaps.push("Fewer than ten approved claims with passage support");
  if (topDomain[1] / Math.max(1, sources.length) > .65) gaps.push(`High domain concentration: ${topDomain[0]} supplies ${topDomain[1]}/${sources.length} sources`);
  if (approved.length / Math.max(1, personClaims.length) < .5) gaps.push("Most claims still await review");
  return { personalityId: person.id, personality: person.canonical_name, category: categoryOf(person), sourceCount: sources.length,
    domainCount: counts.size, topDomain: topDomain[0], topDomainSources: topDomain[1], primarySources: sources.filter(primary).length,
    authoritativeSources: sources.filter(authoritative).length, localPassages: chunkLinks.filter((link) => link.personality_id === person.id).length,
    totalClaims: personClaims.length, approvedClaims: approved.length, needsReviewClaims: personClaims.filter((claim) => claim.review_status === "needs_review").length,
    draftClaims: personClaims.filter((claim) => claim.review_status === "draft").length, rejectedClaims: personClaims.filter((claim) => claim.review_status === "rejected").length,
    approvedClaimsWithPassages: withPassages.length, evidenceContractsSatisfied: supported.length,
    evidenceContractsEvaluated: approved.filter((claim) => one(claim.claim_epistemics)).length, gaps };
});

const queue = people.flatMap((person) => claims.filter((claim) => claim.personality_id === person.id && claim.review_status !== "rejected")
  .map((claim) => ({ claim, score: Number(claim.review_status !== "approved") * 100 + Number(claim.certainty === "high") * 50 + Number(Boolean(claim.claim_sources?.length)) * 15 + Number(Boolean(claim.claim_chunks?.length)) * 20
    - Number(one(claim.parameter_fields)?.parameters?.sort_order || 99) }))
  .sort((a, b) => b.score - a.score).slice(0, 12).map(({ claim }, index) => {
    const assessment = automatedAssessment(claim);
    return { priority: index + 1, personalityId: person.id, personality: person.canonical_name, claimId: claim.id, claim: claim.claim_text,
      currentReviewStatus: claim.review_status, claimKind: claim.claim_kind, certainty: claim.certainty,
      epistemicType: one(claim.claim_epistemics)?.epistemic_type || claim.evidence_type || "unclassified", automatedAssessment: assessment.status,
      evidenceConfidence: assessment.confidence, uncertaintyReasons: assessment.uncertaintyReasons,
      independentCorroborationNeeded: assessment.independentCorroborationNeeded,
      sources: (claim.claim_sources || []).map((link) => { const source = one(link.sources); return { sourceId: link.source_id, relationship: link.relationship,
        title: source?.title || null, authorOrInstitution: source?.author || source?.publisher_or_institution || null, url: source?.url || null,
        citation: source?.citation || null, authority: source ? authoritative(source) ? "authoritative" : "general_or_secondary" : "unknown",
        excerpt: link.evidence_excerpt, locator: link.page_or_section }; }),
      passages: (claim.claim_chunks || []).map((link) => { const passage = one(link.source_chunks); return { passageId: link.chunk_id, relationship: link.relationship,
        confidence: link.confidence, linkMethod: link.link_method, locator: passage?.page_or_section || null, text: passage?.chunk_text || null }; }),
      recommendation: assessment.status.startsWith("Supported") ? "Verify the exact wording and locator, then make a human decision."
        : assessment.status.startsWith("Partially") ? "Revise the claim to match the passage or locate stronger evidence before approval."
          : "Acquire or resolve supporting evidence; do not approve yet." };
  }));

const questions = people.flatMap((person) => questionsFor(person, claims.filter((claim) => claim.personality_id === person.id)));
const dataset = { schemaVersion: 1, suiteVersion: "rishi-quality-v1", generatedAt: now, personalityCount: people.length, questionCount: questions.length,
  policy: { externalSearchDefault: false, paidModelDefault: false, humanReviewRequiredForFactualAccuracy: true }, questions };
const datasetText = `${JSON.stringify(dataset, null, 2)}\n`;
const sha256 = createHash("sha256").update(datasetText).digest("hex");
const baseline = { capturedAt: now, liveDatabase: true, counts: { personalities: people.length, claims: claims.length, sources: allSources.length,
  passages: chunkLinks.length, ...statuses, awaitingReview: statuses.draft + statuses.needs_review }, dataset: { version: dataset.suiteVersion, questions: questions.length, sha256 }, profiles };

await writeFile(datasetPath, datasetText);
await writeFile(path.join(outputDirectory, "baseline.json"), `${JSON.stringify(baseline, null, 2)}\n`);
await writeFile(path.join(outputDirectory, "human-review-queue.json"), `${JSON.stringify({ generatedAt: now, count: queue.length, queue }, null, 2)}\n`);
const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
await writeFile(path.join(outputDirectory, "evidence-gaps.csv"), ["personality,state_gap,source_count,domain_count,primary_sources,authoritative_sources,local_passages,approved_claims,passage_supported_claims",
  ...profiles.flatMap((profile) => (profile.gaps.length ? profile.gaps : ["No deterministic gap triggered"]).map((gap) => [profile.personality, gap, profile.sourceCount, profile.domainCount, profile.primarySources, profile.authoritativeSources, profile.localPassages, profile.approvedClaims, profile.approvedClaimsWithPassages].map(escape).join(",")))].join("\n") + "\n");
await writeFile(path.join(outputDirectory, "README.md"), `# Quality sprint artifacts\n\nCaptured from the live Supabase database at ${now}. No claim or source review status was changed.\n\n- Baseline: \`baseline.json\`\n- Stable ${questions.length}-question suite: \`${path.relative(outputDirectory, datasetPath)}\` (SHA-256 \`${sha256}\`)\n- Foundational human-review queue: \`human-review-queue.json\` (${queue.length} claims; 12 per personality)\n- Evidence gaps: \`evidence-gaps.csv\`\n\nReproduce with:\n\n\`\`\`bash\nnode --env-file=.env.local scripts/quality-sprint-audit.mjs\n\`\`\`\n`);
console.log(JSON.stringify({ outputDirectory, datasetPath, counts: baseline.counts, reviewQueue: queue.length, questions: questions.length, sha256 }, null, 2));
