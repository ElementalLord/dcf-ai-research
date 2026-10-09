import type { RetrievedEvidence } from "@/lib/corpus/types";

const stop = new Set(["what", "who", "why", "when", "where", "which", "does", "did", "was", "were", "are", "is", "the", "and", "for", "with", "about", "their", "his", "her", "major", "important"]);
export type AnswerIntent = "identity" | "importance" | "actions" | "relationship" | "transformation" | "teaching" | "historical" | "contested" | "specific";

export function answerIntent(question: string): AnswerIntent {
  const value = question.toLowerCase();
  if (/historical|history|evidence for|actually lived|date/.test(value)) return "historical";
  if (/contested|disagree|different accounts|debate|conflict in sources/.test(value)) return "contested";
  if (/relationship|between|clash|conflict|versus|vs\.?\b/.test(value)) return "relationship";
  if (/teach|taught|instruction|transmit/.test(value)) return "teaching";
  if (/how .* (?:become|became|turn|attain|achiev)/.test(value)) return "transformation";
  if (/why .* important|significance|contribution|legacy/.test(value)) return "importance";
  if (/accomplish|what did .* do|deeds|actions/.test(value)) return "actions";
  if (/^who (?:is|was|are)\b/.test(value.trim())) return "identity";
  return "specific";
}

/** A single verified original passage can support a short, qualified identity
 * answer even when the broad-profile coverage target is not met. */
export function hasDirectLiveIdentity(question: string, evidence: RetrievedEvidence[]): boolean {
  if (answerIntent(question) !== "identity") return false;
  return evidence.some((item) => item.kind === "passage" && (item.origin === "google_grounding" || item.origin === "brave_live")
    && Boolean(item.sourceUrl) && /\b(?:sage|seer|rishi|priest|teacher|preceptor|king|queen|poet|philosopher)\b/i.test(item.text));
}

const intentTerms: Record<AnswerIntent, RegExp> = {
  identity: /sage|seer|rishi|king|teacher|guide|role|known|became|born|family|disciple|lineage|rigveda|ramayana/i,
  importance: /contribut|influenc|teach|guide|hymn|work|text|mantra|accomplish|legacy|significan/i,
  actions: /taught|guided|gave|led|protected|defeated|composed|performed|attained|became|fought/i,
  relationship: /relationship|clash|conflict|rival|teacher|disciple|friend|king|sage|encounter/i,
  transformation: /king|ascetic|austerit|tapas|became|attain|brahmarshi|sage|chronolog/i,
  teaching: /teach|taught|instruct|knowledge|mantra|weapon|bala|atibala|transmit|guidance/i,
  historical: /historical|date|scholar|evidence|text|attest|corroborat|tradition/i,
  contested: /dispute|differ|variant|scholar|interpret|contradict|tradition/i,
  specific: /./,
};

export function prioritizeEvidence(question: string, evidence: RetrievedEvidence[], limit: number): RetrievedEvidence[] {
  const intent = answerIntent(question);
  const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].filter((word) => !stop.has(word));
  const ranked = evidence.map((item, index) => {
    const text = item.text.toLowerCase();
    const metadata = `${item.kind === "claim" ? `${item.parameterName || ""} ${item.fieldLabel || ""}` : item.parameterNames?.join(" ") || ""} ${item.sourceTitle || ""}`.toLowerCase();
    const direct = terms.reduce((sum, term) => sum + (text.includes(term) ? 3 : metadata.includes(term) ? 1 : 0), 0);
    const central = intentTerms[intent].test(text) ? 4 : 0;
    const noisePenalty = /research framework|should be stored|source set|portal metadata|metrical|grammatical|not enough evidence/i.test(text) ? 7 : 0;
    const episodePenalty = (intent === "identity" || intent === "importance") && /\b(?:episode|cycle|summons?|invit(?:es?|ed)|gather(?:s|ed)?|undertaking|rejected)\b/i.test(text) ? 5 : 0;
    const authority = item.kind === "claim" ? 2 : item.origin === "google_grounding" || item.origin === "brave_live" ? 1 : 0;
    return { item, index, score: direct + central + authority - noisePenalty - episodePenalty };
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
  const bestLive = ranked.find(({ item, score }) => item.kind === "passage" && (item.origin === "google_grounding" || item.origin === "brave_live") && score > 0);
  if (bestLive && !selected.includes(bestLive.item) && selected.length) selected[selected.length - 1] = bestLive.item;
  return selected;
}
