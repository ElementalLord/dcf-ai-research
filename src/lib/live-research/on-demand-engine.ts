import { createHash, randomUUID } from "node:crypto";
import type { EvidenceGap, EvidenceGapRequest } from "@/lib/ask/question-resolution";
import { fillsEvidenceGaps } from "@/lib/ask/question-resolution";
import { normalizeForMatch } from "@/lib/corpus/text";
import { passageAddressesTarget } from "@/lib/ask/target-support";
import { recordResearchBudgetReservation, recordResearchSearchCall } from "@/lib/corpus/usage";
import type { RetrievedEvidence, RetrievedPassage } from "@/lib/corpus/types";
import { planResearchQueries, type SourceIdentity } from "./research-quality";
import { detectContextIntent } from "@/lib/ask/historical-context";
import type { CredibleSource } from "./search-credibility";
import { sourcePriority } from "./search-credibility";
import { hasAutomaticAdmissionRights } from "./retention-rights";
import { WebSearchError, type WebSearchResult } from "./web-search-provider";

export type ResearchStatus = "complete" | "insufficient" | "failed" | "in_progress" | "cooldown" | "budget_exhausted";
export type CandidateDecision = "authenticated" | "irrelevant" | "duplicate_work" | "unverified" | "access_restricted" | "unsafe" | "unreadable";
export type Retention = "transient_only" | "license_candidate";
export type ResearchCandidate = { url: string; decision: CandidateDecision; reason: string; workKey: string | null };
export type ResearchLead = { url: string; title: string };
export type ResearchFinding = {
  source: SourceIdentity & { url: string; sourceId: string | null; publisherDomain: string; retrievedAt: string };
  passage: { text: string; locator: string | null; supportLevel: "EXACT" | "STRONG"; supportReason: string };
  relation: "supports" | "potential_contradiction";
  retention: Retention;
  rightsDeclaration: string | null;
  citeableNow: boolean;
  verificationReady: boolean;
};
export type OnDemandResearchResult = {
  requestId: string;
  needId: string;
  workId: string;
  status: ResearchStatus;
  attempted: boolean;
  candidates: ResearchCandidate[];
  leads?: ResearchLead[];
  findings: ResearchFinding[];
  passages: RetrievedPassage[];
  unresolvedGaps: EvidenceGap[];
  sufficientForVerification: boolean;
  citeableNow: boolean;
  budgetReservationId?: string;
  budgetStatus?: string;
  usage: { searchCalls: number; sourceFetches: number; modelCalls: 0; provider: string; errorCategory: string | null };
};

export type FetchedExcerpt = {
  text: string; title: string; url: string; locator: string | null;
  supportLevel: "EXACT" | "STRONG" | "PARTIAL" | "RELATED";
  supportReason: string; identity: SourceIdentity; rightsDeclaration?: string | null;
};
export type ResearchDependencies = {
  provider: { name: string; isConfigured(): boolean; search(query: string, options: { maxResults: number }): Promise<WebSearchResult[]> };
  claimNeed(needId: string, personalityId: string, owner: string): Promise<"acquired" | "active" | "cooldown">;
  finishNeed(needId: string, owner: string, status: "complete" | "insufficient" | "failed", calls: number, outcome: Record<string, unknown>, cooldownSeconds: number): Promise<void>;
  inspect(url: string, title: string): Promise<CredibleSource | null>;
  robotsAllowed(url: string): Promise<boolean>;
  read(source: CredibleSource, statement: string, aliases: string[]): Promise<FetchedExcerpt | null>;
  existingSourceId(url: string): Promise<string | null>;
  openAccessSearch?(personality: string, aliases: string[], question: string): Promise<WebSearchResult[]>;
  reserveBudget?(requestId: string): Promise<{ status: string; reservationId?: string; reservedMicro?: number;
    searchEstimateMicro?: number; inputMicroPer1k?: number; outputMicroPer1k?: number; fallbackMicro?: number }>;
  now?: () => Date;
};

