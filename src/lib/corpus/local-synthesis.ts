import type { ResolvedQuestionContext } from "@/lib/ask/query-context";
import type { Citation, RetrievedEvidence } from "./types";
import { normalizeWhitespace, truncateText } from "./text";

type EvidenceWithCitation = { item: RetrievedEvidence; citation: Citation };

export function aiSynthesisEnabled(value = process.env.AI_SYNTHESIS_MODE): boolean {
  return value === "gemini";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFrameworkRecord(item: RetrievedEvidence): boolean {
  return /parameters to study|research framework/i.test(`${item.sourceTitle || ""} ${item.textualLayer || ""}`);
}

function profileScore(entry: EvidenceWithCitation, personality: string): number {
  const item = entry.item;
  const text = normalizeWhitespace(item.text);
  const metadata = item.kind === "claim" ? `${item.parameterName || ""} ${item.fieldLabel || ""}` : "";
  let score = item.kind === "claim" ? 8 : 0;
  if (/identity|profile|vocation|biograph|^role\b|vocation\s*\/\s*role/i.test(metadata)) score += 12;
  if (/historical and textual context|textual history|chronolog/i.test(metadata)) score += 9;
  if (/parampara|lineage/i.test(metadata)) score += 5;
  if (new RegExp(`\\b${escapeRegExp(personality)}\\b`, "i").test(text)) score += 3;
  if (/teacher|guide|seer|sage|rishi|king|poet|author|founder/i.test(text)) score += 5;
  if (/\b(?:in|across) the .{0,80}(?:;|, and|while).{0,80}\bin the\b/i.test(text)) score += 5;
  if (/metadata|metrical|portal records|current source set|research framework|should be stored|does not justify/i.test(text)) score -= 8;
  if (/\b\d+(?:\.\d+)+\b/.test(text)) score -= 3;
  if (isFrameworkRecord(item)) score -= 20;
  return score;
}

function removeEditorialLanguage(value: string): string {
  return value
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/should be stored|research framework|current source set|safest classification|does not yield a simple measurable verdict/i.test(sentence))
    .join(" ");
}

function simplifyClaim(value: string, personality: string): string {
  const text = removeEditorialLanguage(normalizeWhitespace(value));
  const name = escapeRegExp(personality);
  const crossTradition = new RegExp(
    `^In the ([^,]+) layer, ${name}(?: and (?:his|her|their) family)? (?:is|are) associated with (.+?) as (.+?); in the ([^,]+), ${name} also functions as (.+?)[.]?$`,
    "i",
  );
  const crossMatch = text.match(crossTradition);
  if (crossMatch) {
    const firstTradition = crossMatch[1].replace(/ic$/i, "a");
    const association = crossMatch[2];
    const firstRole = /mantra-seer/i.test(crossMatch[3]) ? "a seer of sacred hymns" : crossMatch[3];
    const secondTradition = crossMatch[4];
    const secondRole = crossMatch[5].replace(/^an?\s+/i, "");
    const secondArticle = /^[aeiou]/i.test(secondRole) ? "an" : "a";
    return `${personality} is remembered in two main ways: in the ${firstTradition}, as ${firstRole} linked to ${association}; and in the ${secondTradition}, as ${secondArticle} ${secondRole}.`;
  }

  const developmentPattern = new RegExp(`^In the (.+?) tradition, ${name} passes through (.+?) and is ultimately recognized as (.+?)[.]`, "i");
  const developmentMatch = text.match(developmentPattern);
  if (developmentMatch) {
    const development = /royal and ascetic statuses/i.test(developmentMatch[2])
      ? "moves from royal life into ascetic life"
      : `moves through ${developmentMatch[2]}`;
    return `The ${developmentMatch[1]} describes a transformation: ${personality} ${development} before being recognized as ${developmentMatch[3]}. This is part of a traditional narrative, not a modern historical record.`;
  }

  const textualHistoryPattern = /^For a source-grounded profile, the safest placement is by textual layer: .+? appears in (.+?), while .+? receives an extended biography in the (.+?) tradition[.] The selected sources do not justify one absolute historical date[.]$/i;
  const textualHistoryMatch = text.match(textualHistoryPattern);
  if (textualHistoryMatch) {
    const earlyTradition = textualHistoryMatch[1].replace(/Rigvedic material/i, "the Rigveda");
    return `The earliest approved sources connect ${personality} with ${earlyTradition}, while the ${textualHistoryMatch[2]} gives a much fuller life story. The evidence does not support one certain historical date.`;
  }

  const powerPattern = new RegExp(`^The ([^ ]+) attributes (.+?) to ${name}, including .*?episodes such as (.+?)[.]`, "i");
  const powerMatch = text.match(powerPattern);
  if (powerMatch) {
    return `${powerMatch[1]} stories portray ${personality} as having ${powerMatch[2]}, especially in stories involving ${powerMatch[3]}. These are traditional religious narratives, not independently verified history.`;
  }

  const designationPattern = new RegExp(`^Vedic seer metadata repeatedly uses the designation (.+?), linking this ${name} tradition with (.+?) terminology[.]?$`, "i");
  const designationMatch = text.match(designationPattern);
  if (designationMatch) {
    return `Vedic records also use the name ${designationMatch[1]}, connecting ${personality} with the ${designationMatch[2]} lineage.`;
  }

  return truncateText(text
    .replace(/\bIn the Rigvedic layer\b/gi, "In the Rigveda")
    .replace(/\bmantra-seers\b/gi, "seers of sacred hymns")
    .replace(/\balso functions as\b/gi, "is also presented as")
    .replace(/\bThe Ramayana attributes\b/gi, "Ramayana stories attribute")
    .replace(/\bnot independently verified empirical events\b/gi, "not independently verified history")
    .replace(/\bVedic seer metadata repeatedly uses the designation\b/gi, "Vedic records also use the name")
    .replace(/\bterminology\b/gi, "lineage"), 360);
}

