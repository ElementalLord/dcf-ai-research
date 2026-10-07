import type { PersonalityConfiguration } from "@/lib/corpus/personality-config";
import "server-only";
import { retrieveEvidence } from "@/lib/corpus/retrieval";
import { logStage, stageTimer } from "@/lib/corpus/observability";
import { discoverApprovedUrls } from "./live-search";
import { loadActiveSourceRules } from "./source-registry";
import { assessEvidenceSufficiency } from "./sufficiency";
import { discoverWebCandidates, webSearchProvider } from "./web-search";
import { gapSearchQueries } from "./gap-query";
import { fetchApprovedResource } from "./live-fetch";
import { extractRemoteBytes } from "@/lib/corpus/source-extract";
import type { RetrievedPassage } from "@/lib/corpus/types";
import { normalizeForMatch } from "@/lib/corpus/text";

async function fetchQuestionPassages(url: string, question: string, rules: Awaited<ReturnType<typeof loadActiveSourceRules>>, personalityId: string, personalityName: string): Promise<RetrievedPassage[]> {
  const original = await fetchApprovedResource(url, { rules, requireEvidenceApproval: true });
  if (!original.bytes) return [];
  const sections = await extractRemoteBytes(original.bytes, original.contentType, original.finalUrl);
  const subjectTerms = new Set(normalizeForMatch(personalityName).split(" "));
  const terms = normalizeForMatch(question).split(" ").filter((term) => term.length >= 4 && !subjectTerms.has(term) && !/^(what|when|where|which|about)$/.test(term));
  if (!terms.length) terms.push(...[...subjectTerms].filter((term) => term.length >= 4));
  return sections.map((section, index) => ({ section, index, score: terms.reduce((sum, term) => sum + Number(normalizeForMatch(section.text).includes(term)), 0) }))
    .filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 2)
    .map(({ section, index }) => {
      const lower = normalizeForMatch(section.text);
      const position = terms.map((term) => lower.indexOf(term)).find((at) => at >= 0) || 0;
      const excerptStart = Math.max(0, position - 180);
      return {
        kind: "passage" as const, id: `live:${original.finalUrl}:${index}`, chunkId: `live:${original.finalUrl}:${index}`,
        sourceId: `live:${original.finalUrl}`, text: section.text.slice(excerptStart, excerptStart + 900), sectionTitle: section.title || null,
        pageOrSection: section.pageOrSection || null, textualLayer: original.access.default_textual_layer || null,
        sourceTitle: section.title || original.access.display_name, sourceAuthor: null,
        sourceInstitution: original.access.display_name, sourceUrl: original.finalUrl,
        sourceType: original.access.default_source_type || "live web research", sourceStatus: "discovered",
        personalityId, personalityName, origin: "brave_live" as const,
        retrievedAt: new Date().toISOString(), lexicalScore: 1,
      };
    });
}

