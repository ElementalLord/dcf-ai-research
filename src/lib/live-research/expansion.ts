import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadPersonalityConfiguration } from "@/lib/corpus/personality-context";
import { loadPersonalityCoverage } from "@/lib/corpus/onboarding";
import { normalizeForMatch } from "@/lib/corpus/text";
import { CorpusError } from "@/lib/corpus/errors";
import { fetchAndCacheApprovedPage } from "./cache";
import { loadActiveSourceRules } from "./source-registry";
import { buildExpansionQueries, rankCoverageGaps, strategiesExhausted, type Gap, type PlannedQuery, type StrategyPerformance } from "./expansion-plan";
import { discoverWebCandidates, webSearchProvider } from "./web-search";
import { canResumeExpansion } from "./expansion-run-policy";
import { adaptiveStopReason } from "./expansion-run-policy";
import { evaluateDepth } from "./depth";
import { verifyAndAdmitCandidate, promoteVerifiedFamily } from "./admission";
import type { Verification } from "./verification";
import { normalizeSearchQuery } from "./web-search-provider";
import { benchmarkCorpusRetrieval } from "./benchmark";
import { linkIngestedEvidence, type IntegrationReport } from "./link-ingested";
import { EXPLORATION_BUDGET, mayExploreChild } from "./exploration-policy";
import { rankCandidateUrls } from "./candidate-ranking";
import { fetchDiscoveryPreview } from "./live-fetch";
import { scopedNavigationLinks } from "./verification";

type Run = {
  id: string; personality_id: string; status: string; queries: PlannedQuery[];
  next_query_index: number; max_search_requests: number; search_calls: number; cache_hits: number;
  candidate_urls: number; accepted_urls: number; rejected_urls: number; pages_fetched: number;
  pages_cache_hits: number; chunks_added: number; duplicate_urls: number; saturated_steps: number;
  seen_urls: string[]; error_category: string | null;
  mode: "guided" | "auto"; stop_reason: string | null; round_reports: Array<Record<string, unknown>>;
  depth_report: Record<string, unknown>; verified_sources: number; bibliographic_sources: number; independent_works: number;
  primary_passages: number; scholarly_sources: number; exact_claim_links: number;
  discovered_candidates: Array<{ url: string; status: "accepted" | "rejected"; reason?: string }>;
  query_reports: Array<Record<string, unknown>>; strategy_performance: StrategyPerformance; integration_report: IntegrationReport;
};

