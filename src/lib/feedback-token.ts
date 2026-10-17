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

export function verifyFeedbackContext(token: string): FeedbackContext | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  const expected = Buffer.from(signature(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try { return feedbackContextSchema.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"))); }
  catch { return null; }
}
