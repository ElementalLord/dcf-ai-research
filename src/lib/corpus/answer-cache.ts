import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Citation, RetrievedEvidence } from "./types";
import { validateAnswerCitations } from "./synthesis-provider";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function normalizeAnswerQuestion(question: string) { return question.normalize("NFKC").toLowerCase().trim().replace(/[?!]+$/g, "").trim().replace(/\s+/g, " "); }
export function answerCacheIdentity(scope: string[], question: string, policy: string, evidence: RetrievedEvidence[], citations: Citation[]) {
  // Re-retrieve under the current approval policy before EVERY lookup. Ordered content,
  // provenance and citation metadata are part of the signature, not just evidence IDs.
  const evidenceSignature = hash({ evidence, citations });
  const normalizedQuestion = normalizeAnswerQuestion(question);
  const key = hash({ version: 1, scope: [...scope].sort(), normalizedQuestion, policy, evidenceSignature });
  return { key, evidenceSignature, normalizedQuestion };
}
export type CachedAnswer = { answer: string; provider: string; model: string | null };
export async function readAnswerCache(key: string, citations: Citation[]): Promise<CachedAnswer | null> {
  try {
    const { data, error } = await supabaseAdmin.from("answer_cache").select("answer_text,provider,model,hit_count").eq("id", key).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error || !data || !validateAnswerCitations(data.answer_text, citations)) return null;
    await supabaseAdmin.rpc("touch_answer_cache", { cache_id: key });
    return { answer: data.answer_text, provider: data.provider, model: data.model };
  } catch { return null; } // Missing migration/cache outage never breaks Ask.
}
export async function writeAnswerCache(identity: ReturnType<typeof answerCacheIdentity>, scope: string[], policy: string, answer: CachedAnswer) {
  try {
    await supabaseAdmin.from("answer_cache").upsert({
      id: identity.key, personality_scope: scope, normalized_question: identity.normalizedQuestion,
      evidence_signature: identity.evidenceSignature, policy_mode: policy, answer_text: answer.answer,
      provider: answer.provider, model: answer.model,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch { /* Cache is optional. */ }
}
