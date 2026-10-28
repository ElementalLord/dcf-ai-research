import { normalizeForMatch } from "@/lib/corpus/text";
import type { RetrievedEvidence } from "@/lib/corpus/types";
import { canonicalizeTerms, type TermAliasRecord } from "@/lib/corpus/personality-config";
import { classifyQuestionScope, isBroadScope, isEnduringRelevanceQuestion, type QuestionScope } from "@/lib/ask/question-scope";
import { detectLens, LENS_FRAMING_TERMS } from "@/lib/ask/lenses";
import { CONTEXT_EVIDENCE, CONTEXT_FRAMING_TERMS, CONTEXT_GAP, detectContextIntent, PERIOD_EVIDENCE } from "@/lib/ask/historical-context";
import { independentWorkCount } from "./research-quality";
import { splitEvidenceSentences } from "@/lib/ask/target-support";

const IGNORED = new Set(["the", "and", "for", "its", "that", "this", "then", "his", "her", "what", "when", "where", "which", "who", "why", "how", "does", "did", "is", "are", "was", "were", "about", "from", "with", "into", "between", "year", "date", "role", "play", "played", "major", "story", "explain", "relationship", "relation", "significance", "significant", "happen", "happens", "happened", "disagree", "disagreed", "disagreement", "find", "show", "tell", "give", "search", "look", "please"]);

function normalizeAliases(value: string, termAliases: TermAliasRecord[]): string {
  return canonicalizeTerms(value, termAliases)
    .replace(/\b(?:legacy|contributions?)\b/g, "contribution")
    .replace(/\brigvedic\b/g, "rigveda")
    .replace(/\b(?:uncertainties|uncertainty|uncertain)\b/g, "uncertain")
    .replace(/\b(?:historically|historical)\b/g, "history")
    .replace(/\bsame figure\b/g, "same name");
}

function concepts(question: string, personalityAliases: string[], termAliases: TermAliasRecord[]): string[] {
  const intentWords = new Set([
    "evidence", "link", "links", "linked", "development", "develop", "developed",
    "evolve", "evolved", "evolution", "trace", "portrayed", "reconstruct", "reconstructing",
    "references", "reference", "parts", "regarding", "different", "difference",
    "differ", "become", "became", "biggest", "greatest", "main", "most", "important", "known", "contribution", "contributions", "associated", "associate",
  ]);
  const ignored = new Set(IGNORED);
  for (const alias of personalityAliases) {
    for (const token of normalizeForMatch(alias).split(" ")) ignored.add(token);
  }
  return normalizeAliases(question, termAliases).split(" ").filter((term) => term.length > 2 && !ignored.has(term) && !intentWords.has(term));
}

export type SufficiencyDecision = {
  sufficient: boolean;
  answerable: boolean;
  mode: "FAST" | "EXPANDED" | "RESEARCH";
  coverage: number;
  reason: string;
  missingDimensions: string[];
};

export function directlySupportsRequestedLens(question: string, item: RetrievedEvidence, personalityAliases: string[]): boolean {
  const lens = detectLens(question);
  if (!lens) return true;
  const names = [...personalityAliases, item.personalityName || ""].map(normalizeForMatch).filter((name) => name.length >= 4);
  // Approved claims are already bound to this person. Their prose often uses a
  // surname while the selected identity is stored in full.
  if (item.kind === "claim") {
    const surname = normalizeForMatch(item.personalityName || "").split(" ").at(-1) || "";
    if (surname.length >= 5) names.push(surname);
  }
  return splitEvidenceSentences(item.text).flatMap((sentence) => sentence.split(/;\s*/)).some((sentence) => {
    const normalized = ` ${normalizeForMatch(sentence)} `;
    return lens.evidence.test(sentence) && (!names.length || names.some((name) => normalized.includes(` ${name} `))
      || /^(?:his|her|their)\b/i.test(sentence.trim()));
  });
}