export function narrowQuery(request: EvidenceGapRequest, question: string): string {
  // Gap requirements are generic descriptions. Preserve the named object in
  // admission searches; a publisher's license is still checked on its page.
  const plan = planResearchQueries(request.personalityName, question, [], 1)[0];
  if (detectContextIntent(question) !== "contemporaries" && (process.env.DEMAND_AUTO_ADMISSION_ENABLED === "true" || process.env.DEMAND_VERIFICATION_SHADOW_ENABLED === "true")) {
    const namedTargets = [...question.matchAll(/\b\p{Lu}[\p{L}\p{N}]+(?:\s+\p{Lu}[\p{L}\p{N}]+)+/gu)]
      .map(([value]) => value.replace(/^(?:(?:Did|Does|Do|Was|Were|Is|Are|What|Which|When|Where|Why|How|About|Regarding|Selected|Personality)\s+)+/iu, ""))
      .filter((value) => !normalizeForMatch(request.personalityName).includes(normalizeForMatch(value)));
    const target = namedTargets.at(-1);
    if (target) {
      const action = question.replace(new RegExp(request.personalityName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
        .replace(target, "").replace(/\b(?:in|what|which|when|year|did|was|were|the|a|an)\b/gi, " ")
        .replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").trim();
      return `${request.personalityName} "${target}" ${action} open access`.trim().slice(0, 500);
    }
  }
  return (plan?.query || `${request.personalityName} ${question}`).slice(0, 500);
}

function possibleContradiction(text: string, existing: RetrievedEvidence[], question: string, aliases: string[]): boolean {
  const normalized = normalizeForMatch(text);
  const negated = /\b(?:not|never|no evidence|did not|was not)\b/i.test(text);
  const subjectTerms = new Set(aliases.flatMap((alias) => normalizeForMatch(alias).split(" ")));
  const stem = (term: string) => term.replace(/(?:ing|ed|s)$/i, "");
  const terms = new Set(normalized.split(" ").filter((term) => term.length >= 5 && !subjectTerms.has(term)).map(stem));
  return existing.some((item) => {
    if (!passageAddressesTarget(question, item.text, aliases)) return false;
    const other = normalizeForMatch(item.text);
    const overlap = other.split(" ").filter((term) => terms.has(stem(term))).length;
    if (overlap < 3) return false;
    if (negated !== /\b(?:not|never|no evidence|did not|was not)\b/i.test(item.text)) return true;
    if (!/\b(?:when|what year|which year|date|dated|chronology|first|earliest|latest)\b/i.test(question)) return false;
    const years = new Set(text.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g) || []);
    const otherYears = new Set(item.text.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g) || []);
    return years.size > 0 && otherYears.size > 0 && ![...years].some((year) => otherYears.has(year));
  });
}

function remainingGaps(gaps: EvidenceGap[], evidence: RetrievedEvidence[], newPassages: RetrievedPassage[]): EvidenceGap[] {
  return gaps.filter((gap) => ["date", "significance", "contribution", "requested_work", "comparison", "contested", "current"].includes(gap.requirementKey)
    ? !fillsEvidenceGaps([gap], evidence) : newPassages.length === 0);
}

function blank(request: EvidenceGapRequest, requestId: string, workId: string, status: ResearchStatus, provider: string, errorCategory: string | null = null): OnDemandResearchResult {
  return { requestId, needId: request.needId, workId, status, attempted: false, candidates: [], leads: [], findings: [], passages: [],
    unresolvedGaps: request.gaps, sufficientForVerification: false, citeableNow: false,
    usage: { searchCalls: 0, sourceFetches: 0, modelCalls: 0, provider, errorCategory } };
}