export async function previewExpansion(personalityId: string, maxSearchRequests = 30, candidateDomains: string[] = [], performance: StrategyPerformance = {}, candidateWorks: Array<{ title: string; author?: string | null; year?: string | null }> = []) {
  const max = Math.max(1, Math.min(50, maxSearchRequests));
  const configuration = await loadPersonalityConfiguration(personalityId);
  const [coverageResult, rules, fieldsResult, sourceResult, relationshipResult, eventResult, bibliographicResult, historyResult] = await Promise.all([
    loadPersonalityCoverage(personalityId), loadActiveSourceRules(),
    supabaseAdmin.from("parameters").select("id,code,parameter_fields(id,label)").eq("category_id", configuration.categoryId).limit(500),
    supabaseAdmin.from("source_personalities").select("sources(title)").eq("personality_id", personalityId).limit(500),
    supabaseAdmin.from("relationships").select("object_name,relationship_type").eq("subject_personality_id", personalityId).limit(30),
    supabaseAdmin.from("event_personalities").select("events(title)").eq("personality_id", personalityId).limit(30),
    supabaseAdmin.from("research_candidates").select("title,author,publication_year").eq("verification_status", "BIBLIOGRAPHIC_ONLY")
      .order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("external_research_runs").select("query_reports,strategy_performance").eq("personality_id", personalityId)
      .order("created_at", { ascending: false }).limit(50),
  ]);
  const dbError = [fieldsResult, sourceResult, relationshipResult, eventResult, bibliographicResult, historyResult].find((item) => item.error)?.error;
  if (dbError) throw new CorpusError("DATABASE_FAILED", "Expansion metadata could not be loaded.", 500, { cause: dbError });
  const fieldsByCode = new Map((fieldsResult.data || []).map((row) => [row.code, row.parameter_fields || []]));
  const gaps: Gap[] = coverageResult.coverage.parameters.map((parameter) => ({
    name: parameter.name, code: parameter.code, sourceChunks: parameter.sourceChunks,
    uniqueEvidenceSources: parameter.uniqueEvidenceSources,
    independentWorks: parameter.independentWorks, primaryWorks: parameter.primaryWorks, scholarlyWorks: parameter.scholarlyWorks,
    claimsWithExactPassages: parameter.claimsWithExactPassages, approvedClaims: parameter.approvedClaims,
    fields: (fieldsByCode.get(parameter.code) || []).map((field) => ({ id: field.id, label: field.label })),
  }));
  const unwrap = (value: unknown): Record<string, unknown> | null => Array.isArray(value) ? (value[0] || null) : value && typeof value === "object" ? value as Record<string, unknown> : null;
  const titles = (sourceResult.data || []).map((row) => String(unwrap(row.sources)?.title || "")).filter(Boolean);
  const relationships = (relationshipResult.data || []).map((row) => String(row.object_name || row.relationship_type || "")).filter(Boolean);
  const events = (eventResult.data || []).map((row) => String(unwrap(row.events)?.title || "")).filter(Boolean);
  const domains = [...new Set([...candidateDomains, ...rules.filter((rule) => rule.allow_live_search && rule.allow_live_fetch && rule.evidence_use_status === "approved" && rule.scope_type === "DOMAIN").map((rule) => rule.domain)])];
  const aliases = [configuration.canonicalName, ...configuration.aliases.filter((item) => !item.isAmbiguous).map((item) => item.alias)];
  const recentWorks = (bibliographicResult.data || []).filter((item) => item.title
    && aliases.some((alias) => normalizeForMatch(item.title).includes(normalizeForMatch(alias))))
    .map((item) => ({ title: item.title as string, author: item.author, year: item.publication_year }));
  const priorQueries = new Set((historyResult.data || []).flatMap((run) => (run.query_reports || [])
    .map((item: { query?: string }) => normalizeSearchQuery(item.query || ""))));
  const priorPerformance: StrategyPerformance = {};
  if (!Object.keys(performance).length) for (const run of historyResult.data || []) {
    for (const [strategy, item] of Object.entries(run.strategy_performance || {}) as Array<[keyof StrategyPerformance, { attempts: number; credible: number; newWorks: number; exactLinks: number }]>) {
      const previous = priorPerformance[strategy] || { attempts: 0, credible: 0, newWorks: 0, exactLinks: 0 };
      priorPerformance[strategy] = { attempts: previous.attempts + (item.attempts || 0),
        credible: previous.credible + (item.credible || 0), newWorks: previous.newWorks + (item.newWorks || 0),
        exactLinks: previous.exactLinks + (item.exactLinks || 0) };
    }
  }
  const queries = buildExpansionQueries({ name: configuration.canonicalName, aliases: aliases.slice(1), gaps,
    sourceTitles: titles, relationships, events, domains,
    performance: Object.keys(performance).length ? performance : priorPerformance,
    candidateWorks: [...candidateWorks, ...recentWorks].filter((item, index, all) => all.findIndex((other) => other.title === item.title) === index) },
  Math.max(40, Math.min(100, max * 4))).filter((item) => !priorQueries.has(normalizeSearchQuery(item.query)));
  const depth = evaluateDepth(coverageResult.coverage.parameters);
  const benchmark = await benchmarkCorpusRetrieval(personalityId, configuration.canonicalName,
    [configuration.canonicalName, ...configuration.aliases.filter((item) => !item.isAmbiguous).map((item) => item.alias)],
    depth.weakAreas.map((area) => area.name));
  return {
    personality: coverageResult.personality,
    provider: webSearchProvider().name,
    configured: webSearchProvider().isConfigured(),
    coverage: coverageResult.coverage.overall,
    depth: { ...depth, sufficient: depth.sufficient && benchmark.broadReady, benchmark },
    weakAreas: rankCoverageGaps(gaps).slice(0, 10),
    queries,
    estimatedSearchRequests: Math.min(5, queries.length),
    batchSize: 5,
    maxSearchRequests: max,
    policyNote: "Brave discovers broadly. Unknown URLs undergo bounded security and provenance verification before any evidence admission.",
  };
}

