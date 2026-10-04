export type ProviderErrorCategory = "QUOTA_EXHAUSTED" | "RATE_LIMIT" | "TIMEOUT" | "AUTH_CONFIGURATION" | "MODEL_UNAVAILABLE" | "TRANSIENT" | "INVALID_RESPONSE";

export function classifyProviderError(error: unknown): ProviderErrorCategory {
  if (error instanceof Error && error.name === "CorpusError" && error.cause) return classifyProviderError(error.cause);
  const seen = new Set<unknown>();
  function detail(value: unknown): string {
    if (!value || seen.has(value)) return "";
    seen.add(value);
    if (value instanceof Error) return `${value.message} ${detail(value.cause)}`;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
  const text = detail(error).toLowerCase();
  if (/quota|resource_exhausted/.test(text)) return "QUOTA_EXHAUSTED";
  if (/429|rate.?limit/.test(text)) return "RATE_LIMIT";
  if (/timeout|timed out|abort/.test(text)) return "TIMEOUT";
  if (/401|403|api.?key|unauth|permission|not configured|invalid_argument/.test(text)) return "AUTH_CONFIGURATION";
  if (/404|model.*(?:unavailable|not found|unsupported)/.test(text)) return "MODEL_UNAVAILABLE";
  if (/50[0234]|unavailable|network|fetch failed/.test(text)) return "TRANSIENT";
  return "INVALID_RESPONSE";
}

export class ProviderCircuit {
  private until = 0;
  private category: ProviderErrorCategory | null = null;
  constructor(private now = () => Date.now()) {}
  state() { return { open: this.now() < this.until, category: this.category, retryAt: this.until || null }; }
  fail(category: ProviderErrorCategory) {
    this.category = category;
    this.until = this.now() + (/QUOTA|RATE_LIMIT|AUTH|MODEL/.test(category) ? 60_000 : 15_000);
  }
  succeed() { this.until = 0; this.category = null; }
}
export const generationCircuit = new ProviderCircuit();
export const embeddingCircuit = new ProviderCircuit();

export async function boundedProviderCall<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Provider timeout")); }, timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
