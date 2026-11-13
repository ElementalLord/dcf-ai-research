import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { classifyClaim } from "@/lib/claim-epistemics/classification";
import { CLASSIFIER_VERSION, CONTRACT_VERSION, type SourceClass } from "@/lib/claim-epistemics/types";
import { normalizedClaim, tokenJaccard } from "@/lib/corpus/dedupe";
import { logStage } from "@/lib/corpus/observability";
import type { RetrievedPassage } from "@/lib/corpus/types";
import { withRequestUsage } from "@/lib/corpus/usage";
import type { ResearchFinding } from "@/lib/live-research/on-demand-engine";
import { cleanCandidate, directlyStates, independentlyWorded, numbers, productionVerificationProvider, risky, uncertainty,
  type AtomicCandidate, type VerificationProvider } from "@/lib/live-research/knowledge-verification";
import type { HarvestPayload, HarvestSource } from "./plan";
import { passageHash } from "./topics";

/**
 * Autonomous admission. After an answer's live research has been recorded, facts that
 * the research verified become approved claims with no human reviewer.
 *
 * A proposition is published only when every gate passes:
 *   1. source standing     each cited work is credible or trusted, from a recognized publisher
 *   2. evidence contract   two works from different publishers, or one trusted authoritative work
 *   3. atomic extraction   a model proposes plain factual propositions from the passages
 *   4. deterministic check numbers, names and every material word are present in each passage;
 *                          no quotations, hedges, superlatives, priority or interpretation
 *   5. entailment check    a second model call must find the exact proposition SUPPORTED
 *   6. corpus consistency  not a duplicate, and no approved claim states a competing value
 *   7. publication         the database re-checks standing, recency and independence itself
 * Anything that fails is recorded with its reason and left out. The claim is stored in
 * DCF's own words with a locator; no source text is kept.
 */
export const HARVEST_ADMISSION_POLICY = "harvest-admission/1";
export const autoAdmissionEnabled = () => process.env.KNOWLEDGE_AUTO_ADMISSION_ENABLED !== "false";

export type AdmissionOutcome = "admitted" | "duplicate" | "quarantined" | "rejected";
export type AdmissionDecision = { proposition: string; outcome: AdmissionOutcome; reasons: string[]; claimId?: string; workKeys: string[] };
export type AdmissionResult = { attempted: boolean; decisions: AdmissionDecision[]; modelCalls: number; skipped?: string };

type ExistingClaim = { id: string; claim_text: string; approval_origin: string | null; approval_metadata: { storage_mode?: string } | null };
export type AdmissionStore = {
  existing(personalityId: string): Promise<ExistingClaim[]>;
  admit(input: Record<string, unknown>): Promise<{ claimId: string; created: boolean }>;
  record(input: Record<string, unknown>): Promise<void>;
  suspend(claimId: string, reason: "contradiction"): Promise<void>;
};
export type AdmissionInput = { personalityId: string; personalityName: string; question: string; passages: RetrievedPassage[]; payload: HarvestPayload };

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const publisherOf = (domain: string) => domain.replace(/^www\./, "");
const eligibleSource = (source: HarvestSource) => (source.tier === "trusted" || source.tier === "credible")
  && source.authority_level !== "general_web" && Boolean(source.title);
const trustedAlone = (source: HarvestSource) => source.tier === "trusted" && source.authority_level === "authoritative";

function sourceClass(type: HarvestSource["evidence_type"]): SourceClass {
  return type === "primary_document" || type === "traditional_text" ? "PRIMARY_TEXT"
    : type === "scholarly_interpretation" ? "SCHOLARLY" : type === "general_web" ? "OTHER" : "REFERENCE";
}

/** The strongest supporting passage of each eligible work, as the verifier's evidence list. */
export function admissionEvidence(input: AdmissionInput): Array<{ source: HarvestSource; finding: ResearchFinding }> {
  const evidence: Array<{ source: HarvestSource; finding: ResearchFinding }> = [];
  for (const source of input.payload.sources.filter(eligibleSource)) {
    const hashes = new Map(source.findings.filter((finding) => finding.kind === "answer_evidence"
      && (finding.support_level === "EXACT" || finding.support_level === "STRONG")).map((finding) => [finding.passage_hash, finding]));
    const passage = input.passages.filter((item) => hashes.has(passageHash(item.text)))
      .sort((a, b) => Number(b.supportLevel === "EXACT") - Number(a.supportLevel === "EXACT"))[0];
    if (!passage) continue;
    const stored = hashes.get(passageHash(passage.text))!;
    evidence.push({ source, finding: {
      source: { title: source.title, author: source.author, publisher: source.publisher || publisherOf(source.domain),
        publicationDate: source.publication_date, journal: source.journal, doi: source.doi, isbn: source.isbn,
        evidenceType: source.evidence_type, workKey: source.work_key, provenanceComplete: true, url: source.url,
        sourceId: null, publisherDomain: publisherOf(source.domain), retrievedAt: passage.retrievedAt || new Date().toISOString() },
      passage: { text: passage.text.slice(0, 600), locator: stored.locator, supportLevel: stored.support_level as "EXACT" | "STRONG",
        supportReason: stored.support_reason || "" },
      relation: "supports", retention: "transient_only", rightsDeclaration: source.rights, citeableNow: true, verificationReady: true } });
  }
  // Cited and higher-scoring works first; the verifier reads at most four.
  return evidence.sort((a, b) => Number(b.source.cited) - Number(a.source.cited) || b.source.score - a.source.score).slice(0, 4);
}

