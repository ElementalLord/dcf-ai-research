import type { RetrievedEvidence } from "@/lib/corpus/types";
import { authorityRank } from "@/lib/sources/authority";
import { detectLens } from "./lenses";
import { CONTEXT_EVIDENCE, detectContextIntent } from "./historical-context";
import { classifyQuestionScope, isBroadScope } from "./question-scope";

const stop = new Set(["what", "who", "why", "when", "where", "which", "does", "did", "was", "were", "are", "is", "the", "and", "for", "with", "about", "their", "his", "her", "major", "important", "previous", "topic", "selected", "personality"]);
export type AnswerIntent = "identity" | "importance" | "actions" | "method" | "learning" | "relationship" | "transformation" | "teaching" | "historical" | "contested" | "specific";

export function answerIntent(question: string): AnswerIntent {
  const value = question.toLowerCase();
  if (/historical|history|evidence for|actually lived|date/.test(value)) return "historical";
  if (/contested|disagree|different accounts|debate|conflict in sources/.test(value)) return "contested";
  if (/relationship|between|clash|conflict|enemies|enemy|rival|versus|vs\.?\b/.test(value)) return "relationship";
  if (/\b(?:students? learn|learn from|lesson for students|what can .* learn)\b/.test(value)) return "learning";
  if (/\bhow\b.*\b(?:discover|discover(?:y|ies)|research|experiment|invent|develop|make .* discovery)\b/.test(value)) return "method";
  if (/teach|taught|instruction|transmit/.test(value)) return "teaching";
  if (/how .* (?:become|became|turn|attain|achiev)/.test(value)) return "transformation";
  if (/\bknown for\b|why .* important|why .* matter|do (?:that|which) matter|(?:made|makes?) .* important|significance|contribution|impact|legacy/.test(value)) return "importance";
  if (/accomplish|what did .* do|deeds|actions/.test(value)) return "actions";
  if (/^who (?:is|was|are)\b/.test(value.trim())) return "identity";
  return "specific";
}

/** A single verified original passage can support a short, qualified identity
 * answer even when the broad-profile coverage target is not met. */
export function hasDirectLiveIdentity(question: string, evidence: RetrievedEvidence[]): boolean {
  if (answerIntent(question) !== "identity") return false;
  return evidence.some((item) => item.kind === "passage" && (item.origin === "google_grounding" || item.origin === "brave_live" || item.origin === "pmc_oai")
    && Boolean(item.sourceUrl) && /\b(?:sage|seer|rishi|priest|teacher|preceptor|king|queen|poet|philosopher|scientist|physicist|chemist|inventor|researcher|engineer|musician|performer|singer|vocalist)\b/i.test(item.text));
}

/** Broad profile/significance questions can be answered as a qualified synthesis when
 * several approved records exist, even if no single record covers every requested
 * dimension or proves a subjective word such as "most". This never applies to a
 * narrow unsupported fact. */
export function hasBroadAnswerEvidence(question: string, evidence: RetrievedEvidence[]): boolean {
  if (!isBroadScope(classifyQuestionScope(question))) return false;
  const usable = evidence.filter((item) => item.text.trim().length >= 25
    && (item.kind === "claim" || (item.sourceStatus !== "rejected" && item.supportLevel !== "RELATED")));
  const sources = new Set(usable.map((item) => item.sourceUrl || item.sourceTitle || (item.kind === "passage" ? item.sourceId : item.claimId)).filter(Boolean));
  return usable.length >= 2 && sources.size >= 1;
}

const intentTerms: Record<AnswerIntent, RegExp> = {
  identity: /sage|seer|rishi|king|teacher|scientist|physicist|researcher|musician|performer|singer|vocalist|music|concert|discover|field|guide|role|known|became|born|family|disciple|lineage|rigveda|ramayana/i,
  importance: /contribut|influenc|discover|research|scientific|spectroscop|teach|guide|hymn|work|text|mantra|accomplish|legacy|significan|audience|concert|music/i,
  actions: /taught|guided|gave|led|protected|defeated|composed|performed|attained|became|fought|discovered|experimented|founded|developed/i,
  method: /experiment|method|instrument|lamp|telescope|sunlight|spectrum|spectra|filter|observ|measure|scattering|research/i,
  learning: /curios|observ|experiment|research|persist|challenge|stud|educat|science|mentor|disciplin|work/i,
  relationship: /relationship|clash|conflict|rival|enemy|enemies|teacher|disciple|friend|king|sage|encounter/i,
  transformation: /king|ascetic|austerit|tapas|became|attain|brahmarshi|sage|chronolog/i,
  teaching: /teach|taught|instruct|knowledge|mantra|weapon|bala|atibala|transmit|guidance/i,
  historical: /historical|date|scholar|evidence|text|attest|corroborat|tradition/i,
  contested: /dispute|differ|variant|scholar|interpret|contradict|tradition/i,
  specific: /./,
};

