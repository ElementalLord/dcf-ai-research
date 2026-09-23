import type { ParameterField } from "./types";
import { normalizeForMatch } from "./text";

const ROUTE_HINTS: Record<string, string[]> = {
  textual_contribution: ["text", "hymn", "rigveda", "veda", "mandala", "sukta", "verse", "mantra", "3 62 10", "river"],
  tapas_sadhana: ["tapas", "austerity", "ascetic", "discipline", "sadhana", "menaka", "rambha", "transformation"],
  philosophy: ["philosophy", "teaching", "doctrine", "metaphysical", "spiritual meaning", "aurobind", "river", "rivers"],
  parampara: ["lineage", "gotra", "disciple", "guru", "teacher", "student"],
  inner_qualities: ["virtue", "character", "anger", "compassion", "quality"],
  social_role: ["relationship", "rival", "vasistha", "rama", "lakshmana", "dasharatha", "shunahshepa", "teacher", "guide", "king"],
  historical_context: ["historical", "layer", "rigvedic", "ramayana", "mahabharata", "chronology", "era", "differ"],
  contested: ["conflict", "variant", "contested", "uncertain", "same name", "myth", "history"],
  contemporary_relevance: ["modern", "today", "contemporary", "aurobind", "ecological"],
  role: ["role", "rishi", "brahmarshi", "rajarshi", "sage", "king"],
};

export function routeParameterCodes(
  question: string,
  availableCodes: string[],
  maxCodes = 4,
): string[] {
  const normalized = normalizeForMatch(question);
  const tokens = new Set(normalized.split(" "));
  const scored = availableCodes
    .map((code) => ({
      code,
      score: (ROUTE_HINTS[code] || []).reduce(
        (sum, hint) => {
          const normalizedHint = normalizeForMatch(hint);
          const matches = normalizedHint.includes(" ")
            ? normalized.includes(normalizedHint)
            : tokens.has(normalizedHint);
          return sum + (matches ? 1 : 0);
        },
        0,
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));

  const selected = scored.slice(0, maxCodes).map((item) => item.code);
  const isCrossLayerComparison =
    (tokens.has("rigvedic") || tokens.has("rigveda")) &&
    tokens.has("ramayana");
  if (isCrossLayerComparison) {
    for (const code of ["textual_contribution", "role", "historical_context"]) {
      if (availableCodes.includes(code) && !selected.includes(code)) selected.push(code);
    }
  }
  return selected.slice(0, maxCodes);
}

export function fieldsForParameterCodes(
  fields: ParameterField[],
  codes: string[],
): ParameterField[] {
  const selected = new Set(codes);
  return fields.filter((field) => selected.has(field.parameterCode));
}

export function lexicalSearchExpression(question: string): string {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
    "what", "who", "why", "how", "when", "where", "was", "were", "is", "are",
    "did", "does", "do", "his", "her", "their", "tell", "me", "about",
    "vishvamitra", "vishwamitra", "visvamitra", "viswamitra", "kaushika", "kausika",
  ]);
  const terms = normalizeForMatch(question)
    .split(" ")
    .filter((term) => term.length > 2 && !stopWords.has(term));
  return [...new Set(terms)].slice(0, 10).join(" OR ") || normalizeForMatch(question);
}
