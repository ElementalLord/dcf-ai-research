import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { previewEvidenceQueue, runEvidenceCompletion } from "@/lib/evidence-completion/engine";

// Corpus administration only: this path may download large verified documents. Ask never calls it.
export const maxDuration = 800;

const uuid = z.string().uuid();
const requestSchema = z.object({
  personalityId: uuid,
  maxLocations: z.number().int().min(1).max(60).default(30),
  braveBudget: z.number().int().min(0).max(8).default(0),
  dryRun: z.boolean().default(true),
  retryStableFailures: z.boolean().default(false),
  refreshAcquired: z.boolean().default(false),
  reassessLinks: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    const personalityId = request.nextUrl.searchParams.get("personalityId");
    if (!uuid.safeParse(personalityId).success) throw new CorpusError("INVALID_INPUT", "Select a personality.", 400);
    if (request.nextUrl.searchParams.get("view") === "requirements") {
      const { data, error } = await supabaseAdmin.from("evidence_requirements")
        .select("location_key,locator_raw,locator_kind,status,source_availability,priority,attempts,last_attempt_at,resolution")
        .eq("personality_id", personalityId as string).order("priority", { ascending: false }).limit(500);
      if (error) throw new CorpusError("DATABASE_FAILED", "Evidence requirements could not be loaded.", 500, { cause: error });
      return NextResponse.json({ requirements: data });
    }
    const limit = Number(request.nextUrl.searchParams.get("limit") || 30);
    return NextResponse.json(await previewEvidenceQueue(personalityId as string, Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 30));
  } catch (error) { return corpusErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "Invalid evidence-completion request.", 400);
    return NextResponse.json(await runEvidenceCompletion(parsed.data));
  } catch (error) { return corpusErrorResponse(error); }
}
