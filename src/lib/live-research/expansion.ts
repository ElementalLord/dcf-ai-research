import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadPersonalityConfiguration } from "@/lib/corpus/personality-context";
import { loadPersonalityCoverage } from "@/lib/corpus/onboarding";
import { normalizeForMatch } from "@/lib/corpus/text";
import { CorpusError } from "@/lib/corpus/errors";
import { fetchAndCacheApprovedPage } from "./cache";
import { loadActiveSourceRules } from "./source-registry";
import { buildExpansionQueries, rankCoverageGaps, type Gap, type PlannedQuery } from "./expansion-plan";
import { discoverWebCandidates, webSearchProvider } from "./web-search";
import { canResumeExpansion, nextExpansionStatus } from "./expansion-run-policy";

type Run = {
  id: string; personality_id: string; status: string; queries: PlannedQuery[];
  next_query_index: number; max_search_requests: number; search_calls: number; cache_hits: number;
  candidate_urls: number; accepted_urls: number; rejected_urls: number; pages_fetched: number;
  pages_cache_hits: number; chunks_added: number; duplicate_urls: number; saturated_steps: number;
  seen_urls: string[]; error_category: string | null;
  discovered_candidates: Array<{ url: string; status: "accepted" | "rejected"; reason?: string }>;
};

export async function previewExpansion(personalityId: string, maxSearchRequests = 25) {
  const max = Math.max(1, Math.min(100, maxSearchRequests));
  const configuration = await loadPersonalityConfiguration(personalityId);
  const [coverageResult, rules, fieldsResult, sourceResult, relationshipResult, eventResult] = await Promise.all([
    loadPersonalityCoverage(personalityId), loadActiveSourceRules(),
    supabaseAdmin.from("parameters").select("id,code,parameter_fields(id,label)").eq("category_id", configuration.categoryId).limit(500),
    supabaseAdmin.from("source_personalities").select("sources(title)").eq("personality_id", personalityId).limit(50),
    supabaseAdmin.from("relationships").select("object_name,relationship_type").eq("subject_personality_id", personalityId).limit(30),
    supabaseAdmin.from("event_personalities").select("events(title)").eq("personality_id", personalityId).limit(30),
  ]);
  const dbError = [fieldsResult, sourceResult, relationshipResult, eventResult].find((item) => item.error)?.error;
  if (dbError) throw new CorpusError("DATABASE_FAILED", "Expansion metadata could not be loaded.", 500, { cause: dbError });
  const fieldsByCode = new Map((fieldsResult.data || []).map((row) => [row.code, row.parameter_fields || []]));
  const gaps: Gap[] = coverageResult.coverage.parameters.map((parameter) => ({
    name: parameter.name, code: parameter.code, sourceChunks: parameter.sourceChunks,
    uniqueEvidenceSources: parameter.uniqueEvidenceSources,
    claimsWithExactPassages: parameter.claimsWithExactPassages, approvedClaims: parameter.approvedClaims,
    fields: (fieldsByCode.get(parameter.code) || []).map((field) => ({ id: field.id, label: field.label })),
  }));
  const unwrap = (value: unknown): Record<string, unknown> | null => Array.isArray(value) ? (value[0] || null) : value && typeof value === "object" ? value as Record<string, unknown> : null;
  const titles = (sourceResult.data || []).map((row) => String(unwrap(row.sources)?.title || "")).filter(Boolean);
  const relationships = (relationshipResult.data || []).map((row) => String(row.object_name || row.relationship_type || "")).filter(Boolean);
  const events = (eventResult.data || []).map((row) => String(unwrap(row.events)?.title || "")).filter(Boolean);
  const domains = [...new Set(rules.filter((rule) => rule.allow_live_search && rule.allow_live_fetch && rule.evidence_use_status === "approved" && rule.scope_type === "DOMAIN").map((rule) => rule.domain))];
  const searchableScopes = rules.filter((rule) => rule.allow_live_search && rule.allow_live_fetch && rule.evidence_use_status === "approved");
  const queries = buildExpansionQueries({ name: configuration.canonicalName, aliases: configuration.aliases.filter((item) => !item.isAmbiguous).map((item) => item.alias), gaps, sourceTitles: titles, relationships, events, domains }, max);
  return {
    personality: coverageResult.personality,
    provider: webSearchProvider().name,
    configured: webSearchProvider().isConfigured(),
    coverage: coverageResult.coverage.overall,
    weakAreas: rankCoverageGaps(gaps).slice(0, 10),
    queries,
    estimatedSearchRequests: queries.length,
    maxSearchRequests: max,
    policyNote: searchableScopes.some((rule) => rule.scope_type !== "EXACT_URL")
      ? null : "Only exact URLs are currently approved for search. New Brave discoveries will be listed for review but cannot be ingested until a matching scope is approved.",
  };
}

