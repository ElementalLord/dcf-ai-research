import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { feedbackSubmissionSchema } from "@/lib/feedback";
import { signFeedbackContext } from "@/lib/feedback-token";
import { feedbackAnswerSnapshot } from "@/lib/feedback";

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: () => ({ insert }) } }));
import { POST } from "@/app/api/feedback/route";

const context = {
  responseId: "550e8400-e29b-41d4-a716-446655440000",
  question: "What did this person do?",
  answer: "A completed answer [C1].",
  personalityId: "550e8400-e29b-41d4-a716-446655440001",
  personalityName: "Example Person",
  citations: [{ id: "C1", kind: "approved_claim", title: "Source title", url: null, pageOrSection: "p. 4", claimId: "claim-1" }],
  usedLiveSearch: false, answerMode: "complete", provider: "example", model: "example-model", requestId: "request-1",
};

function submit(value: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/feedback", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(value) }));
}

beforeEach(() => { insert.mockReset().mockResolvedValue({ error: null }); });

describe("response feedback", () => {
  it("stores no live source sentence in a research-only feedback snapshot", async () => {
    const liveSentence = "The archive records Example Person receiving the Aurora Medal in 1928.";
    const answer = feedbackAnswerSnapshot("research_answer", `${liveSentence} [S1]`);
    const response = await submit({ token: signFeedbackContext({ ...context, answer, answerMode: "research_answer",
      usedLiveSearch: true, citations: [{ id: "S1", kind: "live_web_source", title: "Archive", url: "https://example.org/archive", pageOrSection: "Register" }] }), rating: 4 });
    expect(response.status).toBe(201);
    expect(answer).not.toContain(liveSentence);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ answer_snapshot: answer, answer_mode: "research_answer" }));
  });
  it.each([1, 5])("stores a %i-star rating and the signed answer snapshot", async rating => {
    const response = await submit({ token: signFeedbackContext(context), rating, comment: "", tags: [] });
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ rating, comment: null, answer_snapshot: context.answer, question: context.question, citation_count: 1, personality_name: context.personalityName, request_id: context.requestId }));
  });

  it("stores optional comment and approved tags", async () => {
    const response = await submit({ token: signFeedbackContext(context), rating: 3, comment: "Useful context", tags: ["Weak sources", "Other"] });
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ comment: "Useful context", feedback_tags: ["Weak sources", "Other"] }));
  });

  it("accepts a saved pre-feature answer and marks its snapshot provenance", async () => {
    const response = await submit({ legacyContext: context, rating: 1, comment: "Missing detail", tags: ["Missing information"] });
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ answer_snapshot: context.answer, answer_mode: "legacy_client_snapshot", provider: null, model: null, rating: 1 }));
  });

  it.each([0, 6, 2.5, "5"]) ("rejects invalid rating %s", async rating => {
    expect(feedbackSubmissionSchema.safeParse({ token: "x".repeat(30), rating }).success).toBe(false);
    expect((await submit({ token: signFeedbackContext(context), rating })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects unapproved tags, tampered snapshots, and duplicate response IDs", async () => {
    expect((await submit({ token: signFeedbackContext(context), rating: 4, tags: ["Private"] })).status).toBe(400);
    const token = signFeedbackContext(context);
    expect((await submit({ token: `${token.slice(0, -2)}zz`, rating: 4 })).status).toBe(400);
    insert.mockResolvedValue({ error: { code: "23505" } });
    expect((await submit({ token, rating: 4 })).status).toBe(409);
  });
});
