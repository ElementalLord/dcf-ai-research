import { beforeEach, describe, expect, it, vi } from "vitest";
import { BraveSearchProvider, MockWebSearchProvider, WebSearchError, normalizeSearchQuery, normalizeWebResults } from "@/lib/live-research/web-search-provider";
import { buildExpansionQueries, rankCoverageGaps, type Gap } from "@/lib/live-research/expansion-plan";
import { assessEvidenceSufficiency } from "@/lib/live-research/sufficiency";
import { assertRedirectApproved, type SourceAccessRule } from "@/lib/live-research/source-policy";
import { isPrivateIp } from "@/lib/corpus/security";
import { fetchApprovedResource } from "@/lib/live-research/live-fetch";
import { canResumeExpansion, nextExpansionStatus } from "@/lib/live-research/expansion-run-policy";

const state = vi.hoisted(() => ({ row: null as null | { results: unknown[]; expires_at: string; hit_count: number }, writes: 0 }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: {
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }) }) }),
    update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    upsert: async (row: { results: unknown[]; expires_at: string }) => { state.row = { results: row.results, expires_at: row.expires_at, hit_count: 0 }; state.writes++; return { error: null }; },
  }),
} }));

import { cachedWebSearch, discoverWebCandidates } from "@/lib/live-research/web-search";

const rule: SourceAccessRule = { id: "approved", display_name: "Approved", domain: "example.org", scope_type: "DOMAIN", allowed_path_prefix: null, exact_url: null, include_subdomains: false, allow_live_search: true, allow_live_fetch: true, allow_ingestion: true, evidence_use_status: "approved", priority: 1, default_textual_layer: "Primary", default_source_type: "institutional", cache_ttl_hours: 24, is_active: true };
const result = (url: string, snippet = "Untrusted answer") => ({ title: "Page", url, snippet, sourceProvider: "mock" });

beforeEach(() => { state.row = null; state.writes = 0; });