function simplifyPassage(item: Extract<RetrievedEvidence, { kind: "passage" }>): string {
  const cleaned = removeEditorialLanguage(normalizeWhitespace(item.text));
  const firstSentences = cleaned.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  const location = item.pageOrSection ? ` (${item.pageOrSection})` : "";
  return `${item.sourceTitle}${location} describes: ${truncateText(firstSentences, 300)}`;
}

function simplified(entry: EvidenceWithCitation, personality: string): string {
  return entry.item.kind === "claim"
    ? simplifyClaim(entry.item.text, personality)
    : simplifyPassage(entry.item);
}

function withCitation(entry: EvidenceWithCitation, personality: string): string {
  return `${simplified(entry, personality)} [${entry.citation.id}]`;
}

export function synthesizeFromLocalEvidence(
  personality: string,
  selected: RetrievedEvidence[],
  citations: Citation[],
  context: Pick<ResolvedQuestionContext, "broadSynthesis" | "subjectiveSuperlative">,
): string {
  const allPaired = selected
    .map((item, index) => ({ item, citation: citations[index] }))
    .filter((entry): entry is EvidenceWithCitation => Boolean(entry.citation));
  const withoutFramework = allPaired.filter((entry) => !isFrameworkRecord(entry.item));
  const paired = withoutFramework.length > 0 ? withoutFramework : allPaired;
  const unique = paired.filter((entry, index, all) =>
    all.findIndex((candidate) => normalizeWhitespace(candidate.item.text) === normalizeWhitespace(entry.item.text)) === index,
  );

  if (context.broadSynthesis) {
    const ranked = [...unique].sort((left, right) => profileScore(right, personality) - profileScore(left, personality));
    const overview = ranked[0] || unique[0];
    const supporting = ranked.filter((entry) => entry !== overview).slice(0, 2);
    const opening = context.subjectiveSuperlative
      ? `The available sources do not prove that ${personality} had one objectively “biggest” contribution. They point instead to several important roles.`
      : withCitation(overview, personality);
    const details = context.subjectiveSuperlative
      ? [overview, ...supporting].filter(Boolean).map((entry) => `- ${withCitation(entry, personality)}`).join("\n\n")
      : supporting.map((entry) => `- ${withCitation(entry, personality)}`).join("\n\n");
    return `### In brief\n\n${opening}${details ? `\n\n### What the sources emphasize\n\n${details}` : ""}`;
  }

  const [primary, ...rest] = unique.slice(0, 4);
  const supporting = rest.map((entry) => `- ${withCitation(entry, personality)}`).join("\n\n");
  return `### Short answer\n\n${withCitation(primary, personality)}${supporting ? `\n\n### Supporting context\n\n${supporting}` : ""}`;
}
