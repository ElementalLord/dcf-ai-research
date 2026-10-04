import type { PersonalityConfiguration } from "@/lib/corpus/personality-config";
import "server-only";
import { retrieveEvidence } from "@/lib/corpus/retrieval";
import { logStage, stageTimer } from "@/lib/corpus/observability";
import { fetchAndCacheApprovedPage } from "./cache";
import { discoverApprovedUrls } from "./live-search";
import { loadActiveSourceRules } from "./source-registry";
import { assessEvidenceSufficiency } from "./sufficiency";

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
  if (selectedUrls.length === 0) {
    local.debug.liveResearchSkipReason = "NO_APPROVED_URLS_DISCOVERED";
    return local;
  }

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
      if (result.value.cacheHit) local.debug.cacheHits += 1;
      else local.debug.liveFetches += 1;
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : "FETCH_FAILED";
      local.debug.liveUrlsRejected.push({ url: selectedUrls[index], reason });
    }
  }
  local.debug.latenciesMs.liveFetch = stopFetch();
  logStage("LIVE_RESEARCH", { triggered: true, urls: selectedUrls.length, fetches: local.debug.liveFetches, cacheHits: local.debug.cacheHits });
  if (local.debug.liveFetches === 0 && local.debug.cacheHits === 0) {
    local.debug.liveResearchSkipReason = "LIVE_FETCH_FAILED";
    return local;
  }

  const refreshed = await retrieveEvidence(question, personalityId, options);
  refreshed.debug.executionMode = decision.mode;
  const refreshedDecision = assessEvidenceSufficiency(question, refreshed.evidence, { personalityAliases: refreshed.personalityAliases, termAliases: refreshed.termAliases });
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
  return refreshed;
}
