import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { createExpansionRun, getExpansionRun, previewExpansion, setExpansionStatus, stepExpansion } from "@/lib/live-research/expansion";
import { CorpusError } from "@/lib/corpus/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";

const uuid = z.string().uuid();
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), personalityId: uuid, maxSearchRequests: z.number().int().min(1).max(100).default(25) }),
  z.object({ action: z.enum(["step", "stop", "resume"]), runId: uuid }),
]);

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    const runId = request.nextUrl.searchParams.get("runId");
    if (runId) {
      if (!uuid.safeParse(runId).success) throw new CorpusError("INVALID_INPUT", "Invalid run ID.", 400);
      return NextResponse.json({ run: await getExpansionRun(runId) });
    }
    const personalityId = request.nextUrl.searchParams.get("personalityId");
    if (!uuid.safeParse(personalityId).success) throw new CorpusError("INVALID_INPUT", "Select a personality.", 400);
    const max = Number(request.nextUrl.searchParams.get("maxSearchRequests") || 25);
    if (!Number.isInteger(max) || max < 1 || max > 100) throw new CorpusError("INVALID_INPUT", "Search limit must be 1–100.", 400);
    const [plan, latest] = await Promise.all([
      previewExpansion(personalityId as string, max),
      supabaseAdmin.from("external_research_runs").select("*").eq("personality_id", personalityId as string).order("created_at", { ascending: false }).limit(1),
    ]);
    if (latest.error) throw new CorpusError("DATABASE_FAILED", "Expansion history could not be loaded.", 500, { cause: latest.error });
    return NextResponse.json({ plan, run: latest.data?.[0] || null });
  } catch (error) { return corpusErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "Invalid expansion action.", 400);
    const input = parsed.data;
    const run = input.action === "start" ? await createExpansionRun(input.personalityId, input.maxSearchRequests)
      : input.action === "step" ? await stepExpansion(input.runId)
        : await setExpansionStatus(input.runId, input.action === "stop" ? "stopped" : "running");
    return NextResponse.json({ run });
  } catch (error) { return corpusErrorResponse(error); }
}
