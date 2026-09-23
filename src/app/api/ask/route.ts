import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { answerQuestion } from "@/lib/corpus/answer";
import { assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";

const askSchema = z.object({
  personalityId: z.string().uuid(),
  question: z.string().trim().min(2).max(4_000),
});

export async function POST(request: NextRequest) {
  try {
    assertRequestSize(request, 16 * 1024);
    const parsed = askSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new CorpusError("INVALID_INPUT", "A valid personality and question are required.", 400);
    }
    const result = await answerQuestion(parsed.data.question, parsed.data.personalityId);
    return NextResponse.json(result);
  } catch (error) {
    return corpusErrorResponse(error);
  }
}