export async function createExpansionRun(personalityId: string, maxSearchRequests = 30, mode: "guided" | "auto" = "guided", focusQuery?: string) {
  const plan = await previewExpansion(personalityId, maxSearchRequests);
  if (!plan.configured) throw new CorpusError("SEARCH_PROVIDER_FAILED", "Brave Search is not configured.", 503);
  const focus = focusQuery?.trim();
  if (focus && (!normalizeSearchQuery(focus) || focus.length > 160)) throw new CorpusError("INVALID_INPUT", "Focus query is invalid.", 400);
  const initialQueries = focus ? [{ ...plan.queries[0], query: focus, strategy: "topic" as const, weaknessReason: "Guided focus supplied by researcher" }, ...plan.queries.filter((item) => normalizeSearchQuery(item.query) !== normalizeSearchQuery(focus)).slice(0, 4)] : plan.queries.slice(0, 5);
  const { data, error } = await supabaseAdmin.from("external_research_runs").insert({
    personality_id: personalityId, provider: plan.provider, status: "running",
    queries: initialQueries, max_search_requests: plan.maxSearchRequests,
    mode, depth_report: plan.depth,
  }).select("*").single();
  if (error) throw new CorpusError("DATABASE_FAILED", "The expansion run could not be created.", 500, { cause: error });
  return data as Run;
}

export async function setExpansionStatus(runId: string, status: "running" | "stopped") {
  let depthUpdate: Record<string, unknown> = {};
  if (status === "running") {
    const current = await getExpansionRun(runId);
    if (!canResumeExpansion({ status: current.status, nextQueryIndex: current.next_query_index, queryCount: current.queries.length, searchCalls: current.search_calls, maxSearchRequests: current.max_search_requests })) {
      throw new CorpusError("INVALID_INPUT", "The run is complete or has no search budget remaining.", 409);
    }
  } else {
    const current = await getExpansionRun(runId);
    const updated = await previewExpansion(current.personality_id, current.max_search_requests);
    depthUpdate = { depth_report: updated.depth, independent_works: updated.coverage.independentWorks,
      exact_claim_links: updated.coverage.claimsWithExactPassages };
  }
  const { data, error } = await supabaseAdmin.from("external_research_runs").update({ status,
    ...depthUpdate, stop_reason: status === "stopped" ? "manual_stop" : null, updated_at: new Date().toISOString() }).eq("id", runId).in("status", ["running", "stopped"]).select("*").single();
  if (error || !data) throw new CorpusError("INVALID_INPUT", "The run cannot change status.", 409);
  return data as Run;
}

export async function getExpansionRun(runId: string): Promise<Run> {
  const { data, error } = await supabaseAdmin.from("external_research_runs").select("*").eq("id", runId).single();
  if (error || !data) throw new CorpusError("INVALID_INPUT", "Expansion run not found.", 404);
  return data as Run;
}

async function tagMatchingFields(sourceId: string, fieldIds: string[], fieldLabels: string[]) {
  if (!fieldIds.length) return;
  const { data: chunks, error } = await supabaseAdmin.from("source_chunks").select("id,chunk_text").eq("source_id", sourceId).eq("is_active", true).limit(1000);
  if (error) throw error;
  const rows = (chunks || []).flatMap((chunk) => fieldIds.flatMap((fieldId, index) => {
    const label = normalizeForMatch(fieldLabels[index] || "");
    return label.length >= 5 && normalizeForMatch(chunk.chunk_text).includes(label)
      ? [{ chunk_id: chunk.id, parameter_field_id: fieldId, confidence: 0.8, tagging_method: "rule" }] : [];
  }));
  if (rows.length) {
    const { error: tagError } = await supabaseAdmin.from("chunk_parameter_fields").upsert(rows, { onConflict: "chunk_id,parameter_field_id" });
    if (tagError) throw tagError;
  }
}

