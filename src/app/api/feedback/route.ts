import { NextRequest, NextResponse } from "next/server";
import { feedbackSubmissionSchema } from "@/lib/feedback";
import { verifyFeedbackContext } from "@/lib/feedback-token";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON is required." }, { status: 415 });
  if (Number(request.headers.get("content-length") || 0) > 120_000) return NextResponse.json({ error: "Feedback is too large." }, { status: 413 });
  let raw: string;
  try { raw = await request.text(); } catch { return NextResponse.json({ error: "Could not read feedback." }, { status: 400 }); }
  if (raw.length > 120_000) return NextResponse.json({ error: "Feedback is too large." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = feedbackSubmissionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the rating, tags, and comment." }, { status: 400 });
  const context = verifyFeedbackContext(parsed.data.token);
  if (!context) return NextResponse.json({ error: "This answer can no longer be rated. Ask again for a fresh response." }, { status: 400 });
  const { error } = await supabaseAdmin.from("response_feedback").insert({
    response_id: context.responseId, request_id: context.requestId, rating: parsed.data.rating,
    comment: parsed.data.comment || null, feedback_tags: parsed.data.tags,
    question: context.question, answer_snapshot: context.answer, citations: context.citations,
    citation_count: context.citations.length, personality_id: context.personalityId,
    personality_name: context.personalityName, used_live_search: context.usedLiveSearch,
    answer_mode: context.answerMode, provider: context.provider, model: context.model,
  });
  if (error?.code === "23505") return NextResponse.json({ error: "Feedback was already submitted for this answer." }, { status: 409 });
  if (error) { console.error("Feedback insert failed", error.code); return NextResponse.json({ error: "Feedback could not be saved. Try again." }, { status: 503 }); }
  return NextResponse.json({ submitted: true }, { status: 201 });
}
