import { normalizeForMatch } from "@/lib/corpus/text";
import type { Citation, RetrievedEvidence } from "@/lib/corpus/types";
import { classifyQuestionScope, isBroadScope } from "./question-scope";

const framing = new Set(["what", "which", "when", "where", "why", "how", "who", "explain", "describe", "summarize", "tell", "find", "show", "give", "search", "look", "please", "was", "were", "did", "does", "the", "and", "for", "with", "from", "into", "about", "year", "date", "in", "on", "of", "to", "by", "related", "topic", "follow", "up", "follow up", "earlier"]);
const eventWords = /\b(?:award(?:ed)?|receive(?:d)?|won|winner|laureate|discover(?:ed|y)?|report(?:ed)?|observ(?:e|ed)|identif(?:y|ied)|found(?:ed)?|establish(?:ed)?|join(?:ed)?|appoint(?:ed)?|elect(?:ed)?)\b/i;
const eventRelations: Array<[RegExp, RegExp]> = [
  [/\b(?:award|awarded|prize|medal|receive|received|won)\b/i, /\b(?:award(?:ed)?|receiv(?:e|ed)|won|winner|laureate|honou?red|earn(?:ed|ing)?)\b/i],
  [/\b(?:discover|discovery|invent|invention)\b/i, /\b(?:discover(?:ed|y)?|invent(?:ed|ion)?|report(?:ed)?|observ(?:e|ed)|identif(?:y|ied))\b/i],
  [/\b(?:join|joined|appoint|appointed|elect|elected)\b/i, /\b(?:join(?:ed)?|appoint(?:ed|ment)?|elect(?:ed|ion)?)\b/i],
  [/\b(?:found|founded|establish|established)\b/i, /\b(?:found(?:ed)?|establish(?:ed|ment)?)\b/i],
  [/\b(?:die|died|death)\b/i, /\b(?:die|died|death|deceased|passed away)\b/i],
  [/\b(?:born|birth)\b/i, /\b(?:born|birth)\b/i],
];

export function splitEvidenceSentences(passage: string): string[] {
  return passage.split(/(?<!\b\p{Lu}\.)(?<=[.!?])\s+/u);
}

export function namedTargetTerms(question: string, aliases: string[]): string[] {
  const aliasWords = new Set(aliases.flatMap((alias) => normalizeForMatch(alias).split(" ")));
  return [...new Set((question.match(/\b\p{Lu}[\p{L}\p{N}-]*/gu) || [])
    .map(normalizeForMatch).filter((term) => term.length > 2 && !framing.has(term) && !aliasWords.has(term)))];
}

function sentenceAddressesTarget(question: string, passage: string, aliases: string[]): boolean {
  const text = normalizeForMatch(passage);
  const target = namedTargetTerms(question, aliases);
  if (target.some((term) => !text.split(" ").includes(term))) return false;
  if (eventRelations.some(([inQuestion, inPassage]) => inQuestion.test(question) && !inPassage.test(passage))) return false;
  if (/\b(?:when|what year|which year|what date|date of)\b/i.test(question)
    && !/\b(?:1[0-9]{3}|20[0-9]{2})\b/.test(passage)) return false;
  return true;
}

/** A date or event elsewhere in the same paragraph cannot support the target. */
export function passageAddressesTarget(question: string, passage: string, aliases: string[]): boolean {
  return splitEvidenceSentences(passage).some((sentence) => sentenceAddressesTarget(question, sentence, aliases));
}

/** Final cited passages must answer a narrow named fact, even if retrieval ranked other records highly. */
export function citedAnswerAddressesTarget(question: string, answer: string,
  selected: RetrievedEvidence[], citations: Citation[], aliases: string[]): boolean {
  if (isBroadScope(classifyQuestionScope(question))) return true;
  const target = namedTargetTerms(question, aliases);
  if (!target.length && !eventWords.test(question) && !/\b(?:when|year|date)\b/i.test(question)) return true;
  const citedIds = new Set([...answer.matchAll(/\[([^\]\n]+)\]/g)]
    .flatMap((match) => [...match[1].matchAll(/\b[CS]\d+\b/g)].map((id) => id[0])));
  if (!citedIds.size) return false;
  const cited = citations.map((citation, index) => ({ citation, evidence: selected[index] }))
    .filter(({ citation }) => citedIds.has(citation.id));
  if (cited.length !== citedIds.size) return false;
  const passages = cited.map(({ evidence }) => evidence.kind === "claim"
    ? evidence.storageMode === "metadata_only" ? evidence.text : evidence.evidenceExcerpt || "" : evidence.text);
  if (!passages.every((passage) => passageAddressesTarget(question, passage, aliases))) return false;
  if (/\b(?:when|year|date)\b/i.test(question)) {
    const answerYears = [...new Set(answer.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g) || [])];
    if (!answerYears.length || answerYears.some((year) => !passages.some((passage) =>
      splitEvidenceSentences(passage).some((sentence) => sentence.includes(year)
        && sentenceAddressesTarget(question, sentence, aliases))))) return false;
  }
  return true;
}
