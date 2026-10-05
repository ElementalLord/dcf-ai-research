import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { EPISTEMIC_TYPES } from "@/lib/claim-epistemics/types";
import { epistemicSummary, reassessEpistemics, reviewClaimType } from "@/lib/claim-epistemics/engine";

const uuid = z.string().uuid();
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reassess"), personalityId: uuid }),
  z.object({ action: z.literal("review"), claimId: uuid,
    decision: z.enum(["confirm_type", "change_type", "mark_contested", "mark_synthetic", "mark_historical_inference", "keep_unclassified"]),
    type: z.enum(EPISTEMIC_TYPES).optional(), reviewer: z.string().trim().min(2).max(120),
    reviewerKind: z.enum(["human", "mentor", "ai_assisted"]).default("human"), note: z.string().max(2000).optional() }),
]);

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    const personalityId = request.nextUrl.searchParams.get("personalityId");
    if (!uuid.safeParse(personalityId).success) throw new CorpusError("INVALID_INPUT", "Select a personality.", 400);
    const scope = request.nextUrl.searchParams.get("scope") === "test" ? "test" : "strict";
    return NextResponse.json(await epistemicSummary(personalityId as string, scope));
  } catch (error) { return corpusErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "Invalid epistemics request.", 400);
    const input = parsed.data;
    if (input.action === "reassess") return NextResponse.json(await reassessEpistemics(input.personalityId));
    return NextResponse.json(await reviewClaimType({ claimId: input.claimId, action: input.decision, type: input.type, reviewer: input.reviewer,
      reviewerKind: input.reviewerKind, note: input.note }));
  } catch (error) { return corpusErrorResponse(error); }
}
