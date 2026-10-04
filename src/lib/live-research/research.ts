import type { PersonalityConfiguration } from "@/lib/corpus/personality-config";
import "server-only";
import { retrieveEvidence } from "@/lib/corpus/retrieval";
import { logStage, stageTimer } from "@/lib/corpus/observability";
import { fetchAndCacheApprovedPage } from "./cache";
import { discoverApprovedUrls } from "./live-search";
import { loadActiveSourceRules } from "./source-registry";
import { assessEvidenceSufficiency } from "./sufficiency";
import { discoverWebCandidates, webSearchProvider } from "./web-search";

export async function retrieveWithApprovedResearch(
  question: string,
  personalityId: string,
  options: { additionalPersonalityAliases?: string[]; configuration?: PersonalityConfiguration } = {},
) {
  const local = await retrieveEvidence(question, personalityId, options);
  const decision = assessEvidenceSufficiency(question, local.evidence, { personalityAliases: local.personalityAliases, termAliases: local.termAliases });
  local.debug.executionMode = decision.mode;
  local.debug.localEvidenceSufficient = decision.sufficient;
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
  const settled = await Promise.allSettled(selectedUrls.map((url) => fetchAndCacheApprovedPage({
    url,
    rules,
    personalityId,
    parameterFieldIds: local.parameterFieldIds,
  })));
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    if (result.status === "fulfilled") {
      if (result.value.cacheHit) { local.debug.cacheHits += 1; local.debug.pagesCacheHits = (local.debug.pagesCacheHits || 0) + 1; }
      else { local.debug.liveFetches += 1; local.debug.pagesFetched = (local.debug.pagesFetched || 0) + 1; local.debug.chunksAdded = (local.debug.chunksAdded || 0) + result.value.chunks; }
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : "FETCH_FAILED";
      local.debug.liveUrlsRejected.push({ url: selectedUrls[index], reason });
    }
  }
  local.debug.latenciesMs.liveFetch = stopFetch();
  logStage("LIVE_RESEARCH", { triggered: true, urls: selectedUrls.length, fetches: local.debug.liveFetches, cacheHits: local.debug.cacheHits });
  let refreshed = local.debug.liveFetches || local.debug.cacheHits
    ? await retrieveEvidence(question, personalityId, options) : local;
  refreshed.debug.executionMode = decision.mode;
  let refreshedDecision = assessEvidenceSufficiency(question, refreshed.evidence, { personalityAliases: refreshed.personalityAliases, termAliases: refreshed.termAliases });
  // Web search runs only after local retrieval and the existing approved-page path.
  // Search snippets are never passed into the page cache, chunks, or answer context.
  if (!refreshedDecision.sufficient && webSearchProvider().isConfigured() && rules.some((rule) => rule.allow_live_search && rule.allow_live_fetch && rule.evidence_use_status === "approved" && rule.scope_type !== "EXACT_URL")) {
    const web = await discoverWebCandidates(question, rules, { maxResults: decision.mode === "RESEARCH" ? 10 : 8 });
    local.debug.webSearchCalls = web.calls;
    local.debug.webSearchCacheHits = web.cacheHits;
    local.debug.webSearchLatencyMs = web.latencyMs;
    local.debug.candidateResults = web.candidates;
    local.debug.policyAcceptedResults = web.accepted.length;
    local.debug.policyRejectedResults = web.rejected.length;
    local.debug.webSearchErrorCategory = web.errorCategory;
    local.debug.liveUrlsRejected.push(...web.rejected);
    const freshUrls = web.accepted.filter((url) => !selectedUrls.includes(url)).slice(0, 2);
    const fetched = await Promise.allSettled(freshUrls.map((url) => fetchAndCacheApprovedPage({ url, rules, personalityId, parameterFieldIds: [], discoveryProvider: "brave" })));
    fetched.forEach((result, index) => {
      if (result.status === "fulfilled") {
        if (result.value.cacheHit) { local.debug.cacheHits += 1; local.debug.pagesCacheHits = (local.debug.pagesCacheHits || 0) + 1; }
        else { local.debug.liveFetches += 1; local.debug.pagesFetched = (local.debug.pagesFetched || 0) + 1; local.debug.chunksAdded = (local.debug.chunksAdded || 0) + result.value.chunks; }
        local.debug.liveUrlsAccepted.push(freshUrls[index]);
      } else local.debug.liveUrlsRejected.push({ url: freshUrls[index], reason: result.reason instanceof Error ? result.reason.message : "FETCH_FAILED" });
    });
    if (fetched.some((result) => result.status === "fulfilled")) {
      refreshed = await retrieveEvidence(question, personalityId, options);
      refreshedDecision = assessEvidenceSufficiency(question, refreshed.evidence, { personalityAliases: refreshed.personalityAliases, termAliases: refreshed.termAliases });
    }
  } else if (!webSearchProvider().isConfigured()) local.debug.webSearchErrorCategory = "NOT_CONFIGURED";
  refreshed.debug.localEvidenceSufficient = refreshedDecision.sufficient;
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
  refreshed.debug.latenciesMs.liveSearch = local.debug.latenciesMs.liveSearch;
  refreshed.debug.latenciesMs.liveFetch = local.debug.latenciesMs.liveFetch;
  for (const field of ["webSearchCalls", "webSearchCacheHits", "webSearchLatencyMs", "candidateResults", "policyAcceptedResults", "policyRejectedResults", "pagesFetched", "pagesCacheHits", "chunksAdded", "webSearchErrorCategory"] as const) {
    // The second retrieval is a fresh snapshot; retain the discovery telemetry.
    (refreshed.debug as unknown as Record<string, unknown>)[field] = local.debug[field];
  }
  return refreshed;
}
