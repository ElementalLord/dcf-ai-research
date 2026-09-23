import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { loadPersonalityCoverage, runPersonalityOnboarding } from "@/lib/corpus/onboarding";
import { ONBOARDING_STEPS } from "@/lib/corpus/onboarding-plan";

const schema = z.object({
  personalityId: z.string().uuid(),
  sourceIds: z.array(z.string().uuid()).max(25),
  steps: z.array(z.enum(ONBOARDING_STEPS)).min(1),
  benchmarkQuestions: z.array(z.string().trim().min(2).max(1_000)).max(12).optional(),
});

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    const personalityId = request.nextUrl.searchParams.get("personalityId");
    const [{ data: personalities, error: personalityError }, { data: sources, error: sourceError }] = await Promise.all([
      supabaseAdmin.from("personalities").select("id, canonical_name, personality_categories(is_primary, categories(id, slug, name))").order("canonical_name"),
      supabaseAdmin.from("sources").select("id, title, url, source_type, source_status, ingestion_status, textual_layer, source_personalities(personality_id)").eq("source_status", "approved").order("title").limit(1_000),
    ]);
    if (personalityError || sourceError) throw new CorpusError("DATABASE_FAILED", "Onboarding options could not be loaded.", 500, { cause: personalityError || sourceError });
    const coverage = personalityId ? await loadPersonalityCoverage(personalityId) : null;
    return NextResponse.json({ personalities: personalities || [], sources: sources || [], coverage });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request, 64 * 1024);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "The onboarding plan is invalid.", 400);
    const result = await runPersonalityOnboarding(parsed.data);
    return NextResponse.json({ success: true, ...result, coverage: await loadPersonalityCoverage(parsed.data.personalityId) });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}
