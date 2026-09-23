import type { ParameterField } from "./types";
import { normalizeForMatch } from "./text";
import { canonicalizeTerms, type RoutingParameter, type TermAliasRecord } from "./personality-config";

export function routeParameterCodes(
  question: string,
  availableParameters: RoutingParameter[],
  maxCodes = 4,
): string[] {
  const normalized = normalizeForMatch(question);
  const tokens = new Set(normalized.split(" "));
  const scored = availableParameters
    .map((parameter) => ({
      code: parameter.code,
      score: [...(parameter.routingHints || []), ...parameter.code.split("_")].reduce(
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

  return scored.slice(0, maxCodes).map((item) => item.code);
}

export function fieldsForParameterCodes(
  fields: ParameterField[],
  codes: string[],
): ParameterField[] {
  const selected = new Set(codes);
  return fields.filter((field) => selected.has(field.parameterCode));
}

export function lexicalSearchExpression(
  question: string,
  personalityAliases: string[] = [],
  termAliases: TermAliasRecord[] = [],
): string {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
    "what", "who", "why", "how", "when", "where", "was", "were", "is", "are",
    "did", "does", "do", "his", "her", "their", "tell", "me", "about",
  ]);
  for (const alias of personalityAliases) {
    for (const token of normalizeForMatch(alias).split(" ")) stopWords.add(token);
  }
  const normalized = canonicalizeTerms(question, termAliases);
  const terms = normalized
    .split(" ")
    .filter((term) => term.length > 2 && !stopWords.has(term));
  const referenceTerms = (question.match(/\b\d+(?:\.\d+)+\b/g) || []).flatMap((reference) => reference.split("."));
  const expanded = termAliases
    .filter((item) => terms.includes(normalizeForMatch(item.canonicalTerm)))
    .map((item) => normalizeForMatch(item.alias));
  return [...new Set([...terms, ...referenceTerms, ...expanded])].slice(0, 12).join(" OR ");
}
