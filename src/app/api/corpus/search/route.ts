import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { retrieveEvidence } from "@/lib/corpus/retrieval";

const schema = z.object({ personalityId: z.string().uuid(), question: z.string().trim().min(2).max(4_000) });

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request, 16 * 1024);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "A personality and search question are required.", 400);
    const result = await retrieveEvidence(parsed.data.question, parsed.data.personalityId);
    return NextResponse.json(result);
  } catch (error) {
    return corpusErrorResponse(error);
  }
}
