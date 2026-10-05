import type { ResolvedQuestionContext } from "@/lib/ask/query-context";
import type { QuestionScope } from "@/lib/ask/question-scope";
import type { Citation, RetrievedEvidence } from "./types";
import { normalizeWhitespace, truncateText } from "./text";
import { framedStatement } from "@/lib/claim-epistemics/language";

type EvidenceWithCitation = { item: RetrievedEvidence; citation: Citation };

export function aiSynthesisEnabled(value = process.env.SYNTHESIS_PROVIDER || process.env.AI_SYNTHESIS_MODE || (process.env.GEMINI_API_KEY ? "gemini" : "local")): boolean {
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
    ? framedStatement({ ...entry.item, text: simplifyClaim(entry.item.text, personality) })
    : simplifyPassage(entry.item);
}

/** Research-method notes are about how evidence is handled, not about the subject; they never lead an answer. */
function isMethodNote(item: RetrievedEvidence): boolean {
  return item.kind === "claim" && item.epistemicType === "METHODOLOGICAL";
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
  const withoutFramework = allPaired.filter((entry) => !isFrameworkRecord(entry.item) && !isMethodNote(entry.item));
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

function layerGroup(item: RetrievedEvidence): string {
  const layer = `${item.textualLayer || ""} ${item.sourceTitle || ""}`;
  const type = item.kind === "claim" ? item.epistemicType || "" : "";
  if (item.kind === "claim" && /\b(?:rigved\w*|vedic)\b[\s\S]{0,220}\b(?:ramayana|epic)\b/i.test(item.text)) return "cross-layer synthesis";
  if (type === "CONTESTED" || type === "HISTORICAL_INFERENCE" || /historical|contested/i.test(layer)) return "historical limits and disputed points";
  if (/SCHOLARLY|SYNTHETIC|MODERN|NORMATIVE/.test(type) || /scholar|interpretation|modern/i.test(layer)) return "interpretation and later reception";
  if (/rigveda|vedic|hymn/i.test(layer)) return "early textual picture";
  if (/ramayana|epic|narrative/i.test(layer) || type === "TRADITIONAL_NARRATIVE") return "later narrative";
  return "other supported context";
}

function relevantWords(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)?.filter((word) => !/^(what|when|where|which|about|with|from|this|that)$/.test(word)) || []);
}

function proposition(item: RetrievedEvidence): string {
  const raw = item.kind === "claim" ? simplifyClaim(item.text, item.personalityName || "the subject") : normalizeWhitespace(item.text).split(/(?<=[.!?])\s+/)[0];
  return truncateText(raw.replace(/^[•\-\s]+/, "").replace(/\s*\[[CS]\d+\]/g, ""), item.kind === "claim" ? 245 : 145).replace(/[;,:\s]+$/, "");
}