async function linkVerifiedPassages(sourceId: string, personalityId: string, aliases: string[], verification: Verification) {
  if (verification.approval_origin !== "verified_auto") return;
  const { data: source } = await supabaseAdmin.from("sources").select("approval_origin").eq("id", sourceId).single();
  if (source?.approval_origin !== "verified_auto") return;
  const { data: chunks, error } = await supabaseAdmin.from("source_chunks").select("id,chunk_text")
    .eq("source_id", sourceId).eq("is_active", true).limit(2000);
  if (error) throw error;
  const names = aliases.map(normalizeForMatch).filter((name) => name.length >= 5);
  const relevant = (chunks || []).filter((chunk) => names.some((name) => normalizeForMatch(chunk.chunk_text).includes(name)));
  const irrelevantIds = (chunks || []).filter((chunk) => !relevant.includes(chunk)).map((chunk) => chunk.id);
  for (let index = 0; index < irrelevantIds.length; index += 100) {
    const { error: removeError } = await supabaseAdmin.from("chunk_personalities").delete()
      .eq("personality_id", personalityId).in("chunk_id", irrelevantIds.slice(index, index + 100));
    if (removeError) throw removeError;
  }
  if (verification.source_type !== "primary_text" || !/veda|ramayana|mahabharata/i.test(verification.work_title || "")) return;
  const { data: fields, error: fieldError } = await supabaseAdmin.from("parameter_fields")
    .select("id,code,label").limit(500);
  if (fieldError) throw fieldError;
  const fieldIds = (fields || []).filter((field) => /mantra|sukta|verse|textual/i.test(`${field.code} ${field.label}`)).map((field) => field.id);
  if (!fieldIds.length || !relevant.length) return;
  const { error: linkError } = await supabaseAdmin.from("chunk_parameter_fields").upsert(
    relevant.flatMap((chunk) => fieldIds.map((fieldId) => ({ chunk_id: chunk.id, parameter_field_id: fieldId,
      confidence: 0.8, tagging_method: "rule" }))), { onConflict: "chunk_id,parameter_field_id" });
  if (linkError) throw linkError;
}

