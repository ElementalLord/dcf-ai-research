import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * The website setting "AI can add sources and facts" (Resources › Knowledge).
 *
 * It is stored as `demand_budget_policy.auto_admission_paused` (inverted), so the database trigger
 * `guard_ai_knowledge_additions` enforces the same switch even if application code is bypassed.
 * When it is off, AI may still search and answer, and may still suggest sources for a person to
 * review, but it cannot add sources to the research registry or publish claims or sources itself.
 *
 * Fails closed: if the setting cannot be read, AI additions are treated as off.
 */
const CACHE_MS = 15_000;
let cached: { allowed: boolean; at: number } | null = null;

export async function aiMayAddKnowledge(): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.allowed;
  let allowed = false;
  try {
    const { data, error } = await supabaseAdmin.from("demand_budget_policy").select("auto_admission_paused").eq("id", true).maybeSingle();
    allowed = !error && data !== null && data.auto_admission_paused === false;
  } catch {
    allowed = false;
  }
  cached = { allowed, at: Date.now() };
  return allowed;
}

/** Forget the cached value, so a changed setting applies to the very next request. */
export function clearAiKnowledgePermissionCache() {
  cached = null;
}
