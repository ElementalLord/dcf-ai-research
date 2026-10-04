import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "./errors";
import { boundedProviderCall, classifyProviderError, embeddingCircuit } from "./provider-health";
import { recordAiCall } from "./usage";
import { checkpointedAi } from "./ai-checkpoints";

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;

function client(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new CorpusError("EMBEDDING_FAILED", "GEMINI_API_KEY is not configured.", 500);
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  if (process.env.EMBEDDINGS_DISABLED === "true") throw new Error("Embeddings disabled by configuration");
  if (embeddingCircuit.state().open) throw new Error(`Embedding provider cooldown: ${embeddingCircuit.state().category}`);
  try {
    const ai = client();
    recordAiCall("embeddingCalls");
    const response = await boundedProviderCall((abortSignal) => ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts.map((text) => ({ parts: [{ text }] })),
      config: { outputDimensionality: EMBEDDING_DIMENSIONS, abortSignal, httpOptions: { retryOptions: { attempts: 1 } } },
    }), 3500);
    const vectors = response.embeddings?.map((embedding) => embedding.values || []) || [];
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) throw new Error("Unexpected embedding shape");
    embeddingCircuit.succeed();
    return vectors;
  } catch (error) {
    embeddingCircuit.fail(classifyProviderError(error));
    throw new CorpusError("EMBEDDING_FAILED", "Embeddings unavailable.", 502, { cause: error });
  }
}

export async function embedSourceChunks(sourceId: string, batchSize = 16): Promise<{
  embedded: number;
  failed: number;
  model: string;
  pausedReason: string | null;
}> {
  const data: Array<{ id: string; chunk_text: string; embedding_status: string; embedding_model: string | null }> = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabaseAdmin.from("source_chunks")
      .select("id,chunk_text,embedding_status,embedding_model").eq("source_id", sourceId)
      .eq("is_active", true).order("chunk_index").range(offset, offset + 499);
    if (result.error) throw new CorpusError("DATABASE_FAILED", "Chunks could not be loaded for embedding.", 500, { cause: result.error });
    data.push(...(result.data || []));
    if ((result.data?.length || 0) < 500) break;
  }
  let embedded = 0;
  let failed = 0;
  let pausedReason: string | null = null;
  for (let index = 0; index < (data || []).length; index += batchSize) {
    const batch = data.slice(index, index + batchSize);
    if (batch.every((row) => row.embedding_status === "ready" && row.embedding_model === EMBEDDING_MODEL)) continue;
    const batchInput = batch.map(({ id, chunk_text }) => ({ id, chunk_text }));
    await supabaseAdmin.from("source_chunks").update({ embedding_status: "pending", embedding_error: null }).in("id", batch.map((row) => row.id));
    try {
      await checkpointedAi<number[][]>("embeddings", { model: EMBEDDING_MODEL, batch: batchInput }, () => embedTexts(batch.map((row) => row.chunk_text)), async (vectors) => {
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
      });
    } catch (error) {
      const category = classifyProviderError(error);
      const message = category;
      pausedReason = category;
      failed += batch.length;
      await supabaseAdmin
        .from("source_chunks")
        .update({ embedding_status: "failed", embedding_error: message.slice(0, 1000) })
        .in("id", batch.map((row) => row.id));
      break; // Stop on provider failure; saved vectors are checkpoints and resume skips them.
    }
  }
  return { embedded, failed, model: EMBEDDING_MODEL, pausedReason };
}
