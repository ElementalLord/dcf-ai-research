import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { RetrievalDebug } from "@/lib/corpus/types";

/** Metadata only: no question text, answer text, search query, source URL or user identifier. */
export async function recordDemandQuestionActivity(input: { personalityIds: string[]; debug: RetrievalDebug; latencyMs: number }): Promise<void> {
  const debug = input.debug;
  const outcomes = debug.demandVerificationOutcomes || [];
  try {
    const { error } = await supabaseAdmin.from("demand_question_activity").insert({
      personality_ids: input.personalityIds, need_id: debug.questionNeedId || null,
      resolution_state: debug.questionResolutionState || null, research_status: debug.demandResearchStatus || null,
      search_calls: debug.webSearchCalls || 0, source_fetches: debug.liveFetches || 0,
      verification_model_calls: debug.demandVerificationModelCalls || 0,
      admitted_count: outcomes.filter((value) => value === "admitted").length,
      quarantined_count: outcomes.filter((value) => value === "quarantined").length,
      rejected_count: outcomes.filter((value) => value === "rejected").length,
      budget_exhausted: debug.demandResearchStatus === "budget_exhausted",
      estimated_cost_micro: debug.demandEstimatedCostMicros || 0,
      latency_ms: input.latencyMs,
    });
    if (error) console.warn("demand_activity_write_failed", JSON.stringify({ code: error.code }));
  } catch { /* Telemetry is optional and must never change an answer. */ }
}