/** One question-triggered need, at most one paid search, and bounded original-source reads. */
export async function executeDemandResearch(request: EvidenceGapRequest, question: string,
  existing: RetrievedEvidence[], aliases: string[], deps: ResearchDependencies): Promise<OnDemandResearchResult> {
  const requestId = randomUUID();
  const workId = createHash("sha256").update(`research/v4:${request.needId}:${request.gaps.map((gap) => gap.id).sort().join(":")}`).digest("hex");
  const provider = deps.provider.name;
  const minimumIndependentWorks = Math.max(1, Math.min(3, request.minimumIndependentWorks || 1));
  if (!request.gaps.length) return blank(request, requestId, workId, "complete", provider);
  if (request.maxExternalSearches < 1 || request.maxExternalSearches > 1) return blank(request, requestId, workId, "budget_exhausted", provider, "BUDGET_LIMIT");
  if (!deps.provider.isConfigured() && !deps.openAccessSearch) return blank(request, requestId, workId, "failed", provider, "NOT_CONFIGURED");
  let lease: "acquired" | "active" | "cooldown";
  try { lease = await deps.claimNeed(workId, request.personalityId, requestId); }
  catch { return blank(request, requestId, workId, "failed", provider, "COORDINATION_UNAVAILABLE"); }
  if (lease !== "acquired") return blank(request, requestId, workId, lease === "active" ? "in_progress" : "cooldown", provider);

  let reservationId: string | undefined;
  if (deps.reserveBudget) {
    let budget: Awaited<ReturnType<NonNullable<ResearchDependencies["reserveBudget"]>>>;
    try { budget = await deps.reserveBudget(requestId); }
    catch { budget = { status: "unavailable" }; }
    if (budget.status !== "reserved" || !budget.reservationId ||
      ![budget.reservedMicro, budget.searchEstimateMicro, budget.inputMicroPer1k, budget.outputMicroPer1k, budget.fallbackMicro]
        .every(value => typeof value === "number" && Number.isFinite(value) && value >= 0) ||
      budget.reservedMicro! < budget.searchEstimateMicro!) {
      const stopped = blank(request, requestId, workId, "budget_exhausted", provider, `BUDGET_${budget.status.toUpperCase()}`);
      stopped.budgetStatus = budget.status;
      try { await deps.finishNeed(workId, requestId, "insufficient", 0, { errorCategory: stopped.usage.errorCategory }, 120); }
      catch { stopped.usage.errorCategory = "COORDINATION_FINISH_FAILED"; }
      return stopped;
    }
    reservationId = budget.reservationId;
    recordResearchBudgetReservation(budget.reservationId, budget);
  }

  const result = blank(request, requestId, workId, "insufficient", provider);
  if (reservationId) result.budgetReservationId = reservationId;
  result.attempted = true;
  try {
    const query = narrowQuery(request, question);
    // For scientific gaps, try the official free PMC index first. Its result
    // IDs are discovery leads only; original articles still pass every gate.
    const pmcResults = deps.openAccessSearch
      ? await deps.openAccessSearch(request.personalityName, aliases, question).catch(() => []) : [];
    if (pmcResults.length) result.usage.provider = "pmc";
    const works = new Set<string>();
    let credibleAnswerSource = false;
    const ranked = pmcResults.slice(0, 4).map((hit, index) => ({ hit, index, priority: 0 }));
    let braveAttempted = false;
    for (let position = 0; position < ranked.length || !braveAttempted; position++) {
      if (position === ranked.length && !braveAttempted) {
        braveAttempted = true;
        if (!deps.provider.isConfigured()) break;
        result.usage.provider = provider;
        result.usage.searchCalls = 1;
        recordResearchSearchCall();
        const searchResults = await deps.provider.search(query, { maxResults: 20 });
        // Snippets are discovery hints only; the original document must verify the fact.
        ranked.push(...searchResults.slice(0, 20).map((hit, index) => ({ hit, index: index + 4,
          priority: sourcePriority(hit.url, `${hit.title} ${hit.snippet || ""}`, question, "", hit.snippet || "") }))
          .sort((a, b) => b.priority - a.priority || a.index - b.index));
      }
      if (position >= ranked.length || result.usage.sourceFetches >= (braveAttempted ? 8 : 4)) break;
      const { hit } = ranked[position];
      let source: CredibleSource | null;
      try { source = await deps.inspect(hit.url, hit.title); }
      catch { result.candidates.push({ url: hit.url, decision: "unsafe", reason: "Source inspection failed or URL was disallowed.", workKey: null }); continue; }
      if (!source) { result.candidates.push({ url: hit.url, decision: "unverified", reason: "Publisher identity or source policy could not be established.", workKey: null }); continue; }
      // Search titles can be identical across independent works. Deduplicate
      // discovery URLs here; use the authenticated DOI/work key after reading.
      const preliminary = `url:${source.url}`;
      if (works.has(preliminary)) { result.candidates.push({ url: source.url, decision: "duplicate_work", reason: "Another URL for this work was already considered.", workKey: preliminary }); continue; }
      if (!await deps.robotsAllowed(source.url)) { result.candidates.push({ url: source.url, decision: "access_restricted", reason: "Robots or access policy disallows automated retrieval.", workKey: preliminary }); continue; }
      // A lead is a safe page to inspect, not evidence or an admission candidate.
      if (!result.leads?.some((lead) => lead.url === source.url)) result.leads?.push({ url: source.url, title: source.title.slice(0, 200) });
      result.usage.sourceFetches += 1;
      let excerpt: FetchedExcerpt | null;
      try { excerpt = await deps.read(source, question, aliases); }
      catch { result.candidates.push({ url: source.url, decision: "unreadable", reason: "Original document retrieval or extraction failed.", workKey: preliminary }); continue; }
      if (!excerpt || !["EXACT", "STRONG"].includes(excerpt.supportLevel)) {
        result.candidates.push({ url: source.url, decision: "irrelevant", reason: "The original document has no directly supporting passage.", workKey: preliminary }); continue;
      }
      if (excerpt.url !== source.url && (!await deps.inspect(excerpt.url, excerpt.title).catch(() => null) || !await deps.robotsAllowed(excerpt.url))) {
        result.candidates.push({ url: excerpt.url, decision: "access_restricted", reason: "The final redirect destination is not authenticated or permits no automated reading.", workKey: preliminary });
        continue;
      }
      const workKey = excerpt.identity.workKey;
      if (works.has(workKey)) { result.candidates.push({ url: excerpt.url, decision: "duplicate_work", reason: "The same underlying work was already read.", workKey }); continue; }
      const sourceId = await deps.existingSourceId(excerpt.url).catch(() => null);
      // A readable, directly supporting page may be cited for this Ask even
      // without complete publication metadata. Admission still requires full
      // provenance and rights below, so it cannot enter Resources.
      works.add(preliminary); works.add(workKey);
      const retained = hasAutomaticAdmissionRights(excerpt.rightsDeclaration);
      const metadataApproved = source.category === "approved exact source";
      const finding: ResearchFinding = {
        source: { ...excerpt.identity, url: excerpt.url, sourceId,
          publisherDomain: new URL(excerpt.url).hostname === "pmc.ncbi.nlm.nih.gov" && excerpt.identity.publisher
            ? `publisher:${normalizeForMatch(excerpt.identity.publisher)}` : new URL(excerpt.url).hostname,
          retrievedAt: (deps.now?.() || new Date()).toISOString() },
        passage: { text: excerpt.text.slice(0, 600), locator: excerpt.locator, supportLevel: excerpt.supportLevel as "EXACT" | "STRONG", supportReason: excerpt.supportReason },
        relation: possibleContradiction(excerpt.text, [...existing, ...result.passages], question, aliases) ? "potential_contradiction" : "supports",
        retention: retained ? "license_candidate" : "transient_only", rightsDeclaration: excerpt.rightsDeclaration || null,
        citeableNow: true, verificationReady: source.category !== "general_web" && (retained || metadataApproved) && excerpt.identity.provenanceComplete,
      };
      result.findings.push(finding);
      if (source.category !== "general_web") credibleAnswerSource = true;
      result.candidates.push({ url: excerpt.url, decision: "authenticated", reason: "Original document identified and a directly relevant passage extracted.", workKey });
      result.passages.push({ kind: "passage", id: `demand:${requestId}:${result.passages.length}`, chunkId: `demand:${requestId}:${result.passages.length}`,
        sourceId: sourceId || `demand:${requestId}`, text: finding.passage.text, sectionTitle: null, pageOrSection: excerpt.locator,
        textualLayer: excerpt.identity.evidenceType, sourceTitle: excerpt.identity.title || excerpt.title,
        sourceAuthor: excerpt.identity.author, sourceInstitution: excerpt.identity.publisher, sourceUrl: excerpt.url,
        sourceType: excerpt.identity.evidenceType, sourceStatus: "discovered", personalityId: request.personalityId,
        personalityName: request.personalityName, origin: hit.sourceProvider === "pmc" ? "pmc_oai" : "brave_live", retrievedAt: finding.source.retrievedAt,
        supportLevel: excerpt.supportLevel as "EXACT" | "STRONG", workKey, accessibility: "READABLE",
        provenance: { title: excerpt.identity.title, author: excerpt.identity.author, publisher: excerpt.identity.publisher,
          publicationDate: excerpt.identity.publicationDate, journal: excerpt.identity.journal, doi: excerpt.identity.doi,
          isbn: excerpt.identity.isbn, complete: excerpt.identity.provenanceComplete },
      });
      // A citeable answer can use one passage. Ordinary-fact admission needs
      // two independent retained works, so keep using the existing read budget
      // while admission (or its shadow evaluation) is enabled.
      const retainableFindings = result.findings.filter((item) => item.verificationReady);
      const independentRetainableWorks = new Set(retainableFindings.map((item) => item.source.workKey)).size >= 2
        && new Set(retainableFindings.map((item) => item.source.publisherDomain)).size >= 2;
      const independentAnswerWorks = new Set(result.findings.map((finding) => finding.source.workKey)).size;
      const authoritativeAnswerSource = credibleAnswerSource || result.findings.some((finding) => finding.source.evidenceType !== "general_web");
      const explanatoryQuestion = /\b(?:how|why)\b/i.test(question);
      if (!remainingGaps(request.gaps, [...existing, ...result.passages], result.passages).length
        && independentAnswerWorks >= minimumIndependentWorks
        && (!explanatoryQuestion || authoritativeAnswerSource)
        && (process.env.DEMAND_AUTO_ADMISSION_ENABLED !== "true" && process.env.DEMAND_VERIFICATION_SHADOW_ENABLED !== "true"
          || independentRetainableWorks)) break;
    }
    result.unresolvedGaps = remainingGaps(request.gaps, [...existing, ...result.passages], result.passages);
    if (result.findings.some((finding) => finding.relation === "potential_contradiction")) {
      result.unresolvedGaps.push({ id: createHash("sha256").update(`conflict/v1:${workId}`).digest("hex"),
        requirementKey: "conflict", type: "conflicting_evidence", subjectId: request.personalityId,
        topic: request.gaps[0]?.topic || "subject", requirement: "Resolve the conflicting source accounts before treating the answer as established.",
        suitableSources: ["independent primary record", "critical scholarship"],
        completion: "Independent evidence explains or resolves the disagreement.", contested: true });
    }
    result.citeableNow = result.unresolvedGaps.length === 0 && result.passages.length > 0;
    result.sufficientForVerification = result.unresolvedGaps.length === 0 && result.findings.some((finding) => finding.verificationReady)
      && !result.findings.some((finding) => finding.relation === "potential_contradiction");
    result.status = result.unresolvedGaps.length === 0 && result.passages.length ? "complete" : "insufficient";
  } catch (error) {
    result.status = "failed";
    if (error instanceof WebSearchError && !error.attempted) result.usage.searchCalls = 0;
    result.usage.errorCategory = error instanceof WebSearchError ? error.category
      : error instanceof Error ? error.message.slice(0, 80) : "RESEARCH_FAILED";
  }
  // Fail closed on coordination errors: a finding may still support this response, but it was not stored.
  try { await deps.finishNeed(workId, requestId, result.status === "complete" ? "complete" : result.status === "failed" ? "failed" : "insufficient",
    result.usage.searchCalls, { candidates: result.candidates.length, findings: result.findings.length, errorCategory: result.usage.errorCategory },
    // Transient passages are usable only for this response. A long cooldown after
    // finding partial evidence makes a repeat question lose that evidence entirely.
    result.status === "complete" ? 0 : result.status === "insufficient" ? (result.findings.length ? 0 : 600) : 120); }
  catch { result.usage.errorCategory = "COORDINATION_FINISH_FAILED"; }
  return result;
}
