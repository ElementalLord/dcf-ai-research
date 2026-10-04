import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { createExpansionRun, getExpansionRun, previewExpansion, setExpansionStatus, stepExpansion } from "@/lib/live-research/expansion";
import { CorpusError } from "@/lib/corpus/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { linkIngestedEvidence } from "@/lib/live-research/link-ingested";
import { loadPersonalityConfiguration } from "@/lib/corpus/personality-context";

const uuid = z.string().uuid();
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), personalityId: uuid, maxSearchRequests: z.number().int().min(1).max(50).default(30), mode: z.enum(["guided", "auto"]).default("guided"), focusQuery: z.string().max(160).optional() }),
  z.object({ action: z.enum(["step", "stop", "resume"]), runId: uuid }),
  z.object({ action: z.literal("relink"), personalityId: uuid, sourceId: uuid }),
]);

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    const runId = request.nextUrl.searchParams.get("runId");
    if (runId) {
      if (!uuid.safeParse(runId).success) throw new CorpusError("INVALID_INPUT", "Invalid run ID.", 400);
      const [run, candidates, families] = await Promise.all([
        getExpansionRun(runId),
        supabaseAdmin.from("research_candidates").select("*").eq("run_id", runId).order("created_at", { ascending: false }).limit(200),
        supabaseAdmin.from("verified_source_families").select("*").limit(100),
      ]);
      if (candidates.error || families.error) throw new CorpusError("DATABASE_FAILED", "Verification audit could not be loaded.", 500);
      const admitted = (candidates.data || []).filter((item) => item.verification_status === "APPROVED_FOR_EVIDENCE");
      const urls = [...new Set(admitted.map((item) => item.canonical_url))];
      const sourceResult = urls.length ? await supabaseAdmin.from("sources").select("id,url").in("url", urls).limit(200)
        : { data: [], error: null };
      if (sourceResult.error) throw new CorpusError("DATABASE_FAILED", "Source hierarchy could not be loaded.", 500);
      const sourceIds = (sourceResult.data || []).map((item) => item.id);
      const chunkResult = sourceIds.length ? await supabaseAdmin.from("source_chunks")
        .select("source_id,page_or_section").in("source_id", sourceIds).eq("is_active", true).limit(5000)
        : { data: [], error: null };
      if (chunkResult.error) throw new CorpusError("DATABASE_FAILED", "Passage hierarchy could not be loaded.", 500);
      const sourceByUrl = new Map((sourceResult.data || []).map((item) => [item.url, item.id]));
      const hierarchy = admitted.map((item) => {
        const sourceId = sourceByUrl.get(item.canonical_url);
        const locators = (chunkResult.data || []).filter((chunk) => chunk.source_id === sourceId).map((chunk) => chunk.page_or_section).filter(Boolean);
        return { sourceFamily: item.source_family || item.domain, work: item.work_title || item.title,
          edition: item.edition || item.translator || item.author || "Edition unspecified",
          independentWorkKey: item.independent_work_key, page: item.canonical_url, passages: locators };
      });
      return NextResponse.json({ run, candidates: candidates.data, families: families.data, hierarchy });
    }
    const personalityId = request.nextUrl.searchParams.get("personalityId");
    if (!uuid.safeParse(personalityId).success) throw new CorpusError("INVALID_INPUT", "Select a personality.", 400);
    const max = Number(request.nextUrl.searchParams.get("maxSearchRequests") || 30);
    if (!Number.isInteger(max) || max < 1 || max > 50) throw new CorpusError("INVALID_INPUT", "Search limit must be 1–50.", 400);
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
    if (input.action === "relink") {
      const { data: source, error } = await supabaseAdmin.from("sources").select("id,source_status,approval_origin")
        .eq("id", input.sourceId).single();
      if (error || !source || source.source_status !== "approved" || source.approval_origin !== "verified_auto")
        throw new CorpusError("INVALID_INPUT", "Choose an automatically verified evidence source.", 422);
      const configuration = await loadPersonalityConfiguration(input.personalityId);
      const aliases = [configuration.canonicalName, ...configuration.aliases.filter((item) => !item.isAmbiguous).map((item) => item.alias)];
      return NextResponse.json({ report: await linkIngestedEvidence(input.sourceId, input.personalityId, aliases) });
    }
    const run = input.action === "start" ? await createExpansionRun(input.personalityId, input.maxSearchRequests, input.mode, input.focusQuery)
      : input.action === "step" ? await stepExpansion(input.runId)
        : await setExpansionStatus(input.runId, input.action === "stop" ? "stopped" : "running");
    return NextResponse.json({ run });
  } catch (error) { return corpusErrorResponse(error); }
}
