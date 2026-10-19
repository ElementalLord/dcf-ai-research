import { pruneExpiredCache } from "@/lib/corpus/cache-prune";
import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { BraveSearchProvider, WebSearchError, groupSearchResultsByWork, normalizeSearchQuery, type WebSearchProvider, type WebSearchResult } from "./web-search-provider";
import { canonicalResearchUrl, selectSourceAuthorization, type SourceAccessRule } from "./source-policy";
import { searchPolicyDecision, type SearchPolicy } from "./search-policy";
import { sourcePriority } from "./search-credibility";

export type WebDiscovery = {
  discovered: string[];
  workGroups: string[][];
  accepted: string[];
  rejected: Array<{ url: string; reason: string }>;
  candidates: number;
  calls: number;
  cacheHits: number;
  latencyMs: number;
  errorCategory: string | null;
};

const defaultProvider = new BraveSearchProvider();
export function webSearchProvider(): WebSearchProvider { return defaultProvider; }

export async function cachedWebSearch(query: string, provider: WebSearchProvider = defaultProvider, maxResults = 10) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return { results: [] as WebSearchResult[], calls: 0, cacheHits: 0 };
  // Standard Brave API rights permit only transient operational use. Never persist its
  // result titles, URLs, or snippets unless the account explicitly has storage rights.
  if (provider.name === "brave" && process.env.BRAVE_SEARCH_STORAGE_RIGHTS !== "true") {
    if (!provider.isConfigured()) throw new WebSearchError("NOT_CONFIGURED");
    return { results: await provider.search(normalized, { maxResults }), calls: 1, cacheHits: 0 };
  }
  // A cache miss must remain usable when Brave is unconfigured; cache reads are still useful.
  const { data, error } = await supabaseAdmin.from("web_search_cache")
    .select("results,expires_at,hit_count")
    .eq("provider", provider.name).eq("normalized_query", normalized).maybeSingle();
  if (error) throw new Error("WEB_SEARCH_CACHE_UNAVAILABLE");
  if (data && new Date(data.expires_at).getTime() > Date.now() && Array.isArray(data.results)) {
    await supabaseAdmin.from("web_search_cache").update({ hit_count: data.hit_count + 1 }).eq("provider", provider.name).eq("normalized_query", normalized);
    return { results: data.results as WebSearchResult[], calls: 0, cacheHits: 1 };
  }
  if (!provider.isConfigured()) throw new WebSearchError("NOT_CONFIGURED");
  const results = await provider.search(normalized, { maxResults });
  const { error: saveError } = await supabaseAdmin.from("web_search_cache").upsert({
    provider: provider.name, normalized_query: normalized,
    // The snippet is discovery metadata only and is never passed to ingestion or retrieval.
    results, created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), hit_count: 0,
  }, { onConflict: "provider,normalized_query" });
  if (saveError) throw new Error("WEB_SEARCH_CACHE_UNAVAILABLE");
  await pruneExpiredCache("web_search_cache");
  return { results, calls: 1, cacheHits: 0 };
}

export async function discoverWebCandidates(query: string, rules: SourceAccessRule[], options: { provider?: WebSearchProvider; maxResults?: number; searchPolicy?: SearchPolicy } = {}): Promise<WebDiscovery> {
  const started = Date.now();
  const provider = options.provider || defaultProvider;
  const empty: WebDiscovery = { discovered: [], workGroups: [], accepted: [], rejected: [], candidates: 0, calls: 0, cacheHits: 0, latencyMs: 0, errorCategory: null };
  try {
    const result = await cachedWebSearch(query, provider, options.maxResults || 10);
    const accepted = new Set<string>();
    const discovered = new Set<string>();
    const rejected: WebDiscovery["rejected"] = [];
    for (const candidate of result.results) {
      try {
        const canonical = canonicalResearchUrl(candidate.url);
        if (new URL(canonical).protocol !== "https:") {
          rejected.push({ url: canonical, reason: "HTTPS_REQUIRED" });
          continue;
        }
        if (sourcePriority(canonical, `${candidate.title} ${candidate.snippet || ""}`, query) < 0) {
          rejected.push({ url: canonical, reason: "LOW_QUALITY_SOURCE" });
          continue;
        }
        discovered.add(canonical);
        if (options.searchPolicy) {
          const decision = searchPolicyDecision(canonical, options.searchPolicy);
          if (decision.allowed) accepted.add(canonical);
          else rejected.push({ url: canonical, reason: decision.reason });
        } else if (selectSourceAuthorization(canonical, rules, "fetch", true)) accepted.add(canonical);
      } catch {
        rejected.push({ url: candidate.url, reason: "UNSAFE_URL" });
      }
    }
    const workGroups = groupSearchResultsByWork(result.results).map((group) => group.flatMap((url) => {
      try { const canonical = canonicalResearchUrl(url); return discovered.has(canonical) ? [canonical] : []; } catch { return []; }
    })).filter((group) => group.length);
    const ranked = [...accepted].sort((left, right) => {
      const a = result.results.find((item) => { try { return canonicalResearchUrl(item.url) === left; } catch { return false; } });
      const b = result.results.find((item) => { try { return canonicalResearchUrl(item.url) === right; } catch { return false; } });
      return sourcePriority(right, `${b?.title || ""} ${b?.snippet || ""}`, query) - sourcePriority(left, `${a?.title || ""} ${a?.snippet || ""}`, query);
    });
    return { discovered: [...discovered], workGroups, accepted: ranked, rejected, candidates: result.results.length, calls: result.calls, cacheHits: result.cacheHits, latencyMs: Date.now() - started, errorCategory: null };
  } catch (error) {
    return { ...empty, calls: error instanceof WebSearchError && error.attempted ? 1 : 0, latencyMs: Date.now() - started, errorCategory: error instanceof WebSearchError ? error.category : "PROVIDER_ERROR" };
  }
}
