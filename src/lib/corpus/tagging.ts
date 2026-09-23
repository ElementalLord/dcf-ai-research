import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "./errors";
import { generateText, parseGeminiJson } from "./gemini";
import { routeParameterCodes } from "./routing";
import { normalizeForMatch, truncateText } from "./text";

type PersonalityRow = { id: string; canonical_name: string; alternate_names: string[] | null };
type FieldRow = {
  id: string;
  code: string;
  label: string;
  parameters: { code: string; name: string } | Array<{ code: string; name: string }> | null;
};

const VISHVAMITRA_ALIASES = [
  "vishvamitra",
  "vishwamitra",
  "visvamitra",
  "viśvāmitra",
  "gathina vishvamitra",
  "gathina visvamitra",
  "kauśika",
  "kaushika",
];

function aliasesFor(personality: PersonalityRow): string[] {
  const base = [personality.canonical_name, ...(personality.alternate_names || [])];
  if (normalizeForMatch(personality.canonical_name) === "vishvamitra") base.push(...VISHVAMITRA_ALIASES);
  return [...new Set(base.map(normalizeForMatch).filter(Boolean))];
}

function includesAlias(text: string, alias: string): boolean {
  if (alias === "vaishvamitra") return false;
  return new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`).test(text);
}

async function aiClassify(
  chunks: Array<{ id: string; chunk_text: string }>,
  parameterCodes: string[],
): Promise<Array<{ chunkId: string; codes: string[]; confidence: number }>> {
  if (chunks.length === 0) return [];
  const prompt = `You classify source passages into an existing research framework.
Return JSON only as an array of {"chunkId":"...","codes":["..."],"confidence":0.0}.
Use only these parameter codes: ${parameterCodes.join(", ")}.
Choose at most 3 codes per chunk. Classification is indexing, not factual approval.

${chunks.map((chunk) => `CHUNK ${chunk.id}\n${truncateText(chunk.chunk_text, 1200)}`).join("\n\n")}`;
  const { text } = await generateText(prompt, { timeoutMs: 30_000, errorCode: "TAGGING_FAILED" });
  const parsed = parseGeminiJson<Array<{ chunkId?: string; codes?: string[]; confidence?: number }>>(text);
  return parsed
    .filter((item) => item.chunkId && Array.isArray(item.codes))
    .map((item) => ({
      chunkId: item.chunkId as string,
      codes: (item.codes || []).filter((code) => parameterCodes.includes(code)).slice(0, 3),
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.6)),
    }));
}

export async function tagSourceChunks(sourceId: string, useAi = true): Promise<{
  personalityTags: number;
  parameterTags: number;
  aiClassified: number;
}> {
  const [{ data: chunks, error: chunkError }, { data: personalities, error: personalityError }, { data: fields, error: fieldError }] = await Promise.all([
    supabaseAdmin.from("source_chunks").select("id, chunk_text").eq("source_id", sourceId).eq("is_active", true).order("chunk_index"),
    supabaseAdmin.from("personalities").select("id, canonical_name, alternate_names"),
    supabaseAdmin.from("parameter_fields").select("id, code, label, parameters(code, name)"),
  ]);
  if (chunkError || personalityError || fieldError) {
    throw new CorpusError("TAGGING_FAILED", "Corpus tagging inputs could not be loaded.", 500, { cause: chunkError || personalityError || fieldError });
  }

  const typedPersonalities = (personalities || []) as PersonalityRow[];
  const typedFields = (fields || []) as FieldRow[];
  const codes = [...new Set(typedFields.map((field) => {
    const parameter = Array.isArray(field.parameters) ? field.parameters[0] : field.parameters;
    return parameter?.code;
  }).filter((code): code is string => Boolean(code)))];
  const personalityRows: Array<Record<string, unknown>> = [];
  const fieldRows: Array<Record<string, unknown>> = [];
  const needsAi: Array<{ id: string; chunk_text: string }> = [];

  for (const chunk of chunks || []) {
    const normalized = normalizeForMatch(chunk.chunk_text);
    for (const personality of typedPersonalities) {
      const match = aliasesFor(personality).find((alias) => includesAlias(normalized, alias));
      if (match) {
        personalityRows.push({
          chunk_id: chunk.id,
          personality_id: personality.id,
          relationship: "mentions",
          relevance_score: match.includes("kaushika") ? 0.65 : 0.9,
          tagging_method: "rule",
          confidence: match.includes("kaushika") ? 0.65 : 0.95,
        });
      }
    }
    const selectedCodes = routeParameterCodes(chunk.chunk_text, codes, 3);
    if (selectedCodes.length === 0) {
      needsAi.push(chunk);
    } else {
      for (const field of typedFields) {
        const parameter = Array.isArray(field.parameters) ? field.parameters[0] : field.parameters;
        if (parameter && selectedCodes.includes(parameter.code)) {
          fieldRows.push({ chunk_id: chunk.id, parameter_field_id: field.id, confidence: 0.75, tagging_method: "rule" });
        }
      }
    }
  }

  let aiClassified = 0;
  if (useAi && needsAi.length > 0) {
    for (let index = 0; index < needsAi.length; index += 8) {
      const classified = await aiClassify(needsAi.slice(index, index + 8), codes);
      for (const item of classified) {
        aiClassified += 1;
        for (const field of typedFields) {
          const parameter = Array.isArray(field.parameters) ? field.parameters[0] : field.parameters;
          if (parameter && item.codes.includes(parameter.code)) {
            fieldRows.push({ chunk_id: item.chunkId, parameter_field_id: field.id, confidence: item.confidence, tagging_method: "ai" });
          }
        }
      }
    }
  }

  if (personalityRows.length > 0) {
    const { error } = await supabaseAdmin.from("chunk_personalities").upsert(personalityRows, { onConflict: "chunk_id,personality_id" });
    if (error) throw new CorpusError("TAGGING_FAILED", "Personality tags could not be saved.", 500, { cause: error });
  }
  if (fieldRows.length > 0) {
    const { error } = await supabaseAdmin.from("chunk_parameter_fields").upsert(fieldRows, { onConflict: "chunk_id,parameter_field_id" });
    if (error) throw new CorpusError("TAGGING_FAILED", "Parameter tags could not be saved.", 500, { cause: error });
  }
  return { personalityTags: personalityRows.length, parameterTags: fieldRows.length, aiClassified };
}