export async function stepExpansion(runId: string) {
  const run = await getExpansionRun(runId);
  if (run.status !== "running") return run;
  if (run.next_query_index >= run.queries.length || run.search_calls >= run.max_search_requests) {
    const { data } = await supabaseAdmin.from("external_research_runs").update({ status: "complete", stop_reason: "budget" }).eq("id", runId).select("*").single();
    return data as Run;
  }
  const query = run.queries[run.next_query_index];
  // Reserve a step before network I/O so a resume never repeats a paid query.
  const { data: reserved, error: reserveError } = await supabaseAdmin.from("external_research_runs")
    .update({ next_query_index: run.next_query_index + 1, updated_at: new Date().toISOString() })
    .eq("id", runId).eq("status", "running").eq("next_query_index", run.next_query_index).select("id");
  if (reserveError || !reserved?.length) return getExpansionRun(runId);
  let rules = await loadActiveSourceRules();
  const discovery = await discoverWebCandidates(query.query, rules, { maxResults: 10 });
  const seen = new Set(run.seen_urls || []);
  let duplicates = 0, pagesFetched = 0, pagesCacheHits = 0, chunksAdded = 0, rejected = discovery.rejected.length;
  let verified = 0, bibliographic = 0, primaryPassages = 0, scholarlySources = 0;
  const workKeys = new Set<string>();
  const newWorkKeys = new Set<string>();
  let newSources = 0;
  let linkedCount = 0;
  let pagesExplored = 0;
  const integration: IntegrationReport = { exact: 0, strong: 0, partial: 0, unlinked: 0,
    candidatesCreated: 0, eventLinks: 0, relationshipLinks: 0, reasons: {} };
  const candidateResults: Array<{ url: string; status: string; reason?: string }> = discovery.rejected.map((item) => ({ url: item.url, status: "REJECTED_SECURITY", reason: item.reason }));
  const fresh = rankCandidateUrls(discovery.discovered.filter((url) => {
    if (seen.has(url)) { duplicates++; return false; }
    return true;
  }), query.targetSourceType || "institutional_repository");
  const configuration = await loadPersonalityConfiguration(run.personality_id);
  let coverageBefore: Awaited<ReturnType<typeof loadPersonalityCoverage>>["coverage"] | null = null;
  let familyCountBefore: number | null = null;
  const aliases = [configuration.canonicalName, ...configuration.aliases.filter((item) => !item.isAmbiguous).map((item) => item.alias)];
  const fieldsResult = query.fieldIds.length ? await supabaseAdmin.from("parameter_fields").select("id,label").in("id", query.fieldIds) : null;
  const labelById = new Map((fieldsResult?.data || []).map((field) => [field.id, field.label]));
  const queue = fresh.slice(0, 6).map((url) => ({ url, depth: 0 }));
  const fallback = fresh.slice(6, 10);
  queue.forEach(({ url }) => seen.add(url));
  const priorExplored = Math.max((run.discovered_candidates || []).length,
    (run.query_reports || []).reduce((sum, item) => sum + Number(item.pagesExplored || 0), 0));
  let previewRequests = 0;
  let previewBytes = 0;
  const fetchBudgetedPreview = async (url: string) => {
    if (previewRequests >= EXPLORATION_BUDGET.maxPagesPerQuery
      || previewBytes + EXPLORATION_BUDGET.maxPreviewBytesPerPage > EXPLORATION_BUDGET.maxTotalPreviewBytesPerQuery)
      throw new CorpusError("CONTENT_TOO_LARGE", "Discovery preview budget exhausted.", 413);
    previewRequests++;
    const preview = await fetchDiscoveryPreview(url);
    previewBytes += new TextEncoder().encode(preview.html).byteLength;
    return preview;
  };
  for (let index = 0; index < queue.length && index < EXPLORATION_BUDGET.maxPagesPerQuery
    && priorExplored + index < EXPLORATION_BUDGET.maxPagesPerRun && previewRequests < EXPLORATION_BUDGET.maxPagesPerQuery; index++) {
    const { url, depth: linkDepth } = queue[index];
    const linkedBefore = linkedCount;
    if ((await getExpansionRun(runId)).status !== "running") break;
    pagesExplored++;
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, EXPLORATION_BUDGET.requestDelayMs));
    try {
      const result = await verifyAndAdmitCandidate({ runId, url, aliases, rules,
        autoAdmit: process.env.ADAPTIVE_AUTO_ADMIT !== "false", parameterCode: query.parameterCode,
        fetchPreview: fetchBudgetedPreview });
      const verification: Verification = result.verification;
      rules = result.rules;
      for (const child of result.linkedCandidates) {
        if (!mayExploreChild(linkDepth, queue.length, priorExplored + queue.length) || seen.has(child)) break;
        seen.add(child); queue.push({ url: child, depth: linkDepth + 1 }); linkedCount++;
      }
      candidateResults.push({ url: verification.canonical_url, status: verification.verification_status, reason: verification.verification_reason });
      if (verification.verification_status === "BIBLIOGRAPHIC_ONLY") { bibliographic++; continue; }
      if (verification.verification_status !== "APPROVED_FOR_EVIDENCE") { rejected++; continue; }
      if (!coverageBefore) {
        coverageBefore = (await loadPersonalityCoverage(run.personality_id)).coverage;
        const familyCount = await supabaseAdmin.from("verified_source_families").select("id", { count: "exact", head: true });
        if (familyCount.error) throw familyCount.error;
        familyCountBefore = familyCount.count || 0;
      }
      verified++;
      if (verification.independent_work_key) {
        const key = verification.independent_work_key;
        if (!workKeys.has(key)) {
          const [priorCandidate, priorSource] = await Promise.all([
            supabaseAdmin.from("research_candidates").select("canonical_url,run_id").eq("independent_work_key", key)
              .eq("verification_status", "APPROVED_FOR_EVIDENCE").limit(10),
            supabaseAdmin.from("sources").select("id").contains("metadata", { independentWorkKey: key }).limit(1),
          ]);
          if (priorCandidate.error || priorSource.error) throw priorCandidate.error || priorSource.error;
          const priorWork = (priorCandidate.data || []).some((item) => item.run_id !== runId || item.canonical_url !== verification.canonical_url);
          if (!priorWork && !priorSource.data?.length) newWorkKeys.add(key);
        }
        workKeys.add(key);
      }
      if (verification.source_type === "scholarly_article") scholarlySources++;
      const promoted = await promoteVerifiedFamily(verification, fetchBudgetedPreview);
      if (promoted && result.linkedCandidates.length === 0 && mayExploreChild(linkDepth, queue.length, priorExplored + queue.length)) {
        const { data: familyRows } = await supabaseAdmin.from("verified_source_families")
          .select("domain,path_prefix").eq("domain", verification.domain);
        const scope = (familyRows || []).find((item) => new URL(verification.canonical_url).pathname.startsWith(item.path_prefix));
        if (scope) {
          const preview = await fetchBudgetedPreview(verification.canonical_url).catch(() => null);
          for (const child of preview ? scopedNavigationLinks(preview.html, preview.finalUrl, scope, aliases) : []) {
            if (!mayExploreChild(linkDepth, queue.length, priorExplored + queue.length) || seen.has(child)) break;
            seen.add(child); queue.push({ url: child, depth: linkDepth + 1 }); linkedCount++;
          }
        }
      }
      const priorSource = await supabaseAdmin.from("sources").select("id").eq("url", verification.canonical_url).limit(1);
      if (priorSource.error) throw priorSource.error;
      const page = await fetchAndCacheApprovedPage({ url: verification.canonical_url, rules, personalityId: run.personality_id, parameterFieldIds: [], discoveryProvider: "brave" });
      if (!priorSource.data?.length) newSources++;
      if (page.cacheHit) pagesCacheHits++;
      else { pagesFetched++; chunksAdded += page.chunks; primaryPassages += page.primaryPassages; }
      await supabaseAdmin.from("sources").update({ author: verification.author || verification.editor,
        metadata: { origin: "live_cache", discoveryProvider: "brave", verification,
          independentWorkKey: verification.independent_work_key, sourceFamily: verification.source_family },
      }).eq("id", page.sourceId).eq("approval_origin", "verified_auto");
      await tagMatchingFields(page.sourceId, query.fieldIds, query.fieldIds.map((id) => labelById.get(id) || ""));
      await linkVerifiedPassages(page.sourceId, run.personality_id, aliases, verification);
      const linked = await linkIngestedEvidence(page.sourceId, run.personality_id, aliases);
      integration.exact += linked.exact; integration.strong += linked.strong; integration.partial += linked.partial;
      integration.unlinked += linked.unlinked;
      integration.candidatesCreated += linked.candidatesCreated;
      integration.eventLinks += linked.eventLinks;
      integration.relationshipLinks += linked.relationshipLinks;
      for (const [reason, count] of Object.entries(linked.reasons)) integration.reasons[reason] = (integration.reasons[reason] || 0) + count;
    } catch (error) { rejected++; candidateResults.push({ url, status: "REJECTED_UNVERIFIABLE", reason: error instanceof Error ? error.message : "Verification or ingestion failed" }); }
    finally {
      if (linkedCount === linkedBefore && fallback.length && queue.length < EXPLORATION_BUDGET.maxPagesPerQuery
        && priorExplored + queue.length < EXPLORATION_BUDGET.maxPagesPerRun) {
        const next = fallback.shift()!;
        if (!seen.has(next)) { seen.add(next); queue.push({ url: next, depth: 0 }); }
      }
    }
  }
  const current = await getExpansionRun(runId);
  let coverageDelta = { exactClaims: 0, corroboratedClaims: 0, independentWorks: 0, depthAreasImproved: 0 };
  let newFamilies = 0;
  if (coverageBefore) {
    const [after, familyCount] = await Promise.all([
      loadPersonalityCoverage(run.personality_id),
      supabaseAdmin.from("verified_source_families").select("id", { count: "exact", head: true }),
    ]);
    if (familyCount.error) throw familyCount.error;
    const before = coverageBefore.overall;
    const afterOverall = after.coverage.overall;
    const stateRank = { EMPTY: 0, THIN: 1, BASIC: 2, CONTESTED: 2, GOOD: 3, DEEP: 4 };
    const beforeDepth = evaluateDepth(coverageBefore.parameters);
    const afterDepth = evaluateDepth(after.coverage.parameters);
    const beforeAreas = new Map(beforeDepth.areas.map((area) => [area.code, stateRank[area.state]]));
    coverageDelta = { exactClaims: Math.max(0, afterOverall.claimsWithExactPassages - before.claimsWithExactPassages),
      corroboratedClaims: Math.max(0, afterOverall.claimsWithIndependentCorroboration - before.claimsWithIndependentCorroboration),
      independentWorks: Math.max(0, afterOverall.independentWorks - before.independentWorks),
      depthAreasImproved: afterDepth.areas.filter((area) => stateRank[area.state] > (beforeAreas.get(area.code) || 0)).length };
    newFamilies = Math.max(0, (familyCount.count || 0) - (familyCountBefore || 0));
  }
  const searchCalls = current.search_calls + discovery.calls;
  const performance = { ...(current.strategy_performance || {}) };
  const previous = performance[query.strategy] || { attempts: 0, credible: 0, newWorks: 0, exactLinks: 0 };
  performance[query.strategy] = { attempts: previous.attempts + 1, credible: previous.credible + verified,
    newWorks: previous.newWorks + newWorkKeys.size, exactLinks: previous.exactLinks + coverageDelta.exactClaims };
  const batchEnd = current.next_query_index % 5 === 0 || current.next_query_index >= current.queries.length || searchCalls >= current.max_search_requests;
  let depth = current.depth_report;
  let independentWorks = current.independent_works;
  let exactClaimLinks = current.exact_claim_links;
  let queries = current.queries;
  let saturated = current.saturated_steps;
  let stopReason: string | null = null;
  let roundReports = current.round_reports || [];
  if (batchEnd) {
    const candidateDomains = [...(current.discovered_candidates || []), ...candidateResults]
      .filter((item) => item.status !== "REJECTED_LOW_QUALITY" && item.status !== "REJECTED_SECURITY")
      .flatMap((item) => { try { return [new URL(item.url).hostname]; } catch { return []; } })
      .filter((domain) => /\.(edu|gov|ac\.[a-z]{2})$|journal|press|archive|repository|university/i.test(domain))
      .slice(-10);
    const { data: bibliographicRows } = await supabaseAdmin.from("research_candidates")
      .select("title,author,publication_year").eq("run_id", runId).eq("verification_status", "BIBLIOGRAPHIC_ONLY").limit(5);
    const candidateWorks = (bibliographicRows || []).filter((item) => Boolean(item.title))
      .map((item) => ({ title: item.title as string, author: item.author, year: item.publication_year }));
    const nextPlan = await previewExpansion(run.personality_id, current.max_search_requests, [...new Set(candidateDomains)].slice(0, 2), performance, candidateWorks);
    depth = nextPlan.depth;
    independentWorks = nextPlan.coverage.independentWorks;
    exactClaimLinks = nextPlan.coverage.claimsWithExactPassages;
    const used = new Set(current.queries.map((item) => item.query.toLowerCase()));
    const nextQueries = nextPlan.queries.filter((item) => !used.has(item.query.toLowerCase())).slice(0, 5);
    queries = [...current.queries, ...nextQueries];
    const previousChunks = Number(roundReports.reduce((sum, item) => sum + Number(item.chunksAdded || 0), 0));
    const roundChunks = current.chunks_added + chunksAdded - previousChunks;
    const roundCredible = current.verified_sources + verified - Number(roundReports.reduce((sum, item) => sum + Number(item.credible || 0), 0));
    const roundCandidates = current.candidate_urls + discovery.candidates + linkedCount - Number(roundReports.reduce((sum, item) => sum + Number(item.candidates || 0), 0));
    const roundRejected = current.rejected_urls + rejected - Number(roundReports.reduce((sum, item) => sum + Number(item.rejected || 0), 0));
    const roundBibliographic = current.bibliographic_sources + bibliographic - Number(roundReports.reduce((sum, item) => sum + Number(item.bibliographic || 0), 0));
    const roundPages = current.pages_fetched + pagesFetched - Number(roundReports.reduce((sum, item) => sum + Number(item.pagesFetched || 0), 0));
    const roundPrimary = current.primary_passages + primaryPassages - Number(roundReports.reduce((sum, item) => sum + Number(item.primaryPassages || 0), 0));
    const roundScholarly = current.scholarly_sources + scholarlySources - Number(roundReports.reduce((sum, item) => sum + Number(item.scholarlySources || 0), 0));
    saturated = roundChunks === 0 && roundCredible === 0 ? current.saturated_steps + 1 : 0;
    roundReports = [...roundReports, { round: roundReports.length + 1, searches: Math.min(5, current.next_query_index - roundReports.length * 5),
      candidates: roundCandidates, credible: roundCredible, bibliographic: roundBibliographic, rejected: roundRejected, pagesFetched: roundPages,
      primaryPassages: roundPrimary, scholarlySources: roundScholarly, exactClaimLinks,
      chunksAdded: roundChunks, depth: nextPlan.depth.overall, weakAreas: nextPlan.depth.weakAreas.map((area) => area.name) }];
    stopReason = adaptiveStopReason({ sufficient: Boolean(depth.sufficient),
      saturatedBatches: strategiesExhausted(performance) ? saturated : 0,
      searchCalls, maxSearchRequests: current.max_search_requests, hasNextQuery: nextQueries.length > 0 });
    if (!stopReason && current.mode === "guided") stopReason = "guided_batch";
  }
  const nextStatus = discovery.errorCategory ? "stopped" : stopReason === "guided_batch" ? "stopped" : stopReason ? "complete" : "running";
  const previousIntegration = current.integration_report || { exact: 0, strong: 0, partial: 0, unlinked: 0,
    candidatesCreated: 0, eventLinks: 0, relationshipLinks: 0, reasons: {} };
  const integrationReport: IntegrationReport = { exact: previousIntegration.exact + integration.exact,
    strong: previousIntegration.strong + integration.strong, partial: previousIntegration.partial + integration.partial,
    unlinked: previousIntegration.unlinked + integration.unlinked,
    candidatesCreated: (previousIntegration.candidatesCreated || 0) + integration.candidatesCreated,
    eventLinks: (previousIntegration.eventLinks || 0) + integration.eventLinks,
    relationshipLinks: (previousIntegration.relationshipLinks || 0) + integration.relationshipLinks,
    reasons: { ...previousIntegration.reasons } };
  for (const [reason, count] of Object.entries(integration.reasons)) integrationReport.reasons[reason] = (integrationReport.reasons[reason] || 0) + count;
  const { data, error } = await supabaseAdmin.from("external_research_runs").update({
    status: nextStatus,
    stop_reason: discovery.errorCategory ? "provider_error" : stopReason,
    queries, depth_report: depth, round_reports: roundReports,
    search_calls: searchCalls, cache_hits: current.cache_hits + discovery.cacheHits,
    candidate_urls: current.candidate_urls + discovery.candidates + linkedCount, accepted_urls: current.accepted_urls + verified,
    rejected_urls: current.rejected_urls + rejected, pages_fetched: current.pages_fetched + pagesFetched,
    pages_cache_hits: current.pages_cache_hits + pagesCacheHits, chunks_added: current.chunks_added + chunksAdded,
    verified_sources: current.verified_sources + verified, bibliographic_sources: current.bibliographic_sources + bibliographic,
    independent_works: independentWorks,
    primary_passages: current.primary_passages + primaryPassages, scholarly_sources: current.scholarly_sources + scholarlySources,
    exact_claim_links: exactClaimLinks,
    duplicate_urls: current.duplicate_urls + duplicates, saturated_steps: saturated,
    strategy_performance: performance, integration_report: integrationReport,
    query_reports: [...(current.query_reports || []), { query: query.query, strategy: query.strategy,
      targetSourceType: query.targetSourceType, parameterCode: query.parameterCode,
      expectedKnowledgeGain: query.expectedKnowledgeGain, paidCalls: discovery.calls,
      cacheHits: discovery.cacheHits, candidates: discovery.candidates, pagesExplored, credible: verified,
      works: workKeys.size, newWorks: newWorkKeys.size, newFamilies, newIndependentSources: newSources,
      bibliographic, pages: pagesFetched, chunks: chunksAdded, exactLinks: integration.exact,
      strongLinks: integration.strong, partialLinks: integration.partial, unlinked: integration.unlinked,
      newEvidence: chunksAdded + integration.exact + integration.strong + integration.partial,
      coverageDelta, knowledgeGainPerPaidCall: discovery.calls ? Number(((newFamilies * 8 + newWorkKeys.size * 5
        + coverageDelta.exactClaims * 4 + coverageDelta.corroboratedClaims * 3 + coverageDelta.depthAreasImproved * 10
        + Math.min(5, chunksAdded / 10)) / discovery.calls).toFixed(2)) : 0,
      candidatesCreated: integration.candidatesCreated, eventLinks: integration.eventLinks,
      relationshipLinks: integration.relationshipLinks }].slice(-50),
    seen_urls: [...seen], error_category: discovery.errorCategory, updated_at: new Date().toISOString(),
    discovered_candidates: [...(current.discovered_candidates || []), ...candidateResults].slice(-100),
  }).eq("id", runId).select("*").single();
  if (error) throw new CorpusError("DATABASE_FAILED", "Expansion progress could not be saved.", 500, { cause: error });
  return data as Run;
}
