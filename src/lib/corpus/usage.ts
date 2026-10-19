import { AsyncLocalStorage } from "node:async_hooks";
export type RequestUsage = { generativeCalls: number; embeddingCalls: number; modelInputTokens: number; modelOutputTokens: number;
  unmeteredModelCalls: number; researchSearchCalls: number; researchReservationId: string | null;
  researchModelStart: { calls: number; input: number; output: number; unmetered: number } | null;
  researchPricing: { limit: number; search: number; input: number; output: number; fallback: number } | null;
  researchPendingMicro: number; researchActualModelMicro: number };
const storage = new AsyncLocalStorage<RequestUsage>();
const metrics: Record<string, number> = {};
export function incrementMetric(name: string) { metrics[name] = (metrics[name] || 0) + 1; }
export function usageMetrics() { return { ...metrics }; }
export function withRequestUsage<T>(operation: (usage: RequestUsage) => Promise<T>): Promise<T> {
  const usage: RequestUsage = { generativeCalls: 0, embeddingCalls: 0, modelInputTokens: 0, modelOutputTokens: 0,
    unmeteredModelCalls: 0, researchSearchCalls: 0, researchReservationId: null, researchModelStart: null,
    researchPricing: null, researchPendingMicro: 0, researchActualModelMicro: 0 };
  return storage.run(usage, () => operation(usage));
}
export function recordModelTokens(input: number | null | undefined, output: number | null | undefined) {
  const usage = storage.getStore();
  if (!usage) return;
  if (typeof input !== "number" || typeof output !== "number") { usage.unmeteredModelCalls += 1; return; }
  usage.modelInputTokens += Math.max(0, input);
  usage.modelOutputTokens += Math.max(0, output);
}
export function recordUnmeteredModelCall() { const usage = storage.getStore(); if (usage) usage.unmeteredModelCalls += 1; }
export function recordResearchBudgetReservation(id: string, budget: { reservedMicro?: number; searchEstimateMicro?: number;
  inputMicroPer1k?: number; outputMicroPer1k?: number; fallbackMicro?: number }) { const usage = storage.getStore(); if (usage) {
  usage.researchReservationId = id;
  if ([budget.reservedMicro, budget.searchEstimateMicro, budget.inputMicroPer1k, budget.outputMicroPer1k, budget.fallbackMicro]
    .every(value => typeof value === "number" && Number.isFinite(value) && value >= 0))
    usage.researchPricing = { limit: budget.reservedMicro!, search: budget.searchEstimateMicro!, input: budget.inputMicroPer1k!,
      output: budget.outputMicroPer1k!, fallback: budget.fallbackMicro! };
  usage.researchModelStart = { calls: usage.generativeCalls, input: usage.modelInputTokens,
    output: usage.modelOutputTokens, unmetered: usage.unmeteredModelCalls };
} }
export function recordResearchSearchCall() { const usage = storage.getStore(); if (usage) usage.researchSearchCalls += 1; }
/** Reserve a conservative portion of this request's DB-backed budget before a model call. */
export function authorizeResearchModelCall(promptCharacters: number, maxOutputTokens: number): number {
  const usage = storage.getStore();
  if (!usage?.researchReservationId) return 0;
  const p = usage.researchPricing;
  if (!p) throw new Error("Research pricing policy unavailable");
  const estimate = Math.max(p.fallback, Math.ceil(promptCharacters / 3 / 1000 * p.input) + Math.ceil(maxOutputTokens / 1000 * p.output));
  if (p.search + usage.researchActualModelMicro + usage.researchPendingMicro + estimate > p.limit)
    throw new Error("Research model budget exhausted");
  usage.researchPendingMicro += estimate;
  return estimate;
}
export function finishResearchModelCall(heldMicro: number, inputTokens: number | null | undefined,
  outputTokens: number | null | undefined, attempted: boolean) {
  const usage = storage.getStore();
  if (!usage?.researchReservationId) return;
  usage.researchPendingMicro = Math.max(0, usage.researchPendingMicro - heldMicro);
  if (!attempted) return;
  const p = usage.researchPricing;
  if (!p) return;
  usage.researchActualModelMicro += typeof inputTokens === "number" && typeof outputTokens === "number"
    ? Math.ceil(inputTokens / 1000 * p.input) + Math.ceil(outputTokens / 1000 * p.output) : p.fallback;
}
export function recordAiCall(kind: "generativeCalls" | "embeddingCalls", limit = 1) {
  const usage = storage.getStore();
  if (usage) {
    if (kind === "generativeCalls" && usage.generativeCalls >= limit) throw new Error("Interactive generation budget exhausted.");
    usage[kind] += 1;
  }
}
