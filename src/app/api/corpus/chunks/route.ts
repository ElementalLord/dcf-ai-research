import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertCorpusAdmin, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    const sourceId = request.nextUrl.searchParams.get("sourceId");
    if (!sourceId) throw new CorpusError("INVALID_INPUT", "sourceId is required.", 400);
    const { data, error } = await supabaseAdmin
      .from("source_chunks")
      .select("id, chunk_index, chunk_text, section_title, page_or_section, textual_layer, token_estimate, embedding_status, embedding_model, chunk_personalities(personality_id, confidence, tagging_method), chunk_parameter_fields(parameter_field_id, confidence, tagging_method)")
      .eq("source_id", sourceId)
      .eq("is_active", true)
      .order("chunk_index")
      .limit(500);
    if (error) throw new CorpusError("DATABASE_FAILED", "Source chunks could not be loaded.", 500, { cause: error });
    return NextResponse.json({ chunks: data || [] });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}
