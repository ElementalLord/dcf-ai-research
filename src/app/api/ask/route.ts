import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { answerQuestion } from "@/lib/corpus/answer";
import { assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { newResponseId, signFeedbackContext } from "@/lib/feedback-token";
import { feedbackAnswerSnapshot } from "@/lib/feedback";

const askSchema = z.object({
  personalityId: z.string().uuid().optional(),
  personalityIds: z.array(z.string().uuid()).min(1).max(3).optional(),
  question: z.string().trim().min(2).max(4_000),
  responseStyle: z.enum(["simple", "balanced", "detailed", "research"]).default("balanced"),
  history: z.array(z.object({
    question: z.string().trim().min(2).max(1_000),
    resolvedQuestion: z.string().trim().min(2).max(2_000).optional(),
    answer: z.string().trim().max(800).optional(),
    citedConcepts: z.array(z.string().trim().min(2).max(120)).max(4).optional(),
  })).max(4).optional(),
}).refine((value) => Boolean(value.personalityId || value.personalityIds?.length), "At least one personality is required.");

export async function POST(request: NextRequest) {
  try {
    assertRequestSize(request, 16 * 1024);
    const parsed = askSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new CorpusError("INVALID_INPUT", "A valid personality and question are required.", 400);
    }
    const ids = parsed.data.personalityIds?.length ? parsed.data.personalityIds : [parsed.data.personalityId!];
    const result = await answerQuestion(parsed.data.question, ids.length === 1 ? ids[0] : ids, { history: parsed.data.history, responseStyle: parsed.data.responseStyle });
    const { debug: _serverDiagnostics, ...publicResult } = result;
    void _serverDiagnostics;
    const feedbackToken = signFeedbackContext({
      responseId: newResponseId(), question: result.question,
      answer: feedbackAnswerSnapshot(result.status, result.answer),
      personalityId: ids.length === 1 ? ids[0] : null, personalityName: result.personality,
      citations: result.citations.map(citation => ({ id: citation.id, kind: citation.kind, title: citation.title,
        url: citation.url, claimId: citation.claimId, chunkId: citation.chunkId, pageOrSection: citation.pageOrSection })),
      usedLiveSearch: result.citations.some(citation => citation.kind === "live_web_source"),
      answerMode: result.status, provider: result.debug.provider || null, model: result.debug.model || null,
      requestId: result.interactionId || null,
    });
    return NextResponse.json({ ...publicResult, feedbackToken });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}