describe("Brave discovery", () => {
  it("keeps a missing key optional and never makes a request", async () => {
    const fetcher = vi.fn();
    const provider = new BraveSearchProvider("", fetcher as unknown as typeof fetch);
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.search("Vishvamitra")).rejects.toMatchObject({ category: "NOT_CONFIGURED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses only Web Search, bounds result count, and normalizes duplicate URLs", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ web: { results: [
      { title: "Primary", url: "https://example.org/a#fragment", description: "search snippet" },
      { title: "Duplicate", url: "https://example.org/a", description: "another" },
      { title: "Unsafe", url: "javascript:alert(1)" },
    ] } }), { status: 200 }));
    const provider = new BraveSearchProvider("test-key", fetcher as typeof fetch);
    const results = await provider.search("Vishvamitra", { maxResults: 200 });
    expect(results).toEqual([{ title: "Primary", url: "https://example.org/a", snippet: "search snippet", sourceProvider: "brave" }]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/res/v1/web/search");
    expect(url.searchParams.get("count")).toBe("20");
    expect(init.headers).toMatchObject({ "X-Subscription-Token": "test-key" });
  });

  it("classifies invalid credentials, rate limits, quota, timeouts, and 5xx without retries", async () => {
    for (const [status, body, category] of [[401, "", "AUTH_ERROR"], [403, "", "AUTH_ERROR"], [429, "slow down", "RATE_LIMIT"], [429, "monthly quota exhausted", "QUOTA_EXHAUSTED"], [503, "", "PROVIDER_ERROR"]] as const) {
      const fetcher = vi.fn(async () => new Response(body, { status }));
      await expect(new BraveSearchProvider("key", fetcher as typeof fetch).search("test")).rejects.toMatchObject({ category });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const timeout = vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); });
    await expect(new BraveSearchProvider("key", timeout as typeof fetch).search("test")).rejects.toMatchObject({ category: "TIMEOUT" });
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(() => normalizeWebResults({}, 10)).toThrow(WebSearchError);
  });

  it("opens a bounded cooldown after repeated rate limits", async () => {
    const fetcher = vi.fn(async () => new Response("slow down", { status: 429 }));
    const provider = new BraveSearchProvider("key", fetcher as typeof fetch);
    await expect(provider.search("first")).rejects.toMatchObject({ category: "RATE_LIMIT" });
    await expect(provider.search("second")).rejects.toMatchObject({ category: "RATE_LIMIT" });
    await expect(provider.search("third")).rejects.toMatchObject({ category: "RATE_LIMIT", attempted: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("caches normalized duplicate queries without another provider call", async () => {
    const provider = new MockWebSearchProvider([result("https://example.org/a")]);
    const first = await cachedWebSearch("Vishvamitra Rigveda", provider);
    const second = await cachedWebSearch(" VISHVAMITRA   RIGVEDA ", provider);
    expect(normalizeSearchQuery(" VISHVAMITRA   RIGVEDA ")).toBe("vishvamitra rigveda");
    expect(first.calls).toBe(1);
    expect(second.cacheHits).toBe(1);
    expect(provider.calls).toHaveLength(1);
    expect(state.writes).toBe(1);
  });

  it("rejects unauthorized candidates and never promotes snippets into evidence", async () => {
    const provider = new MockWebSearchProvider([result("https://example.org/a"), result("https://attacker.test/a"), result("http://127.0.0.1/private")]);
    const found = await discoverWebCandidates("Vishvamitra", [rule], { provider });
    expect(found.accepted).toEqual(["https://example.org/a"]);
    expect(found.rejected).toHaveLength(2);
    expect(JSON.stringify(found)).not.toContain("Untrusted answer");
    expect(() => assertRedirectApproved("https://attacker.test/redirect", [rule])).toThrow();
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
  });

  it("fetches original approved content after discovery and preserves the original URL", async () => {
    const provider = new MockWebSearchProvider([result("https://example.org/original", "false snippet")]);
    const found = await discoverWebCandidates("Vishvamitra", [rule], { provider });
    const fetcher = vi.fn(async () => new Response("<html><body>Original primary passage</body></html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    const fetched = await fetchApprovedResource(found.accepted[0], { rules: [rule], fetchImpl: fetcher as typeof fetch, networkValidator: async (url) => new URL(url) });
    const original = new TextDecoder().decode(fetched.bytes!);
    expect(fetched.finalUrl).toBe("https://example.org/original");
    expect(original).toContain("Original primary passage");
    expect(original).not.toContain("false snippet");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("skips web work when approved local evidence covers the question", () => {
    const provider = new MockWebSearchProvider();
    const local = assessEvidenceSufficiency("Who taught Rama Bala and Atibala?", [{ kind: "passage", id: "p", chunkId: "p", sourceId: "s", text: "Vishvamitra taught Rama Bala and Atibala.", sourceTitle: "Original", sourceAuthor: null, sourceInstitution: null, sourceUrl: "https://example.org/a", sourceType: "primary", sourceStatus: "approved", sectionTitle: null, pageOrSection: null, textualLayer: "EPIC", lexicalScore: 1 }], { personalityAliases: ["Vishvamitra"] });
    expect(local.sufficient).toBe(true);
    expect(provider.calls).toHaveLength(0);
  });
});

describe("bounded expansion planning", () => {
  const gaps: Gap[] = [
    { name: "Textual contribution", code: "textual", sourceChunks: 5, uniqueEvidenceSources: 2, claimsWithExactPassages: 2, approvedClaims: 2, fields: [{ id: "field-1", label: "Rigveda Mandala 3" }] },
    { name: "Lineage", code: "lineage", sourceChunks: 0, uniqueEvidenceSources: 0, claimsWithExactPassages: 0, approvedClaims: 1, fields: [{ id: "field-2", label: "Kaushika lineage" }] },
  ];
  it("prioritizes zero-evidence gaps and only uses supplied metadata", () => {
    expect(rankCoverageGaps(gaps)[0].code).toBe("lineage");
    const queries = buildExpansionQueries({ name: "Vishvamitra", aliases: ["Vishwamitra"], gaps, sourceTitles: ["Rigveda 3.33"], relationships: ["Vasistha"], events: ["Bala Kanda"], domains: ["example.org"] }, 6);
    expect(queries).toHaveLength(6);
    expect(queries[0].query).toBe("Vishvamitra Lineage");
    expect(queries.some((item) => item.query.includes("Kaushika lineage") && item.fieldIds.includes("field-2"))).toBe(true);
    expect(queries.every((item) => !item.query.includes("Menaka"))).toBe(true);
    expect(buildExpansionQueries({ name: "Vishvamitra", aliases: [], gaps, sourceTitles: [], relationships: [], events: [], domains: [] }, 1)).toHaveLength(1);
  });
  it("stops at the hard request limit, pauses on provider failure, and only resumes with budget", () => {
    const base = { current: "running" as const, nextQueryIndex: 2, queryCount: 25, searchCalls: 2, maxSearchRequests: 3, saturatedSteps: 0, errorCategory: null };
    expect(nextExpansionStatus({ ...base, searchCalls: 3 })).toBe("complete");
    expect(nextExpansionStatus({ ...base, saturatedSteps: 3 })).toBe("complete");
    expect(nextExpansionStatus({ ...base, errorCategory: "RATE_LIMIT" })).toBe("stopped");
    expect(nextExpansionStatus({ ...base, current: "stopped" })).toBe("stopped");
    expect(canResumeExpansion({ status: "stopped", nextQueryIndex: 2, queryCount: 25, searchCalls: 2, maxSearchRequests: 3 })).toBe(true);
    expect(canResumeExpansion({ status: "stopped", nextQueryIndex: 2, queryCount: 25, searchCalls: 3, maxSearchRequests: 3 })).toBe(false);
  });
});
