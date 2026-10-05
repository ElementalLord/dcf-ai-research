import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { normalizeSourceUrl } from "@/lib/corpus/source-dedupe";

const updateSchema = z.object({
  sourceId: z.string().uuid(),
  status: z.enum(["candidate", "approved", "rejected"]),
  approvalOrigin: z.enum(["human_manual", "mentor_review"]).default("human_manual"),
  approvalNote: z.string().trim().max(2_000).optional(),
  approvedByLabel: z.string().trim().min(1).max(200).default("Corpus reviewer"),
});

const createSchema = z.object({
  personalityId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(500),
  author: z.string().trim().max(300).nullable().optional(),
  sourceType: z.string().trim().min(2).max(80).default("other"),
  url: z.string().url().max(2_000).nullable().optional(),
  citation: z.string().trim().max(2_000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    const [{ data: sources, error: sourceError }, { data: chunks, error: chunkError }, { data: candidates, error: candidateError }] = await Promise.all([
      supabaseAdmin
        .from("sources")
        .select("id, title, author, publisher_or_institution, source_type, source_status, approval_origin, approval_note, approved_at, approved_by_label, url, ingestion_status, ingested_at, last_ingestion_error, textual_layer")
        .order("title"),
      supabaseAdmin.from("source_chunks").select("id, source_id, embedding_status, chunk_personalities(count), chunk_parameter_fields(count)").eq("is_active", true),
      supabaseAdmin.from("candidate_claims").select("id, status, source_chunks(source_id)").in("status", ["pending", "needs_review"]),
    ]);
    if (sourceError || chunkError || candidateError) throw new CorpusError("DATABASE_FAILED", "Corpus source statistics could not be loaded.", 500, { cause: sourceError || chunkError || candidateError });
    const stats = new Map<string, { chunks: number; embedded: number; personalities: number; parameters: number; pendingCandidates: number }>();
    for (const source of sources || []) stats.set(source.id, { chunks: 0, embedded: 0, personalities: 0, parameters: 0, pendingCandidates: 0 });
    for (const chunk of chunks || []) {
      const value = stats.get(chunk.source_id);
      if (!value) continue;
      value.chunks += 1;
      if (chunk.embedding_status === "ready") value.embedded += 1;
      const personalityCount = Array.isArray(chunk.chunk_personalities) ? chunk.chunk_personalities[0]?.count || 0 : 0;
      const parameterCount = Array.isArray(chunk.chunk_parameter_fields) ? chunk.chunk_parameter_fields[0]?.count || 0 : 0;
      value.personalities += Number(personalityCount);
      value.parameters += Number(parameterCount);
    }
    for (const candidate of candidates || []) {
      const linked = Array.isArray(candidate.source_chunks) ? candidate.source_chunks[0] : candidate.source_chunks;
      const sourceId = linked?.source_id;
      if (sourceId && stats.has(sourceId)) stats.get(sourceId)!.pendingCandidates += 1;
    }
    return NextResponse.json({
      sources: (sources || []).map((source) => ({ ...source, ...(stats.get(source.id) || {}) })),
    });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "A valid source review decision is required.", 400);
    const { error } = await supabaseAdmin.from("sources").update({
      source_status: parsed.data.status,
      ...(parsed.data.status === "approved" ? {
        approval_origin: parsed.data.approvalOrigin,
        approval_note: parsed.data.approvalNote || "Approved in the corpus source review interface.",
        approved_at: new Date().toISOString(),
        approved_by_label: parsed.data.approvedByLabel,
      } : {}),
    }).eq("id", parsed.data.sourceId);
    if (error) throw new CorpusError("DATABASE_FAILED", "The source status could not be updated.", 500, { cause: error });
    return NextResponse.json({ success: true, ...parsed.data });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "The new source record is invalid.", 400);
    const normalizedUrl = parsed.data.url ? normalizeSourceUrl(parsed.data.url) : null;
    if (normalizedUrl) {
      const possibleUrls = [...new Set([
        normalizedUrl,
        parsed.data.url,
        normalizedUrl.endsWith("/") ? normalizedUrl.slice(0, -1) : `${normalizedUrl}/`,
      ].filter((value): value is string => Boolean(value)))];
      const { data: existingRows, error: lookupError } = await supabaseAdmin
        .from("sources")
        .select("id, title")
        .in("url", possibleUrls)
        .limit(1);
      if (lookupError) throw new CorpusError("DATABASE_FAILED", "Source duplication could not be checked.", 500, { cause: lookupError });
      const existing = existingRows?.[0];
      if (existing) {
        if (parsed.data.personalityId) await supabaseAdmin.from("source_personalities").upsert({ source_id: existing.id, personality_id: parsed.data.personalityId }, { onConflict: "source_id,personality_id", ignoreDuplicates: true });
        return NextResponse.json({ source: existing, reused: true });
      }
    }
    const { data, error } = await supabaseAdmin
      .from("sources")
      .insert({
        title: parsed.data.title,
        author: parsed.data.author || null,
        source_type: parsed.data.sourceType,
        url: normalizedUrl,
        citation: parsed.data.citation || null,
        source_status: "candidate",
        approval_origin: "human_manual",
        ingestion_status: "not_ingested",
      })
      .select("id, title")
      .single();
    if (error) throw new CorpusError("DATABASE_FAILED", "The source record could not be created.", 500, { cause: error });
    if (parsed.data.personalityId) {
      const linked = await supabaseAdmin.from("source_personalities").upsert({ source_id: data.id, personality_id: parsed.data.personalityId }, { onConflict: "source_id,personality_id", ignoreDuplicates: true });
      if (linked.error) throw new CorpusError("DATABASE_FAILED", "The source was created but could not be linked to the person.", 500, { cause: linked.error });
    }
    return NextResponse.json({ source: data, reused: false }, { status: 201 });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}
