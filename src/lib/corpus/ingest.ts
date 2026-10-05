import { supabaseAdmin } from "@/lib/supabase-admin";
import { chunkSections, dedupeChunksByHash } from "./chunk";
import { CorpusError } from "./errors";
import { hashText } from "./text";
import type { IngestionInput } from "./types";

export async function ingestSections(input: IngestionInput): Promise<{
  sourceId: string;
  chunksCreated: number;
  chunksActive: number;
  contentHash: string;
}> {
  const chunks = dedupeChunksByHash(chunkSections(input.sections));
  if (chunks.length === 0) throw new CorpusError("NO_TEXT_EXTRACTED", "No non-empty chunks were produced.", 422);
  const contentHash = hashText(input.sections.map((section) => section.text).join("\n\n"));

  await supabaseAdmin.from("sources").update({ ingestion_status: "processing", last_ingestion_error: null }).eq("id", input.sourceId);

  try {
    const { data: existingChunks, error: existingError } = await supabaseAdmin
      .from("source_chunks").select("content_hash").eq("source_id", input.sourceId).limit(10_000);
    if (existingError) throw existingError;
    const existingHashes = new Set((existingChunks || []).map((row) => row.content_hash));
    const rows = chunks.map((chunk) => ({
      source_id: input.sourceId,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.text,
      section_title: chunk.sectionTitle,
      page_or_section: chunk.pageOrSection,
      start_offset: chunk.startOffset,
      end_offset: chunk.endOffset,
      language: input.language || null,
      textual_layer: input.textualLayer || null,
      content_hash: chunk.contentHash,
      token_estimate: chunk.tokenEstimate,
      metadata: chunk.metadata,
      is_active: true,
    }));

    const { data: stored, error } = await supabaseAdmin
      .from("source_chunks")
      .upsert(rows, { onConflict: "source_id,content_hash" })
      .select("id, content_hash");
    if (error) throw error;
    const activeIds = (stored || []).map((row) => row.id);
    if (activeIds.length > 0 && !input.append) {
      const { error: deactivateError } = await supabaseAdmin
        .from("source_chunks")
        .update({ is_active: false })
        .eq("source_id", input.sourceId)
        .not("id", "in", `(${activeIds.join(",")})`);
      if (deactivateError) throw deactivateError;
    }

    const personalityRows = activeIds.flatMap((chunkId) =>
      input.personalityIds.map((personalityId) => ({
        chunk_id: chunkId,
        personality_id: personalityId,
        relationship: "subject",
        relevance_score: 1,
        tagging_method: "manual",
        confidence: 1,
      })),
    );
    if (personalityRows.length > 0) {
      const { error: tagError } = await supabaseAdmin
        .from("chunk_personalities")
        .upsert(personalityRows, { onConflict: "chunk_id,personality_id" });
      if (tagError) throw tagError;
      const { error: sourceMappingError } = await supabaseAdmin.from("source_personalities").upsert(
        input.personalityIds.map((personalityId) => ({
          source_id: input.sourceId,
          personality_id: personalityId,
          relationship: "ingested_for",
          confidence: 1,
          mapping_method: "manual",
        })),
        { onConflict: "source_id,personality_id" },
      );
      if (sourceMappingError) throw sourceMappingError;
    }

    const fieldRows = activeIds.flatMap((chunkId) =>
      (input.parameterFieldIds || []).map((fieldId) => ({
        chunk_id: chunkId,
        parameter_field_id: fieldId,
        confidence: 1,
        tagging_method: "manual",
      })),
    );
    if (fieldRows.length > 0) {
      const { error: fieldError } = await supabaseAdmin
        .from("chunk_parameter_fields")
        .upsert(fieldRows, { onConflict: "chunk_id,parameter_field_id" });
      if (fieldError) throw fieldError;
    }

    const { error: sourceError } = await supabaseAdmin
      .from("sources")
      .update({
        ingestion_status: "ready",
        ingested_at: new Date().toISOString(),
        // A page-range ingest does not describe the whole document, so it keeps the prior document hash.
        ...(input.append ? {} : { content_hash: contentHash }),
        content_language: input.language || null,
        textual_layer: input.textualLayer || null,
        last_ingestion_error: null,
      })
      .eq("id", input.sourceId);
    if (sourceError) throw sourceError;

    return { sourceId: input.sourceId, chunksCreated: chunks.filter((chunk) => !existingHashes.has(chunk.contentHash)).length, chunksActive: activeIds.length, contentHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion failure.";
    await supabaseAdmin
      .from("sources")
      .update({ ingestion_status: "failed", last_ingestion_error: message.slice(0, 1000) })
      .eq("id", input.sourceId);
    throw new CorpusError("DATABASE_FAILED", "Source ingestion could not be saved.", 500, { cause: error });
  }
}