export function assessEvidenceSufficiency(
  question: string,
  evidence: RetrievedEvidence[],
  options: { personalityAliases?: string[]; termAliases?: TermAliasRecord[]; allParameters?: Array<{ code: string; name: string }> } = {},
): SufficiencyDecision {
  const personalityAliases = options.personalityAliases || [];
  const termAliases = options.termAliases || [];
  const scope: QuestionScope = classifyQuestionScope(question);
  const broadProfile = isBroadScope(scope);
  if (!broadProfile && personalityAliases.length) {
    const references = question.match(/\b\d+(?:\.\d+)+\b/g) || [];
    evidence = evidence.filter((item) => {
      if (item.kind === "claim" || item.origin !== "live_cache") return true;
      const text = ` ${normalizeForMatch(`${item.text} ${item.sourceTitle || ""} ${item.kind === "passage" ? item.sectionTitle || "" : ""}`)} `;
      const named = personalityAliases.some((alias) => text.includes(` ${normalizeForMatch(alias)} `));
      const exactReference = references.some((reference) => `${item.pageOrSection || ""} ${item.sourceTitle || ""}`.includes(reference));
      return named || exactReference;
    });
  }
  const lens = detectLens(question);
  const contextIntent = detectContextIntent(question);
  // Framing words ("angle", "at the time") name how to answer, not a fact the evidence must contain.
  const framing = new Set([...(lens ? LENS_FRAMING_TERMS : []), ...(contextIntent ? CONTEXT_FRAMING_TERMS : [])]);
  const requested = concepts(question.replace(/^Selected (?:personality|comparison set):[^.]*\.\s*/i, ""), personalityAliases, termAliases)
    .filter((term) => !framing.has(term) && !(lens && lens.ask.test(term))
      && !(isEnduringRelevanceQuestion(question) && /^(?:people|still|read|study|remember|care|today|nowadays)$/.test(term)));
  const evidenceTokens = new Set(normalizeAliases(evidence.map((item) => [
    item.text,
    item.sourceTitle,
    item.pageOrSection,
    item.textualLayer,
    item.kind === "claim" ? item.parameterName : null,
    item.kind === "claim" ? item.fieldLabel : null,
  ].filter(Boolean).join(" ")).join(" "), termAliases).split(" ").filter(Boolean));
  const stem = (term: string) => term === "taught" || term === "teaches" ? "teach" : term === "took" || term === "takes" ? "take" : term.replace(/(ing|ers|ed|s)$/i, "");
  const covered = requested.filter((term) => {
    const termStem = stem(term);
    return [...evidenceTokens].some((token) => token === term || (termStem.length >= 4 && stem(token) === termStem));
  });
  const coverage = requested.length ? covered.length / requested.length : lens || contextIntent ? 1 : 0;
  const directEvidence = evidence.filter((item) => item.kind === "claim" || ((item.lexicalScore || 0) > 0 && item.supportLevel !== "RELATED"));
  const direct = directEvidence.length;
  const sources = new Set(evidence.map((item) => item.kind === "passage" ? item.sourceId : item.sourceTitle).filter(Boolean));
  const layers = new Set(evidence.map((item) => item.textualLayer).filter(Boolean));
  const represented = new Set(evidence.flatMap((item) => item.kind === "claim" ? [item.parameterCode].filter(Boolean) : item.parameterCodes || []));
  const comparative = /compare|differ|difference|across|contested|conflict/i.test(question)
    || /\b(?:sources|accounts|traditions|texts)\b.{0,50}\bdisagree/i.test(question);
  const similarWork = /\b(?:similar|comparable|contemporar|anyone else|someone else|who else)\b/i.test(question);
  const comparableEvidence = evidence.some((item) => /\b(?:similar|comparable|parallel|contemporar|independent(?:ly)?|another|were active|was active|other (?:scientists?|physicists?|researchers?|groups?|experiments?)|also (?:studied|worked|discovered|observed))\b/i.test(item.text));
  const developmental = /development|trace|transform|evolv/i.test(question);
  const complex = comparative || similarWork || developmental;
  const independentWorks = independentWorkCount(evidence.filter((item): item is Extract<RetrievedEvidence, { kind: "passage" }> => item.kind === "passage"));
  const mode = complex ? "RESEARCH" : "EXPANDED";
  if (evidence.length === 0 || direct === 0) return { sufficient: false, answerable: false, mode, coverage, reason: "No directly relevant approved local evidence.", missingDimensions: requested.length ? requested : ["direct evidence"] };
  if (similarWork && !comparableEvidence) return { sufficient: false, answerable: false, mode: "RESEARCH", coverage,
    reason: "The available evidence describes the main subject but does not identify comparable work by anyone else.", missingDimensions: ["contemporary comparable work"] };
  // A requested angle needs evidence that actually speaks to it, not just evidence about the person.
  if (lens && !evidence.some((item) => directlySupportsRequestedLens(question, item, personalityAliases))) return { sufficient: false, answerable: direct > 0, mode: "EXPANDED", coverage,
    reason: `Local evidence does not directly connect the person to the ${lens.label.toLowerCase()} angle.`, missingDimensions: [`${lens.label.toLowerCase()} perspective: ${lens.focus}`] };
  if (contextIntent && contextIntent !== "contemporaries" && !evidence.some((item) => (contextIntent === "period" ? PERIOD_EVIDENCE : CONTEXT_EVIDENCE).test(item.text))) return { sufficient: false, answerable: direct > 0, mode: "EXPANDED", coverage,
    reason: "Local evidence does not place this in its period.", missingDimensions: [CONTEXT_GAP[contextIntent]] };
  if (broadProfile) {
    const parameters = options.allParameters || [];
    const core = parameters.filter((parameter) => /role|textual|social|tapas|historical|philosophy|lineage|parampara/i.test(`${parameter.code} ${parameter.name}`));
    const missing = core.filter((parameter) => !represented.has(parameter.code)).map((parameter) => parameter.name);
    const representedCore = core.length - missing.length;
    const enough = evidence.length >= 8 && (core.length ? representedCore >= Math.min(4, core.length) : represented.size >= 2) && sources.size >= 2;
    if (sources.size < 2) missing.push("independent approved source");
    if (evidence.length < 8 && missing.length === 0) missing.push("additional primary passage");
    return { sufficient: enough, answerable: direct > 0, mode: enough ? "FAST" : "EXPANDED", coverage: core.length ? representedCore / core.length : Math.min(1, represented.size / 4),
      reason: enough ? "Approved evidence spans multiple parameters and sources." : "The broad answer needs more parameter or source coverage.", missingDimensions: missing };
  }
  const missing = requested.filter((term) => !covered.includes(term));
  // A narrow question can share generic words with a different named award,
  // work or institution. Do not let the aggregate coverage score substitute it.
  const aliasWords = new Set(personalityAliases.flatMap((alias) => normalizeForMatch(alias).split(" ")));
  const namedTargetMissing = (question.match(/\b\p{Lu}[\p{L}\p{N}-]*/gu) || [])
    .map((term) => normalizeForMatch(term))
    .filter((term) => term.length > 2 && !IGNORED.has(term) && !aliasWords.has(term) && requested.includes(term))
    .some((term) => missing.includes(term));
  if (namedTargetMissing) return { sufficient: false, answerable: false, mode, coverage,
    reason: "The approved evidence does not identify the named subject of the question.", missingDimensions: missing };
  const missingDecisiveQualifier = missing.some((term) => /^(?:favorite|best|first|only|earliest|latest|greatest|biggest|most|least)$/.test(term));
  if (missingDecisiveQualifier) return { sufficient: false, answerable: false, mode, coverage,
    reason: "The available evidence does not establish the requested ranking or preference.", missingDimensions: missing };
  if (coverage < 2 / 3) return { sufficient: false, answerable: direct > 0 && coverage >= 0.5, mode, coverage,
    reason: "Local passages may answer part of the question, but concept coverage is incomplete.", missingDimensions: missing };
  if (similarWork && independentWorks < 2) return { sufficient: false, answerable: true, mode: "RESEARCH", coverage,
    reason: "Comparable work needs an independent source for a grounded comparison.", missingDimensions: ["independent source on comparable work"] };
  if (comparative && (independentWorks < 2 || layers.size < 2)) {
    return { sufficient: false, answerable: true, mode: "RESEARCH", coverage, reason: "The comparison needs independent works or broader textual-layer coverage.", missingDimensions: [independentWorks < 2 ? "independent source family" : "distinct textual layer"] };
  }
  return { sufficient: true, answerable: true, mode: "FAST", coverage, reason: "Approved local evidence directly covers the question.", missingDimensions: [] };
}