/** A bounded, claim-led research summary for provider outages. Passage-only answers stay short. */
export function renderExtractiveEvidence(selected: RetrievedEvidence[], citations: Citation[], broad: boolean, scope?: QuestionScope, question = "", responseStyle: "simple" | "balanced" | "detailed" | "research" = "balanced"): string {
  const questionWords = relevantWords(question);
  const historicalQuestion = /histor|confidence|certain|actually say/i.test(question);
  const scholarlyQuestion = /scholar|interpret/i.test(question);
  const relationshipQuestion = scope === "RELATIONSHIP";
  const textualComparison = /rigved|vedic/i.test(question) && /ramayana|epic/i.test(question);
  const seen = new Set<string>();
  const entries = selected.map((item, index) => ({ item, citation: citations[index] }))
    .filter((entry): entry is EvidenceWithCitation => Boolean(entry.citation) && !isFrameworkRecord(entry.item) && !isMethodNote(entry.item))
    .filter(({ item }) => !/current corpus|knowledge base|should be stored|should remain separately tagged|should itself be represented|can be used to teach|a modern learner|current source set/i.test(item.text))
    .filter(({ item }) => {
      const key = [...relevantWords(item.text)].join(" ") || normalizeWhitespace(item.text).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const claims = entries.filter(({ item }) => item.kind === "claim");
  const pool = claims.length ? claims : entries.filter(({ item }) => item.kind === "passage");
  const historicalPool = historicalQuestion ? pool.filter(({ item }) => item.kind === "claim" && (
    item.epistemicType === "TEXTUAL_ASSERTION" || item.epistemicType === "HISTORICAL_FACT" || item.epistemicType === "HISTORICAL_INFERENCE"
    || /historical biography|historical individual|historically|historical evidence|date|textual layers/i.test(item.text)
  ) && item.epistemicType !== "NORMATIVE_RELEVANCE") : pool;
  const interpretationPool = scholarlyQuestion ? pool.filter(({ item }) => item.kind === "claim" && (
    item.epistemicType === "SCHOLARLY_INTERPRETATION" || item.epistemicType === "SYNTHETIC_INTERPRETATION"
    || /contrast|basis of authority|interprets?|reading|scholarly|transformation motif/i.test(item.text)
  ) && /transform|king|royal|ascetic|brahmarshi|kshatriya|brahma/i.test(item.text)) : pool;
  const eligible = historicalQuestion ? historicalPool : scholarlyQuestion && interpretationPool.length ? interpretationPool : pool;
  const score = (entry: EvidenceWithCitation) => {
    const item = entry.item;
    const words = relevantWords(`${item.text} ${item.kind === "claim" ? `${item.parameterName} ${item.fieldLabel}` : item.parameterNames?.join(" ") || ""}`);
    const overlap = [...questionWords].filter((word) => words.has(word)).length;
    const group = layerGroup(item);
    const historical = historicalQuestion || /contested|disput/i.test(question);
    const significance = scope === "BROAD_SIGNIFICANCE";
    const code = item.kind === "claim" ? item.parameterCode || "" : item.parameterCodes?.join(" ") || "";
    const broadPriority = broad ? (significance
      ? /textual_contribution/.test(code) ? 22 : /role/.test(code) ? 16 : 0
      : /role/.test(code) ? 22 : /textual_contribution/.test(code) ? 16 : 0) : 0;
    const interpretive = scholarlyQuestion ? (/transformation|brahmarshi|kshatriya|ascetic|kingly/i.test(item.text) ? 15 : 0) + (/contrast|basis of authority|interprets?/.test(item.text) ? 20 : 0) : 0;
    const relationship = relationshipQuestion ? (/conflict|rival/i.test(item.text) ? 12 : 0) + (/recognition|acceptance|brahmarshi/i.test(item.text) ? 18 : 0) : 0;
    return overlap * 12 + interpretive + relationship + (historical && group === "historical limits and disputed points" ? 24 : 0)
      + broadPriority
      + (item.kind === "claim" ? 8 + Math.floor(profileScore(entry, item.personalityName || "") / 3) : 0)
      + (item.kind === "claim" && item.contractStatus === "SUPPORTED" ? 2 : 0)
      - Math.max(0, (item.text.match(/,/g)?.length || 0) - 3) * 4;
  };
  const ranked = [...eligible].sort((a, b) => score(b) - score(a));
  const limit = responseStyle === "simple" ? 2 : responseStyle === "research" ? 5 : responseStyle === "detailed" ? 4 : broad ? 3 : 2;
  const anchor = broad ? ranked.find(({ item }) => layerGroup(item) === "cross-layer synthesis") : undefined;
  const early = textualComparison ? ranked.find(({ item }) => layerGroup(item) === "early textual picture") : undefined;
  const later = textualComparison ? ranked.find((entry) => /ramayana|bala kanda/i.test(entry.item.text) && entry !== early) : undefined;
  const chosen: EvidenceWithCitation[] = textualComparison && early && later ? [early, later] : anchor ? [anchor] : [];
  const groupCounts = new Map<string, number>();
  for (const entry of chosen) groupCounts.set(layerGroup(entry.item), 1);
  for (const entry of ranked) {
    if (chosen.includes(entry)) continue;
    const group = layerGroup(entry.item);
    if (chosen.length >= limit) break;
    if (groupCounts.get(group) && ranked.some((candidate) => !groupCounts.has(layerGroup(candidate.item))) && broad) continue;
    chosen.push(entry);
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
  }
  if (!chosen.length) return "The approved knowledge base does not currently contain enough evidence to answer that fully.";
  if (historicalQuestion && !chosen.some(({ item }) => item.kind === "claim" && (item.epistemicType === "TEXTUAL_ASSERTION" || item.epistemicType === "HISTORICAL_FACT" || /historical biography|historical individual|historically/i.test(item.text))))
    return "The approved knowledge base does not currently contain enough evidence to answer that fully.";
  const sentence = ({ item, citation }: EvidenceWithCitation) => {
    const statement = proposition(item);
    const framed = item.kind === "claim" ? framedStatement({ ...item, text: statement }) : `The ${item.sourceTitle || "approved passage"} describes ${statement[0]?.toLowerCase() || ""}${statement.slice(1)}`;
    return `${framed.replace(/[.!?\s]+$/, "")}. [${citation.id}]`;
  };
  const [lead, ...rest] = chosen;
  const paragraphs: string[] = [];
  if (textualComparison && early && later) {
    const name = lead.item.personalityName || "this figure";
    paragraphs.push(`The earlier Vedic evidence associates material with ${name}, while the Ramayana develops an extended sage narrative. These are different textual layers, not a verified continuous biography. [${early.citation.id}] [${later.citation.id}]`);
  }
  if (historicalQuestion) {
    const name = lead.item.personalityName || "The subject";
    paragraphs.push(`The evidence supports statements about texts associated with ${name}, but it does not establish the later narrated life as a verified historical biography. ${chosen.slice(0, 2).map(({ citation }) => `[${citation.id}]`).join(" ")}`);
  }
  const leadSentence = sentence(lead);
  paragraphs.push(scope === "BROAD_SIGNIFICANCE"
    ? leadSentence.replace("is remembered in two main ways:", "is important in two connected traditions:")
    : leadSentence);
  const byLayer = new Map<string, EvidenceWithCitation[]>();
  for (const entry of rest) byLayer.set(layerGroup(entry.item), [...(byLayer.get(layerGroup(entry.item)) || []), entry]);
  for (const [group, groupEntries] of byLayer) {
    const prefix = group === "historical limits and disputed points" ? "Historical limits and disputed points: "
      : group === "interpretation and later reception" ? "Interpretation and later reception: "
      : group === "early textual picture" ? "Early textual picture: "
      : group === "later narrative" ? "Later narrative: " : "Related context: ";
    paragraphs.push(`${prefix}${groupEntries.map(sentence).join(" ")}`);
  }
  return paragraphs.join("\n\n");
}
