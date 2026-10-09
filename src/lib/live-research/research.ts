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
import { inspectSearchSource } from "./search-credibility";
import { recordDiscoveredSource, searchPolicyDecision, type SearchPolicy } from "./search-policy";
import type { SourceAccessRule } from "./source-policy";
import { selectSourceAuthorization } from "./source-policy";
import { answerIntent } from "@/lib/ask/evidence-priority";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function fetchQuestionPassages(
  url: string, question: string, rules: Awaited<ReturnType<typeof loadActiveSourceRules>>,
  personalityId: string, personalityName: string, personalityAliases: string[] = [], searchPolicy?: SearchPolicy,
): Promise<RetrievedPassage[]> {
  let fetchRules = rules;
  let targetUrl = url;
  if (searchPolicy) {
    if (!searchPolicyDecision(url, searchPolicy).allowed) return [];
    const existing = selectSourceAuthorization(url, rules, "fetch", true);
    if (!existing) {
      const source = await inspectSearchSource(url, searchPolicy);
      if (!source) return [];
      const ephemeral: SourceAccessRule = {
        id: `request:${source.domain}`, display_name: source.title, domain: source.domain,
        scope_type: "EXACT_URL", allowed_path_prefix: null, exact_url: source.url,
        include_subdomains: false, allow_live_search: true, allow_live_fetch: true,
        allow_ingestion: false, evidence_use_status: "approved", priority: -1,
        default_textual_layer: null, default_source_type: source.category,
        cache_ttl_hours: 0, is_active: true,
      };
      fetchRules = [ephemeral, ...rules];
      targetUrl = source.url;
    }
  }
  const original = await fetchApprovedResource(targetUrl, { rules: fetchRules, requireEvidenceApproval: true,
    urlAllowed: searchPolicy ? (candidate) => searchPolicyDecision(candidate, searchPolicy).allowed : undefined });
  if (searchPolicy && !searchPolicyDecision(original.finalUrl, searchPolicy).allowed) return [];
  if (!original.bytes) return [];
  const sections = await extractRemoteBytes(original.bytes, original.contentType, original.finalUrl);
  const aliases = [...new Set([personalityName, ...personalityAliases].map(normalizeForMatch).filter((value) => value.length >= 5))];
  if (/scholar|academic|journal/i.test(original.access.default_source_type || "")) {
    const workIdentity = normalizeForMatch(`${new URL(original.finalUrl).pathname} ${sections.map((section) => section.title || "").join(" ")}`);
    if (!aliases.some((alias) => workIdentity.includes(alias))) return [];
  }
  const subjectWords = new Set(aliases.flatMap((alias) => alias.split(" ")));
  const focus = normalizeForMatch(question).split(" ").filter((term) => term.length >= 4 && !subjectWords.has(term)
    && !/^(what|when|where|which|about|known|important|role|play|major|stories|historically|tradition)$/.test(term));
  if (!focus.length) {
    const intent = answerIntent(question);
    if (intent === "identity") focus.push("identity", "field", "role", "work");
    else if (intent === "importance") focus.push("contribution", "impact", "work");
  }
  const candidates: Array<{ section: typeof sections[number]; index: number; text: string; score: number }> = [];
  sections.forEach((section, index) => {
    const normalized = normalizeForMatch(section.text);
    for (const alias of aliases) {
      let offset = 0;
      for (let mention = 0; mention < 6; mention += 1) {
        const at = normalized.indexOf(alias, offset);
        if (at < 0) break;
        offset = at + alias.length;
        const sentenceStart = section.text.lastIndexOf(".", at);
        const start = sentenceStart >= at - 350 ? sentenceStart + 1 : Math.max(0, at - 150);
        const window = section.text.slice(start, Math.min(section.text.length, at + 650)).trim();
        const englishWords = (window.match(/\b(?:the|and|of|in|was|is|to|as|with|his|her)\b/gi) || []).length;
        if (englishWords < 2 || !window.split(/[.!?]/).some((sentence) => sentence.trim().split(/\s+/).length >= 7)) continue;
        const normalizedWindow = normalizeForMatch(window);
        const focusScore = focus.reduce((sum, term) => sum + Number(normalizedWindow.includes(term)), 0);
        if (focus.length && focusScore === 0) continue;
        candidates.push({ section, index, text: window, score: focusScore * 3 + Math.min(3, englishWords) });
      }
    }
  });
  const seen = new Set<number>();
  const passages = candidates.sort((a, b) => b.score - a.score).filter((item) => {
    if (seen.has(item.index)) return false;
    seen.add(item.index);
    return true;
  }).slice(0, 2).map(({ section, index, text }) => ({
    kind: "passage" as const, id: `live:${original.finalUrl}:${index}`, chunkId: `live:${original.finalUrl}:${index}`,
    sourceId: `live:${original.finalUrl}`, text, sectionTitle: section.title || null,
    pageOrSection: section.pageOrSection || null, textualLayer: original.access.default_textual_layer || null,
    sourceTitle: original.access.display_name, sourceAuthor: null,
    sourceInstitution: new URL(original.finalUrl).hostname.replace(/^www\./, ""), sourceUrl: original.finalUrl,
    sourceType: original.access.default_source_type || "live web research", sourceStatus: "discovered",
    personalityId, personalityName, origin: "brave_live" as const,
    retrievedAt: new Date().toISOString(), lexicalScore: 1,
  }));
  if (passages.length && searchPolicy && !searchPolicy.rules.some((rule) => rule.domain === new URL(original.finalUrl).hostname))
    await recordDiscoveredSource(original.finalUrl, original.access.display_name, original.access.default_source_type || "institutional");
  return passages;
}

