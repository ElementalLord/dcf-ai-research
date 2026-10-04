import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hashText } from "./text";
import { classifyProviderError } from "./provider-health";

export function checkpointFailureStatus(error: unknown) {
  const category = classifyProviderError(error);
  return category === "QUOTA_EXHAUSTED" || category === "RATE_LIMIT" ? "failed_quota" : category === "TIMEOUT" || category === "TRANSIENT" ? "failed_transient" : "failed_permanent";
}
/** Persist model output before applying proposals. Resume reuses it without quota.
 * Consumers' existing idempotent upserts/deduplication allow interrupted application.
 */
export async function checkpointedAi<T>(operation: string, input: unknown, generate: () => Promise<T>, apply: (payload: T) => Promise<void>): Promise<void> {
  const id = hashText(JSON.stringify({ version: 1, operation, input }));
  const { data, error } = await supabaseAdmin.from("ai_work_checkpoints").select("status,payload").eq("id", id).maybeSingle();
  if (error) throw new Error("AI checkpoint storage unavailable; apply the resilience migration first.");
  if (data?.status === "complete") return;
  const save = async (values: Record<string, unknown>) => {
    const result = await supabaseAdmin.from("ai_work_checkpoints").upsert({ id, operation, updated_at: new Date().toISOString(), ...values });
    if (result.error) throw new Error("AI checkpoint could not be saved.");
  };
  let payload = data?.payload as T | undefined;
  await save({ status: "processing", error_category: null });
  try {
    if (!payload) {
      payload = await generate();
      await save({ status: "processing", payload });
    }
    await apply(payload);
    await save({ status: "complete", payload });
  } catch (error) {
    await save({ status: checkpointFailureStatus(error), error_category: classifyProviderError(error), ...(payload ? { payload } : {}) });
    throw error; // Caller stops the job instead of retrying every remaining unit.
  }
}
