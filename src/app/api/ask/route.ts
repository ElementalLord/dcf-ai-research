import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { answerQuestion } from "@/lib/corpus/answer";
import { assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";

const askSchema = z.object({
  personalityId: z.string().uuid().optional(),
  personalityIds: z.array(z.string().uuid()).min(1).max(3).optional(),
  question: z.string().trim().min(2).max(4_000),
}).refine((value) => Boolean(value.personalityId || value.personalityIds?.length), "At least one personality is required.");

export async function POST(request: NextRequest) {
  try {
    assertRequestSize(request, 16 * 1024);
    const parsed = askSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new CorpusError("INVALID_INPUT", "A valid personality and question are required.", 400);
    }
    const ids = parsed.data.personalityIds?.length ? parsed.data.personalityIds : [parsed.data.personalityId!];
    const result = await answerQuestion(parsed.data.question, ids.length === 1 ? ids[0] : ids);
    return NextResponse.json(result);
  } catch (error) {
    return corpusErrorResponse(error);
  }
}