export async function retrieveWithApprovedResearch(
  question: string,
  personalityId: string,
  options: { additionalPersonalityAliases?: string[]; configuration?: PersonalityConfiguration; initialRetrieval?: Awaited<ReturnType<typeof retrieveEvidence>> } = {},
) {
  const local = options.initialRetrieval || await retrieveEvidence(question, personalityId, options);
  const decision = assessEvidenceSufficiency(question, local.evidence, { personalityAliases: local.personalityAliases, termAliases: local.termAliases, allParameters: local.allParameters });
  local.debug.executionMode = decision.mode;
  local.debug.localEvidenceSufficient = decision.sufficient;
  local.debug.answerable = decision.answerable;
  local.debug.coverageStatus = decision.sufficient ? "sufficient" : decision.answerable ? "partial" : "unsupported";
  local.debug.missingEvidenceDimensions = decision.missingDimensions;
  local.debug.unresolvedEvidenceGap = !decision.sufficient;
  local.debug.localEvidenceCoverage = decision.coverage;
  local.debug.localEvidenceSufficiencyReason = decision.reason;
  if (decision.sufficient) {
    local.debug.liveResearchSkipReason = "LOCAL_EVIDENCE_SUFFICIENT";
    logStage("LIVE_RESEARCH", { triggered: false, reason: "local_sufficient" });
    return local;
  }

  const rules = await loadActiveSourceRules();
  const approved = rules.filter((rule) => rule.allow_live_fetch && rule.evidence_use_status === "approved");
  local.debug.approvedLiveSourceCount = approved.length;
  local.debug.approvedSourcesConsidered = approved.map((rule) => rule.display_name);
  if (approved.length === 0) {
    local.debug.liveResearchSkipReason = "NO_APPROVED_LIVE_SOURCES";
    logStage("LIVE_RESEARCH", { triggered: false, reason: "no_approved_sources" });
    return local;
  }

  local.debug.liveResearchTriggered = true;
  const stopSearch = stageTimer("APPROVED_SEARCH");
  const discovery = await discoverApprovedUrls(question, rules, decision.mode === "RESEARCH" ? 8 : 4, { personalityId, personalityAliases: local.personalityAliases, termAliases: local.termAliases });
  local.debug.latenciesMs.liveSearch = stopSearch();
  local.debug.approvedSourcesConsidered = discovery.approvedSourcesConsidered;
  local.debug.liveUrlsRejected = discovery.rejected;
  const limit = decision.mode === "RESEARCH" ? 4 : 2;
  const selectedUrls = discovery.accepted.slice(0, limit);
  local.debug.liveUrlsAccepted = selectedUrls;
  const stopFetch = stageTimer("LIVE_FETCH");
  const settled = await Promise.allSettled(selectedUrls.map((url) => fetchQuestionPassages(url, question, rules, personalityId, local.personality)));
  settled.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.length) {
      local.evidence.push(...result.value);
      local.debug.liveFetches += 1;
      local.debug.pagesFetched = (local.debug.pagesFetched || 0) + 1;
    } else local.debug.liveUrlsRejected.push({ url: selectedUrls[index], reason: result.status === "rejected" && result.reason instanceof Error ? result.reason.message : "NO_RELEVANT_CONTENT" });
  });
  local.debug.latenciesMs.liveFetch = stopFetch();
  logStage("LIVE_RESEARCH", { triggered: true, urls: selectedUrls.length, fetches: local.debug.liveFetches });
  const refreshed = local;
  refreshed.debug.executionMode = decision.mode;
  let refreshedDecision = assessEvidenceSufficiency(question, refreshed.evidence, { personalityAliases: refreshed.personalityAliases, termAliases: refreshed.termAliases, allParameters: refreshed.allParameters });
  // Brave snippets are discovery only. Original pages supply request-scoped evidence.
  if (!refreshedDecision.sufficient && refreshedDecision.missingDimensions.length > 0 && webSearchProvider().isConfigured() && rules.some((rule) => rule.allow_live_search && rule.allow_live_fetch && rule.evidence_use_status === "approved" && rule.scope_type !== "EXACT_URL")) {
    const queries = gapSearchQueries(local.personality, question, refreshedDecision.missingDimensions);
    local.debug.braveTriggered = true;
    local.debug.braveQueries = queries;
    const discoveries = await Promise.all(queries.map((query) => discoverWebCandidates(query, rules, { maxResults: 8 })));
    local.debug.webSearchCalls = discoveries.reduce((total, web) => total + web.calls, 0);
    local.debug.webSearchCacheHits = discoveries.reduce((total, web) => total + web.cacheHits, 0);
    local.debug.webSearchLatencyMs = Math.max(...discoveries.map((web) => web.latencyMs));
    local.debug.candidateResults = discoveries.reduce((total, web) => total + web.candidates, 0);
    local.debug.policyAcceptedResults = discoveries.reduce((total, web) => total + web.accepted.length, 0);
    local.debug.policyRejectedResults = discoveries.reduce((total, web) => total + web.rejected.length, 0);
    local.debug.webSearchErrorCategory = discoveries.find((web) => web.errorCategory)?.errorCategory || null;
    local.debug.liveUrlsRejected.push(...discoveries.flatMap((web) => web.rejected));
    const freshUrls = [...new Set(discoveries.flatMap((web) => web.accepted))].filter((url) => !selectedUrls.includes(url)).slice(0, 2);
    const fetched = await Promise.allSettled(freshUrls.map((url) => fetchQuestionPassages(url, question, rules, personalityId, refreshed.personality)));
    fetched.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.length) {
        refreshed.evidence.push(...result.value);
        local.debug.liveFetches += 1;
        local.debug.pagesFetched = (local.debug.pagesFetched || 0) + 1;
        local.debug.liveUrlsAccepted.push(freshUrls[index]);
      } else local.debug.liveUrlsRejected.push({ url: freshUrls[index], reason: result.status === "rejected" && result.reason instanceof Error ? result.reason.message : "NO_RELEVANT_CONTENT" });
    });
    if (fetched.some((result) => result.status === "fulfilled" && result.value.length)) {
      refreshedDecision = assessEvidenceSufficiency(question, refreshed.evidence, { personalityAliases: refreshed.personalityAliases, termAliases: refreshed.termAliases, allParameters: refreshed.allParameters });
    }
  } else if (!webSearchProvider().isConfigured()) local.debug.webSearchErrorCategory = "NOT_CONFIGURED";
  refreshed.debug.localEvidenceSufficient = refreshedDecision.sufficient;
  refreshed.debug.answerable = refreshedDecision.answerable;
  refreshed.debug.coverageStatus = refreshedDecision.sufficient ? "sufficient" : refreshedDecision.answerable ? "partial" : "unsupported";
  refreshed.debug.missingEvidenceDimensions = refreshedDecision.missingDimensions;
  refreshed.debug.unresolvedEvidenceGap = !refreshedDecision.sufficient;
  refreshed.debug.localEvidenceCoverage = refreshedDecision.coverage;
  refreshed.debug.localEvidenceSufficiencyReason = refreshedDecision.reason;
  refreshed.debug.liveResearchTriggered = true;
  refreshed.debug.approvedSourcesConsidered = local.debug.approvedSourcesConsidered;
  refreshed.debug.liveUrlsAccepted = local.debug.liveUrlsAccepted;
  refreshed.debug.liveUrlsRejected = local.debug.liveUrlsRejected;
  refreshed.debug.liveFetches = local.debug.liveFetches;
  refreshed.debug.cacheHits = local.debug.cacheHits;
  refreshed.debug.approvedLiveSourceCount = approved.length;
  refreshed.debug.liveResearchSkipReason = null;
  refreshed.debug.braveTriggered = local.debug.braveTriggered || false;
  refreshed.debug.braveQueries = local.debug.braveQueries || [];
  refreshed.debug.newSourcesFetched = local.debug.liveFetches;
  refreshed.debug.latenciesMs.liveSearch = local.debug.latenciesMs.liveSearch;
  refreshed.debug.latenciesMs.liveFetch = local.debug.latenciesMs.liveFetch;
  for (const field of ["webSearchCalls", "webSearchCacheHits", "webSearchLatencyMs", "candidateResults", "policyAcceptedResults", "policyRejectedResults", "pagesFetched", "pagesCacheHits", "chunksAdded", "webSearchErrorCategory"] as const) {
    // The second retrieval is a fresh snapshot; retain the discovery telemetry.
    (refreshed.debug as unknown as Record<string, unknown>)[field] = local.debug[field];
  }
  return refreshed;
}
