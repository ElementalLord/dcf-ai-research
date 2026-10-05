import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { buildReconciliationQueue, decideReconciliation, listReconciliations } from "@/lib/reconciliation/engine";

const uuid = z.string().uuid();
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("build"), personalityId: uuid, dryRun: z.boolean().default(false) }),
  z.object({ action: z.literal("decide"), id: uuid,
    decision: z.enum(["approve_atomic", "confirm_exact", "keep_original", "mark_interpretive", "reject", "mark_non_supporting"]),
    reviewer: z.string().trim().min(2).max(120), reviewerKind: z.enum(["human", "ai_assisted"]).default("human"),
    note: z.string().max(2000).optional(), editedText: z.string().max(2000).optional() }),
]);
const STATUSES = ["proposed", "approved_atomic", "confirmed_exact", "kept_original", "marked_interpretive", "rejected", "passage_non_supporting", "duplicate"];

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    const personalityId = request.nextUrl.searchParams.get("personalityId");
    if (!uuid.safeParse(personalityId).success) throw new CorpusError("INVALID_INPUT", "Select a personality.", 400);
    const status = request.nextUrl.searchParams.get("status") || "proposed";
    if (!STATUSES.includes(status)) throw new CorpusError("INVALID_INPUT", "Unknown status.", 400);
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 100) || 100, 1), 500);
    return NextResponse.json({ items: await listReconciliations(personalityId as string, status, limit) });
  } catch (error) { return corpusErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "Invalid reconciliation request.", 400);
    const input = parsed.data;
    if (input.action === "build") return NextResponse.json(await buildReconciliationQueue(input.personalityId, { dryRun: input.dryRun }));
    return NextResponse.json(await decideReconciliation({ id: input.id, action: input.decision, reviewer: input.reviewer,
      reviewerKind: input.reviewerKind, note: input.note, editedText: input.editedText }));
  } catch (error) { return corpusErrorResponse(error); }
}
