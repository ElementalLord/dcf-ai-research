import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { embedSourceChunks } from "@/lib/corpus/embeddings";
import { tagSourceChunks } from "@/lib/corpus/tagging";
import { extractCandidateProposals } from "@/lib/corpus/candidate-claims";

const actionSchema = z.object({
  action: z.enum(["embed", "tag", "extract"]),
  sourceId: z.string().uuid(),
  personalityId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(25).optional(),
});

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "The corpus action is invalid.", 400);
    const { action, sourceId, personalityId, limit } = parsed.data;
    if (action === "embed") return NextResponse.json({ success: true, ...(await embedSourceChunks(sourceId)) });
    if (action === "tag") return NextResponse.json({ success: true, ...(await tagSourceChunks(sourceId, true)) });
    if (!personalityId) throw new CorpusError("INVALID_INPUT", "A personality is required for candidate extraction.", 400);
    return NextResponse.json({ success: true, ...(await extractCandidateProposals({ sourceId, personalityId, limit })) });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}
