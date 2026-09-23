import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "./errors";
import { generateText, parseGeminiJson } from "./gemini";
import { routeParameterCodes } from "./routing";
import { normalizeForMatch, truncateText } from "./text";
import { normalizedAliases, selectPrimaryCategory, type AliasRecord } from "./personality-config";

type PersonalityRow = {
  id: string;
  canonical_name: string;
  personality_aliases: Array<{ alias: string; alias_type: string; confidence: number; is_ambiguous: boolean }> | null;
  personality_categories: Array<{ category_id: string; is_primary: boolean }> | null;
};
type FieldRow = {
  id: string;
  code: string;
  label: string;
  parameters: { code: string; name: string; category_id: string; routing_hints: string[] | null } | Array<{ code: string; name: string; category_id: string; routing_hints: string[] | null }> | null;
};

function aliasesFor(personality: PersonalityRow): string[] {
  return normalizedAliases(personality.canonical_name, (personality.personality_aliases || []).map((row): AliasRecord => ({
    alias: row.alias,
    aliasType: row.alias_type,
    confidence: row.confidence,
    isAmbiguous: row.is_ambiguous,
  })));
}

function includesAlias(text: string, alias: string): boolean {
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
    supabaseAdmin.from("personalities").select("id, canonical_name, personality_aliases(alias, alias_type, confidence, is_ambiguous), personality_categories(category_id, is_primary)"),
    supabaseAdmin.from("parameter_fields").select("id, code, label, parameters(code, name, category_id, routing_hints)"),
  ]);
  if (chunkError || personalityError || fieldError) {
    throw new CorpusError("TAGGING_FAILED", "Corpus tagging inputs could not be loaded.", 500, { cause: chunkError || personalityError || fieldError });
  }

  const typedPersonalities = (personalities || []) as PersonalityRow[];
  const typedFields = (fields || []) as FieldRow[];
  const personalityRows: Array<Record<string, unknown>> = [];
  const fieldRows: Array<Record<string, unknown>> = [];
  const needsAi: Array<{ id: string; chunk_text: string; categoryIds: string[] }> = [];

  for (const chunk of chunks || []) {
    const normalized = normalizeForMatch(chunk.chunk_text);
    const matchedCategoryIds = new Set<string>();
    for (const personality of typedPersonalities) {
      const match = aliasesFor(personality).find((alias) => includesAlias(normalized, alias));
      if (match) {
        const membership = selectPrimaryCategory(personality.personality_categories || []);
        if (membership) matchedCategoryIds.add(membership.category_id);
        personalityRows.push({
          chunk_id: chunk.id,
          personality_id: personality.id,
          relationship: "mentions",
          relevance_score: 0.9,
          tagging_method: "rule",
          confidence: 0.95,
        });
      }
    }
    const applicableFields = typedFields.filter((field) => {
      const parameter = Array.isArray(field.parameters) ? field.parameters[0] : field.parameters;
      return parameter && matchedCategoryIds.has(parameter.category_id);
    });
    const routingParameters = [...new Map(applicableFields.map((field) => {
      const parameter = Array.isArray(field.parameters) ? field.parameters[0] : field.parameters;
      return parameter ? [parameter.code, { code: parameter.code, routingHints: parameter.routing_hints }] : ["", { code: "", routingHints: [] }];
    })).values()].filter((parameter) => parameter.code);
    const selectedCodes = routeParameterCodes(chunk.chunk_text, routingParameters, 3);
    if (selectedCodes.length === 0) {
      if (applicableFields.length > 0) needsAi.push({ ...chunk, categoryIds: [...matchedCategoryIds] });
    } else {
      for (const field of applicableFields) {
        const parameter = Array.isArray(field.parameters) ? field.parameters[0] : field.parameters;
        if (parameter && selectedCodes.includes(parameter.code)) {
          fieldRows.push({ chunk_id: chunk.id, parameter_field_id: field.id, confidence: 0.75, tagging_method: "rule" });
        }
      }
    }
  }

  let aiClassified = 0;
  if (useAi && needsAi.length > 0) {
    const groups = new Map<string, typeof needsAi>();
    for (const chunk of needsAi) {
      const key = [...chunk.categoryIds].sort().join(",");
      groups.set(key, [...(groups.get(key) || []), chunk]);
    }
    for (const [categoryKey, group] of groups) {
      const categoryIds = new Set(categoryKey.split(",").filter(Boolean));
      const fields = typedFields.filter((field) => {
        const parameter = Array.isArray(field.parameters) ? field.parameters[0] : field.parameters;
        return parameter && categoryIds.has(parameter.category_id);
      });
      const codes = [...new Set(fields.map((field) => {
        const parameter = Array.isArray(field.parameters) ? field.parameters[0] : field.parameters;
        return parameter?.code;
      }).filter((code): code is string => Boolean(code)))];
      for (let index = 0; index < group.length; index += 8) {
        const classified = await aiClassify(group.slice(index, index + 8), codes);
        for (const item of classified) {
          aiClassified += 1;
          for (const field of fields) {
            const parameter = Array.isArray(field.parameters) ? field.parameters[0] : field.parameters;
            if (parameter && item.codes.includes(parameter.code)) {
              fieldRows.push({ chunk_id: item.chunkId, parameter_field_id: field.id, confidence: item.confidence, tagging_method: "ai" });
            }
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
