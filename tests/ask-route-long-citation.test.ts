import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { safeFeedbackToken, verifyFeedbackContext } from "@/lib/feedback-token";

const state = vi.hoisted(() => ({ answer: vi.fn() }));
vi.mock("@/lib/corpus/answer", () => ({ answerQuestion: state.answer }));
vi.mock("@/lib/api-rate-limit", () => ({ publicRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: {} }));
import { POST } from "@/app/api/ask/route";

const person = "11111111-1111-4111-8111-111111111111";
const longHeading = "A page that marks an entire paragraph up as a heading. ".repeat(12);
const citation = { id: "S1", kind: "live_web_source", title: "T".repeat(900), author: null, institution: "example.org",
  url: `https://example.org/${"a".repeat(2500)}`, sourceType: "general_web", pageOrSection: longHeading, textualLayer: null,
  excerpt: "Kalam wrote about a developed India by 2020.", chunkId: `demand:${"x".repeat(200)}` };
const result = { personality: "A. P. J. Abdul Kalam", question: "What ideas are associated with A. P. J. Abdul Kalam?", status: "research_answer",
  answer: "Kalam is associated with the vision of a developed India [S1].", citations: [citation], evidence: [], conflicts: [],
  interactionId: null, debug: { provider: "gemini", model: "gemini-3.7-flash" } };
const ask = () => POST(new NextRequest("http://localhost/api/ask", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ personalityId: person, question: result.question }) }));

describe("Ask with a citation from a messy live page", () => {
  it("still returns the answer when a cited page has an over-long heading, title and URL", async () => {
    expect(longHeading.length).toBeGreaterThan(300);
    state.answer.mockResolvedValue(result);
    const response = await ask();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.answer).toBe(result.answer);
    expect(body.citations[0].pageOrSection).toBe(longHeading);
    expect(body.debug).toBeUndefined();
    // Feedback still works: the token carries the citation cut to the stored limits.
    const context = verifyFeedbackContext(body.feedbackToken);
    expect(context?.citations[0]).toMatchObject({ id: "S1", kind: "live_web_source" });
    expect(context!.citations[0].pageOrSection).toHaveLength(300);
    expect(context!.citations[0].title).toHaveLength(500);
    expect(context!.citations[0].url).toHaveLength(2000);
    expect(context!.citations[0].chunkId).toHaveLength(100);
  });
  it("returns the answer without a feedback token rather than failing when a token cannot be made", async () => {
    expect(safeFeedbackToken({ responseId: "not-a-uuid", question: "Why?", answer: "Because.", personalityId: null, personalityName: "X",
      citations: [], usedLiveSearch: false, answerMode: "complete", provider: null, model: null, requestId: null })).toBeNull();
    state.answer.mockResolvedValue({ ...result, personality: "" });
    const response = await ask();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.answer).toBe(result.answer);
    expect(body.feedbackToken).toBeUndefined();
  });
});
