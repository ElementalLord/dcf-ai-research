export type ProviderErrorCategory = "QUOTA_EXHAUSTED" | "RATE_LIMIT" | "TIMEOUT" | "AUTH_CONFIGURATION" | "MODEL_UNAVAILABLE" | "TRANSIENT" | "INVALID_REQUEST" | "CONTEXT_LIMIT" | "SDK_MISMATCH" | "EMPTY_RESPONSE" | "CITATION_VALIDATION" | "INVALID_RESPONSE";

export function providerErrorDetails(error: unknown): { category: ProviderErrorCategory; errorClass: string; httpStatus: number | null; providerCode: string | null } {
  const underlying = error instanceof Error && error.name === "CorpusError" && error.cause ? error.cause : error;
  const value = underlying && typeof underlying === "object" ? underlying as Record<string, unknown> : {};
  const message = underlying instanceof Error ? underlying.message : String(underlying);
  let body: { error?: { code?: number; status?: string } } = {};
  try { body = JSON.parse(message); } catch { /* SDK errors are not always JSON. */ }
  const status = Number(value.status || body.error?.code || 0) || null;
  return {
    category: classifyProviderError(error),
    errorClass: underlying instanceof Error ? underlying.name : typeof underlying,
    httpStatus: status,
    providerCode: typeof body.error?.status === "string" ? body.error.status : typeof value.code === "string" ? value.code : null,
  };
}

export function classifyProviderError(error: unknown): ProviderErrorCategory {
  if (error instanceof Error && error.name === "CorpusError" && error.cause) return classifyProviderError(error.cause);
  const structured = error && typeof error === "object" ? error as Record<string, unknown> : {};
  let response: { error?: { code?: number; message?: string; status?: string } } = {};
  try { response = JSON.parse(error instanceof Error ? error.message : ""); } catch { /* Plain SDK error. */ }
  const httpStatus = Number(structured.status || response.error?.code || 0);
  const seen = new Set<unknown>();
  function detail(value: unknown): string {
    if (!value || seen.has(value)) return "";
    seen.add(value);
    if (value instanceof Error) return `${value.message} ${detail(value.cause)}`;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
  const text = detail(error).toLowerCase();
  if (httpStatus >= 500 && httpStatus <= 504) return "TRANSIENT";
  if (httpStatus === 404) return "MODEL_UNAVAILABLE";
  if (httpStatus === 401 || httpStatus === 403) return "AUTH_CONFIGURATION";
  if (httpStatus === 400) return /token limit|context window|too many tokens|prompt too long/.test(text) ? "CONTEXT_LIMIT" : "INVALID_REQUEST";
  if (/daily quota|quota.exceeded|quota exhausted|generation budget exhausted/.test(text)) return "QUOTA_EXHAUSTED";
  if (/resource_exhausted/.test(text)) return "QUOTA_EXHAUSTED";
  if (/rate.?limit|too_many_requests/.test(text)) return "RATE_LIMIT";
  if (/429/.test(text)) return "RATE_LIMIT";
  if (/timeout|timed out|abort/.test(text)) return "TIMEOUT";
  if (/401|403|api.?key|unauth|permission|not configured/.test(text)) return "AUTH_CONFIGURATION";
  if (/token limit|context window|too many tokens|prompt too long/.test(text)) return "CONTEXT_LIMIT";
  if (/400|invalid.argument|malformed|bad request/.test(text)) return "INVALID_REQUEST";
  if (/sdk|unsupported method|is not a function/.test(text)) return "SDK_MISMATCH";
  if (/404|model.*not found|unsupported model/.test(text)) return "MODEL_UNAVAILABLE";
  if (/50[0234]|high demand|network|fetch failed/.test(text)) return "TRANSIENT";
  if (/provider returned no text|empty response/.test(text)) return "EMPTY_RESPONSE";
  if (/invalid synthesis citations/.test(text)) return "CITATION_VALIDATION";
  return "INVALID_RESPONSE";
}

export class ProviderCircuit {
  private until = 0;
  private category: ProviderErrorCategory | null = null;
  constructor(private now = () => Date.now()) {}
  state() { return { open: this.now() < this.until, category: this.category, retryAt: this.until || null }; }
  fail(category: ProviderErrorCategory, cooldownMs?: number) {
    this.category = category;
    this.until = this.now() + (cooldownMs ?? (/QUOTA|RATE_LIMIT|AUTH|MODEL/.test(category) ? 60_000 : 15_000));
  }
  succeed() { this.until = 0; this.category = null; }
}
export const generationCircuit = new ProviderCircuit();
export const alternateGenerationCircuit = new ProviderCircuit();
export const embeddingCircuit = new ProviderCircuit();
export const googleGroundingCircuit = new ProviderCircuit();

export async function boundedProviderCall<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Provider timeout")); }, timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
