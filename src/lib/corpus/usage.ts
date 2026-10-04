import { AsyncLocalStorage } from "node:async_hooks";
export type RequestUsage = { generativeCalls: number; embeddingCalls: number };
const storage = new AsyncLocalStorage<RequestUsage>();
const metrics: Record<string, number> = {};
export function incrementMetric(name: string) { metrics[name] = (metrics[name] || 0) + 1; }
export function usageMetrics() { return { ...metrics }; }
export function withRequestUsage<T>(operation: (usage: RequestUsage) => Promise<T>): Promise<T> {
  const usage = { generativeCalls: 0, embeddingCalls: 0 };
  return storage.run(usage, () => operation(usage));
}
export function recordAiCall(kind: keyof RequestUsage, options: { transientRetry?: boolean } = {}) {
  const usage = storage.getStore();
  if (usage) {
    if (kind === "generativeCalls" && usage.generativeCalls >= (options.transientRetry ? 2 : 1)) throw new Error("Interactive generation budget exhausted.");
    usage[kind] += 1;
  }
}
