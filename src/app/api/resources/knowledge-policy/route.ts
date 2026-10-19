import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({
  requestLimitUsd: z.number().min(0.01).max(10),
  dailyLimitUsd: z.number().min(0.01).max(1000),
  monthlyLimitUsd: z.number().min(0.01).max(10000),
  maxPaidCalls: z.number().int().min(1).max(8),
  maxConcurrentJobs: z.number().int().min(1).max(100),
  researchPaused: z.boolean(), autoAdmissionPaused: z.boolean(),
}).refine(value => value.requestLimitUsd <= value.dailyLimitUsd && value.dailyLimitUsd <= value.monthlyLimitUsd,
  "Request, daily and monthly limits must be in ascending order.");

export async function PATCH(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  try {
    assertRequestSize(request, 4_096);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "Invalid research budget policy.", 400);
    const value = parsed.data;
    const { data, error } = await supabaseAdmin.from("demand_budget_policy").update({
      request_limit_micro: Math.round(value.requestLimitUsd * 1_000_000),
      daily_limit_micro: Math.round(value.dailyLimitUsd * 1_000_000),
      monthly_limit_micro: Math.round(value.monthlyLimitUsd * 1_000_000),
      max_paid_calls: value.maxPaidCalls, max_concurrent_jobs: value.maxConcurrentJobs,
      research_paused: value.researchPaused, auto_admission_paused: value.autoAdmissionPaused,
      updated_at: new Date().toISOString(),
    }).eq("id", true).select("id").single();
    if (error || !data) throw error || new Error("Budget policy missing");
    return NextResponse.json({ saved: true });
  } catch (error) { return corpusErrorResponse(error); }
}