const DATED = /\b(?:1[0-9]\d{2}|20\d{2}|\d{1,2}(?:st|nd|rd|th)[- ]century)\b/i;

export function prioritizeEvidence(question: string, evidence: RetrievedEvidence[], limit: number): RetrievedEvidence[] {
  const intent = answerIntent(question);
  const similarWork = /\b(?:similar|comparable|contemporar|anyone else|someone else|who else)\b/i.test(question);
  const lens = detectLens(question);
  const contextIntent = detectContextIntent(question);
  const genericIntentWords = intent === "method" ? new Set(["make", "discovery", "discover"]) : intent === "learning" ? new Set(["students", "student", "learn", "lesson"]) : new Set<string>();
  const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].filter((word) => !stop.has(word) && !genericIntentWords.has(word));
  const ranked = evidence.map((item, index) => {
    const text = item.text.toLowerCase();
    const metadata = `${item.kind === "claim" ? `${item.parameterName || ""} ${item.fieldLabel || ""}` : item.parameterNames?.join(" ") || ""} ${item.sourceTitle || ""}`.toLowerCase();
    const direct = terms.reduce((sum, term) => sum + (text.includes(term) ? 3 : metadata.includes(term) ? 1 : 0), 0);
    const central = intentTerms[intent].test(text) ? 4 : 0;
    const historicalContext = (intent === "identity" || intent === "importance") && /\b(?:1[5-9]\d{2}|20\d{2}|\d{1,2}(?:st|nd|rd|th)? century|reign of)\b/i.test(text) ? 2 : 0;
    const consequence = (intent === "identity" || intent === "importance") && /\b(?:enabled|changed|led to|provided|became the basis|influenced|transformed|spectroscop|molecular structure)\b/i.test(text) ? 2 : 0;
    const comparisonFit = similarWork && /\b(?:similar|comparable|parallel|contemporar|independent(?:ly)?|another|were active|was active|other (?:scientists?|physicists?|researchers?|groups?|experiments?|musicians?|singers?|performers?)|also (?:studied|worked|discovered|observed|performed|sang))\b/i.test(text) ? 14 : 0;
    const frameworkFit = intent === "method" && /method|experiment|innov/i.test(metadata) ? 6
      : intent === "learning" && /method|experiment|persist|qualit|educat|mentor/i.test(metadata) ? 6 : 0;
    const noisePenalty = /research framework|should be stored|source set|portal metadata|metrical|grammatical|not enough evidence/i.test(text) ? 7 : 0;
    const episodePenalty = (intent === "identity" || intent === "importance") && /\b(?:episode|cycle|summons?|invit(?:es?|ed)|gather(?:s|ed)?|undertaking|rejected)\b/i.test(text) ? 5 : 0;
    const authority = item.kind === "claim" ? 2 : item.origin === "google_grounding" || item.origin === "brave_live" || item.origin === "pmc_oai" ? 1 : 0;
    // A requested angle or historical placement outweighs generic relevance, so the answer is built from that evidence.
    const lensFit = lens && (lens.evidence.test(text) || lens.evidence.test(metadata)) ? 6 : 0;
    const contextFit = contextIntent && CONTEXT_EVIDENCE.test(text) ? 5 : 0;
    const namedPeersFit = contextIntent === "contemporaries" && /\b(?:were active|was active)\b/i.test(text) ? 20 : 0;
    // Publisher standing breaks ties between otherwise comparable evidence; it never outranks relevance.
    const standing = authorityRank(item.authority?.level) * 0.5;
    return { item, index, score: direct + central + historicalContext + consequence + comparisonFit + frameworkFit + authority + lensFit + contextFit + namedPeersFit + standing - noisePenalty - episodePenalty };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected: RetrievedEvidence[] = [];
  const perSource = new Map<string, number>();
  const seen = new Set<string>();
  for (const entry of ranked) {
    const key = entry.item.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").slice(0, 180);
    const source = entry.item.sourceUrl || entry.item.sourceTitle || entry.item.id;
    if (seen.has(key) || (perSource.get(source) || 0) >= 2) continue;
    selected.push(entry.item);
    seen.add(key);
    perSource.set(source, (perSource.get(source) || 0) + 1);
    if (selected.length >= limit) break;
  }
  const bestLive = ranked.find(({ item, score }) => item.kind === "passage" && (item.origin === "google_grounding" || item.origin === "brave_live" || item.origin === "pmc_oai") && score > 0);
  if (bestLive && !selected.includes(bestLive.item) && selected.length) selected[selected.length - 1] = bestLive.item;
  // A profile or significance answer should be able to say when; keep one dated record if the packet has room.
  if ((intent === "identity" || intent === "importance") && selected.length >= 5 && !selected.some((item) => DATED.test(item.text))) {
    const dated = ranked.find(({ item, score }) => score > 0 && DATED.test(item.text) && !selected.includes(item));
    if (dated) selected[selected.length - (bestLive && selected.at(-1) === bestLive.item ? 2 : 1)] = dated.item;
  }
  return selected;
}
