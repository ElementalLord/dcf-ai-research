import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { proposeEvidenceAssessment } from "@/lib/quality/review-assessment";

const id = z.string().uuid();
const sourceFields = z.object({ title: z.string().trim().min(2).max(500), author: z.string().trim().max(300).nullable(), publisher_or_institution: z.string().trim().max(300).nullable(), source_type: z.string().trim().min(2).max(80), url: z.union([z.string().url().max(2000), z.literal("")]).nullable(), citation: z.string().trim().max(2000).nullable(), textual_layer: z.string().trim().max(100).nullable(), rights_or_access_note: z.string().trim().max(2000).nullable() });
const claimFields = z.object({ claim_text: z.string().trim().min(2).max(4000), certainty: z.enum(["unknown", "high", "medium", "low"]), researcher_notes: z.string().trim().max(4000).nullable() });
const mutation = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("source"), id, fields: sourceFields }),
  z.object({ kind: z.literal("claim"), id, fields: claimFields }),
]);

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    const personalityId = id.parse(request.nextUrl.searchParams.get("personalityId"));
    const [links, claimResult] = await Promise.all([
      supabaseAdmin.from("source_personalities").select("source_id").eq("personality_id", personalityId).limit(1000),
      supabaseAdmin.from("claims").select("id,claim_text,claim_kind,certainty,review_status,approval_origin,approval_metadata,approval_note,approved_by_label,approved_at,created_at,updated_at,evidence_type,researcher_notes,parameter_fields(label),claim_sources(id,relationship,evidence_excerpt,page_or_section,notes,source_id,sources(id,title,author,url,source_status,citation)),claim_chunks(relationship,confidence,link_method,metadata,source_chunks(id,chunk_text,page_or_section,textual_layer,sources(id,title,url))),metadata_claim_evidence(source_id,locator,accessed_at,valid_until,validity_status,metadata_admission_permissions(source_url,is_active)),claim_reviews(reviewer_name,decision,notes,reviewed_at)").eq("personality_id", personalityId).order("created_at", { ascending: false }).limit(500),
    ]);
    if (links.error || claimResult.error) throw links.error || claimResult.error;
    const claims = claimResult.data || [];
    const epistemics = await supabaseAdmin.from("claim_epistemics").select("claim_id,epistemic_type,proposed_type,type_origin,type_review_status,contract_status,contract_satisfied,contract_basis,reviewer,review_note").eq("personality_id", personalityId).limit(500);
    if (epistemics.error) throw epistemics.error;
    const epistemicByClaim = new Map((epistemics.data || []).map(row => [row.claim_id, row]));
    const sourceIds = new Set((links.data || []).map((row) => row.source_id));
    for (const claim of claims) for (const evidence of claim.claim_sources || []) if (evidence.source_id) sourceIds.add(evidence.source_id);
    const ids = [...sourceIds];
    const sources = ids.length ? await supabaseAdmin.from("sources").select("id,title,author,publisher_or_institution,source_type,url,citation,textual_layer,source_status,approval_origin,approval_note,approved_by_label,approved_at,created_at,ingestion_status,rights_or_access_note,publication_year,updated_at,metadata").in("id", ids).order("title").limit(1000) : { data: [], error: null };
    if (sources.error) throw sources.error;
    return NextResponse.json({ claims: claims.map(claim => ({ ...claim, epistemics: epistemicByClaim.get(claim.id) || null, evidenceAssessment: proposeEvidenceAssessment(claim) })), sources: sources.data || [] });
  } catch (error) { return corpusErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = mutation.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "Invalid resource update.", 400);
    const { kind, id: resourceId, fields } = parsed.data;
    if (kind === "source") {
      const existing = await supabaseAdmin.from("sources").select("source_status").eq("id", resourceId).single();
      if (existing.error) throw existing.error;
      if (existing.data.source_status === "approved") throw new CorpusError("REVIEW_REQUIRED", "Approved sources must be returned to candidate review before editing.", 409);
      const { data, error } = await supabaseAdmin.from("sources").update({ ...fields, url: fields.url || null, updated_at: new Date().toISOString() }).eq("id", resourceId).select("id").single();
      if (error) throw error;
      return NextResponse.json({ updated: data.id });
    }
    const existing = await supabaseAdmin.from("claims").select("review_status").eq("id", resourceId).single();
    if (existing.error) throw existing.error;
    if (existing.data.review_status === "approved") throw new CorpusError("REVIEW_REQUIRED", "Approved claims must be returned to review before editing.", 409);
    const { data, error } = await supabaseAdmin.from("claims").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", resourceId).select("id").single();
    if (error) throw error;
    return NextResponse.json({ updated: data.id });
  } catch (error) { return corpusErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = z.object({ kind: z.enum(["source", "claim"]), id }).safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "Invalid removal request.", 400);
    const { kind, id: resourceId } = parsed.data;
    if (kind === "source") {
      const [source, evidence, chunks] = await Promise.all([
        supabaseAdmin.from("sources").select("source_status").eq("id", resourceId).single(),
        supabaseAdmin.from("claim_sources").select("id", { count: "exact", head: true }).eq("source_id", resourceId),
        supabaseAdmin.from("source_chunks").select("id", { count: "exact", head: true }).eq("source_id", resourceId),
      ]);
      if (source.error || evidence.error || chunks.error) throw source.error || evidence.error || chunks.error;
      if (source.data.source_status !== "candidate" || evidence.count || chunks.count) throw new CorpusError("PROVENANCE_PROTECTED", "Only unlinked candidate sources can be removed.", 409);
      const result = await supabaseAdmin.from("sources").delete().eq("id", resourceId).eq("source_status", "candidate").select("id").single();
      if (result.error) throw result.error;
    } else {
      const claim = await supabaseAdmin.from("claims").select("review_status").eq("id", resourceId).single();
      if (claim.error) throw claim.error;
      if (claim.data.review_status !== "draft") throw new CorpusError("PROVENANCE_PROTECTED", "Only draft claims can be removed.", 409);
      const result = await supabaseAdmin.from("claims").delete().eq("id", resourceId).eq("review_status", "draft").select("id").single();
      if (result.error) throw result.error;
    }
    return NextResponse.json({ removed: resourceId });
  } catch (error) { return corpusErrorResponse(error); }
}
