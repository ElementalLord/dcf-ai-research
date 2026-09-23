import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { reviewCandidate } from "@/lib/corpus/candidate-claims";

const reviewSchema = z.object({
  candidateId: z.string().uuid(),
  decision: z.enum(["accepted", "rejected", "duplicate", "needs_review"]),
  reviewer: z.string().trim().min(2).max(120),
  duplicateOfClaimId: z.string().uuid().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    const status = request.nextUrl.searchParams.get("status") || "pending";
    const { data, error } = await supabaseAdmin
      .from("candidate_claims")
      .select(`
        id, claim_text, claim_kind, certainty, extraction_confidence, extraction_note, status, created_at,
        personalities(id, canonical_name),
        parameter_fields(id, code, label, parameters(code, name)),
        source_chunks(id, page_or_section, textual_layer, chunk_text, sources(id, title, author, url, source_status))
      `)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new CorpusError("DATABASE_FAILED", "Candidate claims could not be loaded.", 500, { cause: error });
    return NextResponse.json({ candidates: data || [] });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = reviewSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "A valid candidate review decision is required.", 400);
    return NextResponse.json({ success: true, ...(await reviewCandidate(parsed.data)) });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}