export function productionHarvestAdmissionStore(): AdmissionStore {
  return {
    async existing(personalityId) {
      const { data, error } = await supabaseAdmin.from("claims").select("id,claim_text,approval_origin,approval_metadata")
        .eq("personality_id", personalityId).eq("review_status", "approved").limit(800);
      if (error) throw error;
      return (data || []) as ExistingClaim[];
    },
    async admit(input) {
      const { data, error } = await supabaseAdmin.rpc("admit_harvest_verified_claim", { p_admission: input });
      const value = data as { claim_id?: string; created?: boolean } | null;
      if (error || !value?.claim_id) throw error || new Error("Admission returned no claim");
      return { claimId: value.claim_id, created: value.created === true };
    },
    async record(input) {
      const { error } = await supabaseAdmin.rpc("record_harvest_decision", { p_decision: input });
      if (error) throw error;
    },
    async suspend(claimId, reason) {
      const { error } = await supabaseAdmin.rpc("suspend_harvest_claim", { p_claim_id: claimId, p_reason: reason });
      if (error) throw error;
    },
  };
}

/** Never throws. A failure at any step leaves the Library exactly as it was. */
export async function admitFromHarvest(input: AdmissionInput,
  deps: { provider?: VerificationProvider; store?: AdmissionStore } = {}): Promise<AdmissionResult> {
  const result: AdmissionResult = { attempted: false, decisions: [], modelCalls: 0 };
  const skip = (reason: string): AdmissionResult => ({ ...result, skipped: reason });
  if (!autoAdmissionEnabled()) return skip("disabled");
  const evidence = admissionEvidence(input);
  if (!evidence.length) return skip("no_eligible_source");
  const independent = new Set(evidence.map(({ source }) => publisherOf(source.domain))).size >= 2;
  // No model call is spent unless the evidence could satisfy the contract at all.
  if (!independent && !evidence.some(({ source }) => trustedAlone(source))) return skip("contract_unreachable");
  const provider = deps.provider || productionVerificationProvider();
  const store = deps.store || productionHarvestAdmissionStore();
  const findings = evidence.map(({ finding }) => finding);
  result.attempted = true;
  // Model calls here are counted apart from the answer that triggered them.
  return withRequestUsage(async () => {
    let extracted: AtomicCandidate[];
    let existing: ExistingClaim[];
    try {
      result.modelCalls += 1;
      [extracted, existing] = await Promise.all([
        provider.extract({ personality: input.personalityName, findings, focus: input.question.slice(0, 400) }),
        store.existing(input.personalityId)]);
    } catch { return skip("extraction_unavailable"); }
    const seen = new Set<string>();
    for (const raw of (Array.isArray(extracted) ? extracted : []).slice(0, 8)) {
      // At most three well-formed, distinct propositions are verified per answer.
      if (result.decisions.length >= 3) break;
      const candidate = cleanCandidate(raw, findings.length);
      if (!candidate) continue;
      const identity = normalizedClaim(candidate.proposition);
      if (seen.has(identity) || result.decisions.some((earlier) => tokenJaccard(earlier.proposition, candidate.proposition) >= 0.8)) continue;
      seen.add(identity);
      const cited = candidate.evidenceIndexes.map((index) => evidence[index]);
      const decision: AdmissionDecision = { proposition: candidate.proposition, outcome: "quarantined", reasons: [],
        workKeys: cited.map(({ source }) => source.work_key) };
      result.decisions.push(decision);
      const claimHash = hash(`${input.personalityId}:${identity}`);
      let support = "UNRESOLVED";
      const hold = (reason: string, outcome: AdmissionOutcome = "quarantined") => { decision.outcome = outcome; decision.reasons.push(reason); };
      try {
        const duplicate = existing.find((item) => normalizedClaim(item.claim_text) === identity || tokenJaccard(item.claim_text, candidate.proposition) >= 0.9);
        if (duplicate) { decision.claimId = duplicate.id; hold("An equivalent approved claim already exists", "duplicate"); continue; }
        const withoutNumbers = (value: string) => value.replace(/\d+(?:[.,]\d+)*/g, "");
        const competing = existing.find((item) => tokenJaccard(withoutNumbers(item.claim_text), withoutNumbers(candidate.proposition)) >= 0.8
          && numbers(item.claim_text).join("|") !== numbers(candidate.proposition).join("|"));
        if (competing) {
          // Two machine-verified values that disagree: neither is safe to keep answering from.
          if (competing.approval_metadata?.storage_mode === "harvest_verified") await store.suspend(competing.id, "contradiction").catch(() => undefined);
          hold("An approved claim states a competing date or quantity"); continue;
        }
        if (candidate.type !== "HISTORICAL_FACT" || !["ordinary_fact", "official_record_fact"].includes(candidate.category)) {
          hold("Only plain documented facts are admitted without review"); continue;
        }
        if (risky.test(candidate.proposition) || uncertainty.test(candidate.proposition) || candidate.qualification) {
          hold("Priority, superlative, causal or hedged wording is not admitted automatically"); continue;
        }
        if (/[“”"']/.test(candidate.proposition)) { hold("Quotations are not admitted automatically"); continue; }
        if (new Set(cited.map(({ source }) => publisherOf(source.domain))).size !== cited.length) { hold("Cited works share a publisher"); continue; }
        if (!(cited.length >= 2 || (cited.length === 1 && trustedAlone(cited[0].source)))) {
          hold("One source is not enough unless it is trusted and authoritative"); continue;
        }
        if (numbers(candidate.proposition).some((value) => !cited.every(({ finding }) => finding.passage.text.includes(value)))) {
          hold("A number or date is not present in every cited passage"); continue;
        }
        if (!cited.every(({ finding }) => directlyStates(finding.passage.text, candidate.proposition, input.personalityName))) {
          hold("A cited passage does not state every material detail"); continue;
        }
        if (cited.some(({ finding }) => !independentlyWorded(candidate.proposition, finding.passage.text))) {
          hold("The wording copies a source passage"); continue;
        }
        const classification = classifyClaim({ text: candidate.proposition, sourceClasses: cited.map(({ source }) => sourceClass(source.evidence_type)),
          locators: cited.map(({ finding }) => finding.passage.locator) });
        if (!classification.needsReview && classification.type !== "HISTORICAL_FACT") { hold("Classified as something other than a documented fact"); continue; }
        let assessment: Awaited<ReturnType<VerificationProvider["assess"]>>;
        try {
          result.modelCalls += 1;
          assessment = await provider.assess({ candidate, personality: input.personalityName, findings: cited.map(({ finding }) => finding),
            existing: existing.map((item) => item.claim_text) });
        } catch { hold("The entailment check was unavailable"); continue; }
        support = ["SUPPORTED", "PARTIALLY_SUPPORTED", "CONTRADICTED", "INSUFFICIENT_EVIDENCE", "INVALID_SOURCE", "UNRESOLVED"].includes(assessment?.support) ? assessment.support : "UNRESOLVED";
        if (assessment?.conflictsExisting || assessment?.materialContradiction) { hold("The entailment check found a contradiction"); continue; }
        if (support !== "SUPPORTED" || assessment.exactEntities !== true || assessment.exactDatesAndUnits !== true || assessment.qualifiersPreserved !== true
          || !Array.isArray(assessment.supportingIndexes) || cited.some((_, index) => !assessment.supportingIndexes.includes(index))) {
          hold(assessment?.reason?.slice(0, 160) || "The passages do not entail the exact proposition",
            ["CONTRADICTED", "INVALID_SOURCE"].includes(support) ? "rejected" : "quarantined"); continue;
        }
        if (cited.length > 1 && assessment.independentDocuments !== true) { hold("The works may copy one another"); continue; }
        try {
          const saved = await store.admit({ personality_id: input.personalityId, claim_text: candidate.proposition, claim_hash: claimHash,
            epistemic_type: "HISTORICAL_FACT", category: candidate.category, classifier_version: CLASSIFIER_VERSION,
            contract_version: CONTRACT_VERSION, policy_version: HARVEST_ADMISSION_POLICY, question_hash: input.payload.question_hash,
            sources: cited.map(({ source, finding }) => ({ work_key: source.work_key, locator: finding.passage.locator })) });
          decision.claimId = saved.claimId;
          decision.outcome = saved.created ? "admitted" : "duplicate";
          decision.reasons.push(saved.created ? "Passed every gate" : "Already admitted; verification renewed");
        } catch (error) {
          hold(error instanceof Error && error.message ? `Publication refused: ${error.message.slice(0, 120)}` : "Publication refused by the database");
        }
      } finally {
        // The database records admissions itself; everything else is logged here with its reason.
        if (decision.outcome !== "admitted") await store.record({ personality_id: input.personalityId, claim_hash: claimHash,
          outcome: decision.outcome, support, epistemic_type: candidate.type, policy_version: HARVEST_ADMISSION_POLICY,
          reason_codes: decision.reasons, source_work_keys: decision.workKeys, question_hash: input.payload.question_hash }).catch(() => undefined);
      }
    }
    logStage("KNOWLEDGE_ADMISSION", { candidates: result.decisions.length, modelCalls: result.modelCalls,
      admitted: result.decisions.filter((item) => item.outcome === "admitted").length,
      held: result.decisions.filter((item) => item.outcome === "quarantined" || item.outcome === "rejected").length });
    return result;
  });
}
