import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { RequestUsage } from "@/lib/corpus/usage";

export type BudgetReservation = { status: "reserved" | "paused" | "call_limit" | "duplicate" | "concurrency_limit" | "daily_limit" | "monthly_limit";
  reservationId?: string; reservedMicro?: number; searchEstimateMicro?: number;
  inputMicroPer1k?: number; outputMicroPer1k?: number; fallbackMicro?: number };

/** A single pre-paid reservation covers the one search and all bounded model work for this Ask request. */
export async function reserveResearchBudget(requestId: string, plannedCalls: number): Promise<BudgetReservation> {
  const { data, error } = await supabaseAdmin.rpc("reserve_demand_budget", { p_request_id: requestId, p_planned_calls: plannedCalls });
  if (error || !data || typeof data !== "object") throw error || new Error("Research budget unavailable");
  const row = data as { status?: string; reservation_id?: string; reserved_micro?: number;
    search_estimate_micro?: number; model_input_micro_per_1k?: number; model_output_micro_per_1k?: number; model_fallback_micro?: number };
  if (!row.status || !["reserved", "paused", "call_limit", "duplicate", "concurrency_limit", "daily_limit", "monthly_limit"].includes(row.status))
    throw new Error("Invalid budget decision");
  return { status: row.status as BudgetReservation["status"], reservationId: row.reservation_id,
    reservedMicro: row.reserved_micro, searchEstimateMicro: row.search_estimate_micro,
    inputMicroPer1k: row.model_input_micro_per_1k, outputMicroPer1k: row.model_output_micro_per_1k,
    fallbackMicro: row.model_fallback_micro };
}

/** Actual provider token counts are used when available; missing counts use the configured fallback estimate. */
export async function settleResearchBudget(usage: RequestUsage): Promise<number | null> {
  if (!usage.researchReservationId) return null;
  const start = usage.researchModelStart || { calls: 0, input: 0, output: 0, unmetered: 0 };
  const calls = Math.max(0, usage.generativeCalls - start.calls);
  const { data, error } = await supabaseAdmin.rpc("settle_demand_budget", {
    p_reservation_id: usage.researchReservationId, p_search_calls: Math.min(1, usage.researchSearchCalls),
    p_model_calls: Math.min(7, calls), p_input_tokens: Math.max(0, usage.modelInputTokens - start.input),
    p_output_tokens: Math.max(0, usage.modelOutputTokens - start.output),
    p_unmetered_calls: Math.min(Math.max(0, usage.unmeteredModelCalls - start.unmetered), calls),
  });
  if (error || typeof data !== "number") throw error || new Error("Research budget settlement unavailable");
  return data;
}
