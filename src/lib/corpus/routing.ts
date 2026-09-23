import type { ParameterField } from "./types";
import { normalizeForMatch } from "./text";
import { canonicalizeTerms, type RoutingParameter, type TermAliasRecord } from "./personality-config";

const BROAD_SYNTHESIS_PATTERNS = [
  /\bwho is\b/i,
  /\bknown for\b/i,
  /\btell me about\b/i,
  /\b(?:overview|biograph\w*|profile|introduce)\b/i,
  /\bwhy (?:is|was|are|were) .{0,60}\bimportant\b/i,
  /\bwhat (?:did|does|has) .{0,60}\b(?:accomplish|accomplished|contribute|contributed)\b/i,
  /\b(?:biggest|greatest|main|primary|most important|most influential|most significant)\s+(?:contribution|achievement|accomplishment|role|legacy)\b/i,
];

const SUBJECTIVE_SUPERLATIVE_PATTERN = /\b(?:biggest|greatest|main|best known|most important|most influential|most significant|primary)\b/i;

export function isBroadSynthesisQuestion(question: string): boolean {
  return BROAD_SYNTHESIS_PATTERNS.some((pattern) => pattern.test(question));
}

export function isSubjectiveSuperlativeQuestion(question: string): boolean {
  return SUBJECTIVE_SUPERLATIVE_PATTERN.test(question);
}

export function routeParameterCodes(
  question: string,
  availableParameters: RoutingParameter[],
  maxCodes = 4,
): string[] {
  const normalized = normalizeForMatch(question);
  const relationshipContext = /\b(?:what happened between|relationship between|between\s+\S+\s+and|rival|disagree)\b/i.test(question);
  const routingText = relationshipContext ? `${normalized} relationship` : normalized;
  const rawTokens = routingText.split(" ");
  const tokens = new Set(rawTokens.flatMap((token) => token.length > 4 && token.endsWith("s") ? [token, token.slice(0, -1)] : [token]));
  const scored = availableParameters
    .map((parameter) => ({
      code: parameter.code,
      score: [...(parameter.routingHints || []), ...parameter.code.split("_")].reduce(
        (sum, hint) => {
          const normalizedHint = normalizeForMatch(hint);
          const matches = normalizedHint.includes(" ")
            ? routingText.includes(normalizedHint)
            : tokens.has(normalizedHint) || (normalizedHint.length > 4 && normalizedHint.endsWith("s") && tokens.has(normalizedHint.slice(0, -1)));
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
