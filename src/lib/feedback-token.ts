import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { feedbackContextSchema, type FeedbackContext } from "./feedback";

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Feedback signing secret is not configured.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(`dcf-feedback-v1:${payload}`).digest("base64url");
}

export function newResponseId() { return randomUUID(); }

export function signFeedbackContext(context: FeedbackContext) {
  const payload = Buffer.from(JSON.stringify(feedbackContextSchema.parse(context))).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

/**
 * A feedback token for an answer, or null. Live web pages supply titles, URLs and section
 * headings of any length, so every field is cut to the stored limits first. Feedback is an
 * extra: if a token still cannot be made, the answer is returned without one.
 */
export function safeFeedbackToken(context: FeedbackContext): string | null {
  const cut = (value: string | null | undefined, max: number) => value == null ? null : value.slice(0, max);
  try {
    return signFeedbackContext({ ...context,
      question: context.question.slice(0, 4_000), answer: context.answer.slice(0, 60_000),
      personalityName: context.personalityName.slice(0, 300), answerMode: context.answerMode.slice(0, 80),
      provider: cut(context.provider, 100), model: cut(context.model, 200), requestId: cut(context.requestId, 300),
      citations: context.citations.slice(0, 30).map((citation) => ({ id: citation.id.slice(0, 100), kind: citation.kind.slice(0, 60),
        title: citation.title.slice(0, 500), url: cut(citation.url, 2_000), claimId: citation.claimId?.slice(0, 100),
        chunkId: citation.chunkId?.slice(0, 100), pageOrSection: cut(citation.pageOrSection, 300) })) });
  } catch (error) {
    console.warn("feedback_token_unavailable", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

export function verifyFeedbackContext(token: string): FeedbackContext | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  const expected = Buffer.from(signature(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try { return feedbackContextSchema.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"))); }
  catch { return null; }
}
