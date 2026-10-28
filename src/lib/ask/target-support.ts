import { normalizeForMatch } from "@/lib/corpus/text";
import type { Citation, RetrievedEvidence } from "@/lib/corpus/types";
import { classifyQuestionScope, isBroadScope, isChangeImpactQuestion, isEnduringRelevanceQuestion } from "./question-scope";

const framing = new Set(["what", "which", "when", "where", "why", "how", "who", "could", "would", "should", "can", "may", "might", "explain", "describe", "summarize", "tell", "find", "show", "give", "search", "look", "please", "was", "were", "did", "does", "the", "and", "for", "with", "from", "into", "about", "year", "date", "in", "on", "of", "to", "by", "related", "topic", "follow", "up", "follow up", "earlier"]);
const eventWords = /\b(?:award(?:ed)?|receive(?:d)?|won|winner|laureate|discover(?:ed|y)?|report(?:ed)?|observ(?:e|ed)|identif(?:y|ied)|found(?:ed)?|establish(?:ed)?|join(?:ed)?|appoint(?:ed)?|elect(?:ed)?)\b/i;
const eventRelations: Array<[RegExp, RegExp]> = [
  [/\b(?:award|awarded|prize|medal|receive|received|won)\b/i, /\b(?:award(?:ed)?|receiv(?:e|ed)|won|winner|laureate|honou?red|earn(?:ed|ing)?)\b/i],
  [/\b(?:discover|discovery|invent|invention)\b/i, /\b(?:discover(?:ed|y)?|invent(?:ed|ion)?|report(?:ed)?|observ(?:e|ed)|identif(?:y|ied))\b/i],
  [/\b(?:join|joined|appoint|appointed|elect|elected)\b/i, /\b(?:join(?:ed)?|appoint(?:ed|ment)?|elect(?:ed|ion)?)\b/i],
  [/\b(?:found|founded|establish|established)\b/i, /\b(?:found(?:ed)?|establish(?:ed|ment)?)\b/i],
  [/\b(?:die|died|death)\b/i, /\b(?:die|died|death|deceased|passed away)\b/i],
  [/\b(?:born|birth)\b/i, /\b(?:born|birth)\b/i],
];
const requestedWork = /\b(?:what|which) (?:did|does|has)\b.{0,100}\b(?:perform|sing|play|recite|read|compose|write)\b.{0,80}\b(?:at|in|during|for)\b/i;
const workWithObject = /\b(?:performed?|sang|played|recited?|read|composed?|wrote)\s+(?!(?:at|in|during|for|before|on|to|with|by|among|across|live|there|publicly|again)\b)(?:(?:a|an|the|her|his|their)\s+)?[\p{L}"“][\p{L}'"” -]{2,80}/iu;
const workBeforeVerb = /\b(?:hymn|song|composition|piece|work|poem|speech|selection)\s+['"“]?[\p{Lu}][\p{L}' -]{3,80}['"”]?,?\s+(?:which|that)\b.{0,80}\b(?:performed?|sang|played|recited?|read|composed?|wrote)\b/iu;

export function splitEvidenceSentences(passage: string): string[] {
  return passage.split(/(?<!\b\p{Lu}\.)(?<=[.!?])\s+/u);
}

export const asksForPerformedWork = (question: string) => requestedWork.test(question);

export function namedTargetTerms(question: string, aliases: string[]): string[] {
  const aliasWords = new Set(aliases.flatMap((alias) => normalizeForMatch(alias).split(" ")));
  return [...new Set((question.match(/\b\p{Lu}[\p{L}\p{N}-]*/gu) || [])
    .map(normalizeForMatch).filter((term) => term.length > 2 && !framing.has(term) && !aliasWords.has(term)))];
}

function sentenceAddressesTarget(question: string, passage: string, aliases: string[]): boolean {
  const text = normalizeForMatch(passage);
  const target = namedTargetTerms(question, aliases);
  const aliasWords = new Set(aliases.flatMap((alias) => normalizeForMatch(alias).split(" ")));
  const acronyms = (question.match(/\b\p{Lu}[\p{L}\p{N}-]*(?:\s+\p{Lu}[\p{L}\p{N}-]*)+/gu) || [])
    .map((phrase) => phrase.split(/\s+/).map(normalizeForMatch).filter((word) => !aliasWords.has(word)))
    .filter((words) => words.length >= 2 && words.every((word) => word.length > 1))
    .filter((words) => new RegExp(`\\b${words.map((word) => word[0]).join("")}\\b`, "i").test(passage))
    .flat();
  if (target.some((term) => !text.split(" ").includes(term) && !acronyms.includes(term))) return false;
  if (eventRelations.some(([inQuestion, inPassage]) => inQuestion.test(question) && !inPassage.test(passage))) return false;
  if (requestedWork.test(question) && !workWithObject.test(passage) && !workBeforeVerb.test(passage)) return false;
  if (/\b(?:when|what year|which year|what date|date of)\b/i.test(question)
    && !/\b(?:1[0-9]{3}|20[0-9]{2})\b/.test(passage)) return false;
  return true;
}

/** A date or event elsewhere in the same paragraph cannot support the target. */
export function passageAddressesTarget(question: string, passage: string, aliases: string[]): boolean {
  return splitEvidenceSentences(passage).some((sentence) => sentenceAddressesTarget(question, sentence, aliases));
}

/** Reject fluent replies that discuss a person but omit the requested impact or work. */
export function answerAddressesRequestedImpact(question: string, answer: string): boolean {
  if (isEnduringRelevanceQuestion(question)) {
    const lasting = /\b(?:influenc\w*|inspir\w*|lasting|enduring|continu\w*|still|today|modern|generation\w*|legacy|remain\w*|relevant)\b/i.test(answer);
    const asksPoetry = /\b(?:poems?|poetry)\b/i.test(question);
    return lasting && (!asksPoetry || /\b(?:poems?|poetry|poetic)\b/i.test(answer));
  }
  if (isChangeImpactQuestion(question)) {
    return /\b(?:influenc\w*|inspir\w*|transform\w*|chang\w*|reshap\w*|introduc\w*|pioneer\w*|shift\w*|enabled?|opened?|advanced?|moderniz\w*)\b/i.test(answer);
  }
  return true;
}

/** Final cited passages must answer a narrow named fact, even if retrieval ranked other records highly. */
export function citedAnswerAddressesTarget(question: string, answer: string,
  selected: RetrievedEvidence[], citations: Citation[], aliases: string[]): boolean {
  if (!answerAddressesRequestedImpact(question, answer)) return false;
  if (isBroadScope(classifyQuestionScope(question))) return true;
  const target = namedTargetTerms(question, aliases);
  if (!target.length && !eventWords.test(question) && !/\b(?:when|year|date)\b/i.test(question) && !asksForPerformedWork(question)) return true;
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