export async function retrieveWithApprovedResearch(
  question: string,
  personalityId: string,
  options: { additionalPersonalityAliases?: string[]; configuration?: PersonalityConfiguration; initialRetrieval?: Awaited<ReturnType<typeof retrieveEvidence>>; searchPolicy?: SearchPolicy; forceLiveFallback?: boolean } = {},
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
  if (options.searchPolicy?.mode === "approved_domains_only" && !options.searchPolicy.rules.some((rule) => rule.status === "allowed")) {
    local.debug.liveResearchSkipReason = "NO_ALLOWED_DOMAINS";
    return local;
  }
  if (decision.sufficient && !options.forceLiveFallback) {
    local.debug.liveResearchSkipReason = "LOCAL_EVIDENCE_SUFFICIENT";
    logStage("LIVE_RESEARCH", { triggered: false, reason: "local_sufficient" });
    return local;
  }

  const allRules = await loadActiveSourceRules();
  const rules = options.searchPolicy ? allRules.filter((rule) => searchPolicyDecision(rule.exact_url || `https://${rule.domain}${rule.allowed_path_prefix || "/"}`, options.searchPolicy!).allowed) : allRules;
  const mappings = await supabaseAdmin.from("source_personalities").select("sources(url)").eq("personality_id", personalityId).limit(100);
  const associatedDomains = new Set((mappings.data || []).flatMap((row) => {
    const source = Array.isArray(row.sources) ? row.sources[0] : row.sources;
    try { return source?.url ? [new URL(source.url).hostname] : []; } catch { return []; }
  }));
  const approved = rules.filter((rule) => rule.allow_live_fetch && rule.evidence_use_status === "approved");
  local.debug.approvedLiveSourceCount = approved.length;
  local.debug.approvedSourcesConsidered = approved.map((rule) => rule.display_name);
  if (approved.length === 0 && !options.searchPolicy) {
    local.debug.liveResearchSkipReason = "NO_APPROVED_LIVE_SOURCES";
    logStage("LIVE_RESEARCH", { triggered: false, reason: "no_approved_sources" });
    return local;
  }

  local.debug.liveResearchTriggered = true;
  const stopSearch = stageTimer("APPROVED_SEARCH");
  const discovery = await discoverApprovedUrls(question, rules, decision.mode === "RESEARCH" ? 8 : 4, { personalityId, personalityAliases: local.personalityAliases, termAliases: local.termAliases });
  if (options.searchPolicy) discovery.accepted = discovery.accepted.filter((url) => searchPolicyDecision(url, options.searchPolicy!).allowed);
  local.debug.latenciesMs.liveSearch = stopSearch();
  local.debug.approvedSourcesConsidered = discovery.approvedSourcesConsidered;
  local.debug.liveUrlsRejected = discovery.rejected;
  const limit = decision.mode === "RESEARCH" ? 4 : 2;
  const selectedUrls = discovery.accepted.slice(0, limit);
  local.debug.liveUrlsAccepted = selectedUrls;
  const stopFetch = stageTimer("LIVE_FETCH");
  const settled = await Promise.allSettled(selectedUrls.map((url) => fetchQuestionPassages(url, question, rules, personalityId, local.personality, local.personalityAliases, options.searchPolicy)));
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
  if ((!refreshedDecision.sufficient || options.forceLiveFallback) && webSearchProvider().isConfigured() && (options.searchPolicy || rules.some((rule) => rule.allow_live_search && rule.allow_live_fetch && rule.evidence_use_status === "approved" && rule.scope_type !== "EXACT_URL"))) {
    const queries = gapSearchQueries(local.personality, question, options.forceLiveFallback ? [] : refreshedDecision.missingDimensions);
    local.debug.braveTriggered = true;
    local.debug.braveQueries = queries;
    const discoveries = await Promise.all(queries.map((query) => discoverWebCandidates(query, rules, { maxResults: 8, searchPolicy: options.searchPolicy })));
    const initialDomains = new Set(discoveries.flatMap((result) => result.accepted).map((url) => new URL(url).hostname.replace(/^www\./, "")));
    if (initialDomains.size < 2 || options.forceLiveFallback) {
      const subjectWords = new Set(normalizeForMatch(local.personality).split(" "));
      const focus = normalizeForMatch(question).split(" ").filter((word) => word.length > 2 && !subjectWords.has(word)
        && !/^(what|why|who|where|when|how|the|and|for|does|did|was|were|are|about|known|important)$/.test(word)).slice(0, 4);
      if (!focus.length) {
        const intent = answerIntent(question);
        focus.push(...(intent === "identity" ? ["identity", "field", "work"] : intent === "importance" ? ["contribution", "impact"] : ["source", "account"]));
      }
      const scopedQueries = rules
        .filter((rule) => rule.is_active && rule.scope_type === "DOMAIN" && rule.domain && rule.allow_live_search && rule.allow_live_fetch && rule.evidence_use_status === "approved")
        .sort((a, b) => Number(associatedDomains.has(b.domain)) - Number(associatedDomains.has(a.domain)) || a.priority - b.priority)
        .slice(0, 3)
        .map((rule) => {
          const format = rule.domain.endsWith("valmikiramayan.net") ? "prose" : rule.domain.endsWith("valmiki.iitk.ac.in") ? "summary" : "";
          return `site:${rule.domain} ${local.personality} ${focus.join(" ")} ${format}`.trim();
        });
      local.debug.braveQueries.push(...scopedQueries);
      discoveries.unshift(...await Promise.all(scopedQueries.map((query) => discoverWebCandidates(query, rules, { maxResults: 12, searchPolicy: options.searchPolicy }))));
    }
    local.debug.webSearchCalls = discoveries.reduce((total, web) => total + web.calls, 0);
    local.debug.webSearchCacheHits = discoveries.reduce((total, web) => total + web.cacheHits, 0);
    local.debug.webSearchLatencyMs = Math.max(...discoveries.map((web) => web.latencyMs));
    local.debug.candidateResults = discoveries.reduce((total, web) => total + web.candidates, 0);
    local.debug.policyAcceptedResults = discoveries.reduce((total, web) => total + web.accepted.length, 0);
    local.debug.policyRejectedResults = discoveries.reduce((total, web) => total + web.rejected.length, 0);
    local.debug.webSearchErrorCategory = discoveries.find((web) => web.errorCategory)?.errorCategory || null;
    local.debug.liveUrlsRejected.push(...discoveries.flatMap((web) => web.rejected));
    const candidates = [...new Set(discoveries.flatMap((web) => web.accepted))].filter((url) => {
      if (selectedUrls.includes(url)) return false;
      const parsed = new URL(url);
      return !parsed.hostname.endsWith("valmikiramayan.net") || /prose\.htm$/i.test(parsed.pathname);
    });
    const firstByDomain = new Map<string, string>();
    for (const url of candidates) {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      if (!firstByDomain.has(domain)) firstByDomain.set(domain, url);
    }
    const freshUrls = [...firstByDomain.values(), ...candidates.filter((url) => ![...firstByDomain.values()].includes(url))].slice(0, decision.mode === "RESEARCH" ? 6 : 5);
    const fetched = await Promise.allSettled(freshUrls.map((url) => fetchQuestionPassages(url, question, rules, personalityId, refreshed.personality, refreshed.personalityAliases, options.searchPolicy)));
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
