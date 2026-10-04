export type SearchOptions = { maxResults?: number; domain?: string };
export type WebSearchResult = { title: string; url: string; snippet?: string; sourceProvider: string };
export interface WebSearchProvider {
  readonly name: string;
  isConfigured(): boolean;
  search(query: string, options?: SearchOptions): Promise<WebSearchResult[]>;
}

export type WebSearchErrorCategory = "NOT_CONFIGURED" | "AUTH_ERROR" | "RATE_LIMIT" | "QUOTA_EXHAUSTED" | "TIMEOUT" | "PROVIDER_ERROR" | "INVALID_RESPONSE";
export class WebSearchError extends Error {
  constructor(readonly category: WebSearchErrorCategory, readonly attempted = false) { super(category); }
}

export function normalizeSearchQuery(query: string): string {
  return query.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function normalizeWebResults(payload: unknown, maxResults: number): WebSearchResult[] {
  if (!payload || typeof payload !== "object") throw new WebSearchError("INVALID_RESPONSE");
  const response = payload as { query?: unknown; type?: unknown; web?: { results?: unknown } | null };
  // Brave documents web as nullable. A valid search can have no web results.
  if (response.web == null && response.query && response.type) return [];
  const web = response.web;
  if (!web || !Array.isArray(web.results)) throw new WebSearchError("INVALID_RESPONSE");
  const seen = new Set<string>();
  const output: WebSearchResult[] = [];
  for (const raw of web.results) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.url !== "string" || typeof item.title !== "string") continue;
    let url: URL;
    try { url = new URL(item.url); } catch { continue; }
    if (!(["https:", "http:"].includes(url.protocol)) || url.username || url.password) continue;
    url.hash = "";
    const canonical = url.toString();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    output.push({ title: item.title.slice(0, 500), url: canonical, snippet: typeof item.description === "string" ? item.description.slice(0, 1000) : undefined, sourceProvider: "brave" });
    if (output.length >= maxResults) break;
  }
  return output;
}

export class BraveSearchProvider implements WebSearchProvider {
  readonly name = "brave";
  private cooldownUntil = 0;
  private rateFailures = 0;
  constructor(private readonly key: string | undefined = process.env.BRAVE_SEARCH_API_KEY, private readonly fetchImpl: typeof fetch = fetch) {}
  isConfigured() { return Boolean(this.key?.trim()); }
  async search(query: string, options: SearchOptions = {}): Promise<WebSearchResult[]> {
    if (!this.isConfigured()) throw new WebSearchError("NOT_CONFIGURED");
    if (Date.now() < this.cooldownUntil) throw new WebSearchError("RATE_LIMIT");
    const maxResults = Math.max(1, Math.min(20, Math.floor(options.maxResults || 10)));
    const domain = options.domain && /^[a-z0-9.-]+$/i.test(options.domain) ? options.domain : null;
    const q = `${domain ? `site:${domain} ` : ""}${query.trim()}`.slice(0, 600);
    if (!q.trim()) throw new WebSearchError("INVALID_RESPONSE");
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", q);
    url.searchParams.set("count", String(maxResults));
    try {
      const response = await this.fetchImpl(url, { headers: { Accept: "application/json", "X-Subscription-Token": this.key as string }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
      if (response.status === 401 || response.status === 403) throw new WebSearchError("AUTH_ERROR");
      if (response.status === 429) {
        this.rateFailures += 1;
        if (this.rateFailures >= 2) this.cooldownUntil = Date.now() + 5 * 60_000;
        const detail = await response.text().catch(() => "");
        throw new WebSearchError(/quota|exhausted|monthly limit/i.test(detail) ? "QUOTA_EXHAUSTED" : "RATE_LIMIT");
      }
      if (!response.ok) throw new WebSearchError("PROVIDER_ERROR");
      const payload: unknown = await response.json().catch(() => { throw new WebSearchError("INVALID_RESPONSE"); });
      this.rateFailures = 0;
      return normalizeWebResults(payload, maxResults);
    } catch (error) {
      if (error instanceof WebSearchError) throw new WebSearchError(error.category, true);
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new WebSearchError("TIMEOUT", true);
      throw new WebSearchError("PROVIDER_ERROR", true);
    }
  }
}

export class MockWebSearchProvider implements WebSearchProvider {
  readonly name = "mock";
  readonly calls: string[] = [];
  constructor(private readonly results: WebSearchResult[] = []) {}
  isConfigured() { return true; }
  async search(query: string, options: SearchOptions = {}) {
    this.calls.push(query);
    return this.results.slice(0, options.maxResults || 10);
  }
}
