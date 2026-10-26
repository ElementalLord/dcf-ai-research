import { NextRequest, NextResponse } from "next/server";
import { feedbackSubmissionSchema, legacyFeedbackSubmissionSchema, type FeedbackContext } from "@/lib/feedback";
import { verifyFeedbackContext } from "@/lib/feedback-token";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { publicRateLimit } from "@/lib/api-rate-limit";
import { readLimitedBody, RequestBodyTooLarge } from "@/lib/limited-request-body";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON is required." }, { status: 415 });
  const limited = await publicRateLimit(request, "feedback");
  if (limited) return limited;
  let raw: string;
  try { raw = await readLimitedBody(request, 120_000); }
  catch (error) { return NextResponse.json({ error: error instanceof RequestBodyTooLarge ? "Feedback is too large." : "Could not read feedback." }, { status: error instanceof RequestBodyTooLarge ? 413 : 400 }); }
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const signed = feedbackSubmissionSchema.safeParse(body);
  let context: FeedbackContext | null;
  let submission: { rating: number; comment: string; tags: string[] };
  if (signed.success) {
    context = verifyFeedbackContext(signed.data.token);
    submission = signed.data;
  } else {
    const legacy = legacyFeedbackSubmissionSchema.safeParse(body);
    if (!legacy.success) return NextResponse.json({ error: "Check the rating, tags, and comment." }, { status: 400 });
    context = legacy.data.legacyContext;
    submission = legacy.data;
  }
  if (!context) return NextResponse.json({ error: "This answer can no longer be rated. Ask again for a fresh response." }, { status: 400 });
  const { error } = await supabaseAdmin.from("response_feedback").insert({
    response_id: context.responseId, request_id: signed.success ? context.requestId : null, rating: submission.rating,
    comment: submission.comment || null, feedback_tags: submission.tags,
    question: context.question, answer_snapshot: context.answer, citations: context.citations,
    citation_count: context.citations.length, personality_id: context.personalityId,
    personality_name: context.personalityName, used_live_search: context.usedLiveSearch,
    answer_mode: signed.success ? context.answerMode : "legacy_client_snapshot", provider: signed.success ? context.provider : null, model: signed.success ? context.model : null,
  });
  if (error?.code === "23505") return NextResponse.json({ error: "Feedback was already submitted for this answer." }, { status: 409 });
  if (error) { console.error("Feedback insert failed", error.code); return NextResponse.json({ error: "Feedback could not be saved. Try again." }, { status: 503 }); }
  return NextResponse.json({ submitted: true }, { status: 201 });
}
