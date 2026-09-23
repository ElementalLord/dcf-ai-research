import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "./errors";

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;

function client(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new CorpusError("EMBEDDING_FAILED", "GEMINI_API_KEY is not configured.", 500);
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

async function retry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await retry(() =>
    client().models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts.map((text) => ({ parts: [{ text }] })),
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    }),
  ).catch((error) => {
    throw new CorpusError("EMBEDDING_FAILED", "Gemini could not create embeddings.", 502, { cause: error });
  });
  const vectors = response.embeddings?.map((embedding) => embedding.values || []) || [];
  if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
    throw new CorpusError("EMBEDDING_FAILED", "Gemini returned an unexpected embedding shape.", 502);
  }
  return vectors;
}

export async function embedSourceChunks(sourceId: string, batchSize = 16): Promise<{
  embedded: number;
  failed: number;
  model: string;
}> {
  const { data, error } = await supabaseAdmin
    .from("source_chunks")
    .select("id, chunk_text")
    .eq("source_id", sourceId)
    .eq("is_active", true)
    .or(`embedding.is.null,embedding_model.neq.${EMBEDDING_MODEL}`)
    .order("chunk_index");
  if (error) throw new CorpusError("DATABASE_FAILED", "Chunks could not be loaded for embedding.", 500, { cause: error });
  let embedded = 0;
  let failed = 0;
  for (let index = 0; index < (data || []).length; index += batchSize) {
    const batch = (data || []).slice(index, index + batchSize);
    await supabaseAdmin.from("source_chunks").update({ embedding_status: "pending", embedding_error: null }).in("id", batch.map((row) => row.id));
    try {
      const vectors = await embedTexts(batch.map((row) => row.chunk_text));
      for (let offset = 0; offset < batch.length; offset += 1) {
        const { error: updateError } = await supabaseAdmin
          .from("source_chunks")
          .update({
            embedding: vectors[offset],
            embedding_model: EMBEDDING_MODEL,
            embedding_dimensions: EMBEDDING_DIMENSIONS,
            embedding_status: "ready",
            embedding_error: null,
            embedded_at: new Date().toISOString(),
          })
          .eq("id", batch[offset].id);
        if (updateError) throw updateError;
        embedded += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Embedding failed.";
      failed += batch.length;
      await supabaseAdmin
        .from("source_chunks")
        .update({ embedding_status: "failed", embedding_error: message.slice(0, 1000) })
        .in("id", batch.map((row) => row.id));
    }
  }
  return { embedded, failed, model: EMBEDDING_MODEL };
}