export async function createExpansionRun(personalityId: string, maxSearchRequests = 25) {
  const plan = await previewExpansion(personalityId, maxSearchRequests);
  if (!plan.configured) throw new CorpusError("SEARCH_PROVIDER_FAILED", "Brave Search is not configured.", 503);
  const { data, error } = await supabaseAdmin.from("external_research_runs").insert({
    personality_id: personalityId, provider: plan.provider, status: "running",
    queries: plan.queries, max_search_requests: plan.maxSearchRequests,
  }).select("*").single();
  if (error) throw new CorpusError("DATABASE_FAILED", "The expansion run could not be created.", 500, { cause: error });
  return data as Run;
}

export async function setExpansionStatus(runId: string, status: "running" | "stopped") {
  if (status === "running") {
    const current = await getExpansionRun(runId);
    if (!canResumeExpansion({ status: current.status, nextQueryIndex: current.next_query_index, queryCount: current.queries.length, searchCalls: current.search_calls, maxSearchRequests: current.max_search_requests })) {
      throw new CorpusError("INVALID_INPUT", "The run is complete or has no search budget remaining.", 409);
    }
  }
  const { data, error } = await supabaseAdmin.from("external_research_runs").update({ status, updated_at: new Date().toISOString() }).eq("id", runId).in("status", ["running", "stopped"]).select("*").single();
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

export async function stepExpansion(runId: string) {
  const run = await getExpansionRun(runId);
  if (run.status !== "running") return run;
  if (run.next_query_index >= run.queries.length || run.search_calls >= run.max_search_requests || run.saturated_steps >= 3) {
    const { data } = await supabaseAdmin.from("external_research_runs").update({ status: "complete" }).eq("id", runId).select("*").single();
    return data as Run;
  }
  const query = run.queries[run.next_query_index];
  // Reserve a step before network I/O so a resume never repeats a paid query.
  const { data: reserved, error: reserveError } = await supabaseAdmin.from("external_research_runs")
    .update({ next_query_index: run.next_query_index + 1, updated_at: new Date().toISOString() })
    .eq("id", runId).eq("status", "running").eq("next_query_index", run.next_query_index).select("id");
  if (reserveError || !reserved?.length) return getExpansionRun(runId);
  const rules = await loadActiveSourceRules();
  const discovery = await discoverWebCandidates(query.query, rules, { maxResults: 10 });
  const seen = new Set(run.seen_urls || []);
  let duplicates = 0, pagesFetched = 0, pagesCacheHits = 0, chunksAdded = 0, rejected = discovery.rejected.length;
  const fresh = discovery.accepted.filter((url) => { if (seen.has(url)) { duplicates++; return false; } seen.add(url); return true; });
  const fieldsResult = query.fieldIds.length ? await supabaseAdmin.from("parameter_fields").select("id,label").in("id", query.fieldIds) : null;
  const labelById = new Map((fieldsResult?.data || []).map((field) => [field.id, field.label]));
  for (const url of fresh.slice(0, 2)) {
    if ((await getExpansionRun(runId)).status !== "running") break;
    try {
      const page = await fetchAndCacheApprovedPage({ url, rules, personalityId: run.personality_id, parameterFieldIds: [], discoveryProvider: "brave" });
      if (page.cacheHit) pagesCacheHits++;
      else { pagesFetched++; chunksAdded += page.chunks; }
      await tagMatchingFields(page.sourceId, query.fieldIds, query.fieldIds.map((id) => labelById.get(id) || ""));
    } catch { rejected++; }
  }
  const current = await getExpansionRun(runId);
  const saturated = chunksAdded === 0 ? current.saturated_steps + 1 : 0;
  const nextStatus = nextExpansionStatus({
    current: current.status as "running" | "stopped" | "complete",
    nextQueryIndex: current.next_query_index, queryCount: current.queries.length,
    searchCalls: current.search_calls + discovery.calls, maxSearchRequests: current.max_search_requests,
    saturatedSteps: saturated, errorCategory: discovery.errorCategory,
  });
  const { data, error } = await supabaseAdmin.from("external_research_runs").update({
    status: nextStatus,
    search_calls: current.search_calls + discovery.calls, cache_hits: current.cache_hits + discovery.cacheHits,
    candidate_urls: current.candidate_urls + discovery.candidates, accepted_urls: current.accepted_urls + discovery.accepted.length,
    rejected_urls: current.rejected_urls + rejected, pages_fetched: current.pages_fetched + pagesFetched,
    pages_cache_hits: current.pages_cache_hits + pagesCacheHits, chunks_added: current.chunks_added + chunksAdded,
    duplicate_urls: current.duplicate_urls + duplicates, saturated_steps: saturated,
    seen_urls: [...seen], error_category: discovery.errorCategory, updated_at: new Date().toISOString(),
    discovered_candidates: [...(current.discovered_candidates || []), ...discovery.accepted.map((url) => ({ url, status: "accepted" as const })), ...discovery.rejected.map((item) => ({ url: item.url, status: "rejected" as const, reason: item.reason }))].slice(-100),
  }).eq("id", runId).select("*").single();
  if (error) throw new CorpusError("DATABASE_FAILED", "Expansion progress could not be saved.", 500, { cause: error });
  return data as Run;
}
