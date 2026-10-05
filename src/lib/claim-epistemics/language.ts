import type { ContractStatus, EpistemicType } from "./types";

/**
 * Turns internal epistemic metadata into reader-facing language. Metadata never appears verbatim
 * ("EPISTEMIC TYPE: X"); it shapes how a statement is framed so a narrative is not read as history.
 */
export type EpistemicItem = { text: string; epistemicType?: string | null; contractStatus?: string | null; textualLayer?: string | null; sourceTitle?: string | null };

/** The tradition or work named by the evidence's own textual layer ("Founding Chronicle — Book 2" → "Founding Chronicle"). */
function workOf(item: EpistemicItem): string | null {
  const layer = (item.textualLayer || "").split(/\s+[—–-]\s+|,/)[0].trim();
  if (layer && !/scholar|interpretation|framework|unspecified|source|reconstruction|modern/i.test(layer)) return layer.replace(/\s+tradition$/i, "");
  return null;
}

/** Already framed: the claim itself says who narrates, argues, or doubts it. */
const FRAMED = /\b(?:narrat\w*|portray\w*|depict\w*|recount\w*|tells?|according to|argues?|interprets?|reads?|suggests?|may|might|uncertain|contested|debated|in the [^,.]{0,50}(?:narrative|account|version|tradition|text|hymn|epic|story)|the (?:text|hymn|epic|narrative|tradition|passage) (?:says|states|names|records))\b/i;

function lowerLead(text: string): string {
  return /^(?:The|A|An|This|These|In|At|After|Before|When|During)\b/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

/** A natural lead-in for a claim whose wording does not already carry its epistemic frame. */
export function framedStatement(item: EpistemicItem): string {
  const text = item.text.trim();
  const type = item.epistemicType as EpistemicType | null | undefined;
  if (!type || FRAMED.test(text)) return type === "HISTORICAL_FACT" && item.contractStatus !== "SUPPORTED" ? `${text} ${UNESTABLISHED}` : text;
  const work = workOf(item);
  switch (type) {
    case "TRADITIONAL_NARRATIVE": return `${work ? `In the ${work} narrative` : "In the traditional narrative"}, ${lowerLead(text)}`;
    case "TEXTUAL_ASSERTION": return work ? `In the ${work}, ${lowerLead(text)}` : text;
    case "HISTORICAL_INFERENCE": return `The evidence suggests, without establishing, that ${lowerLead(text)}`;
    case "SCHOLARLY_INTERPRETATION": return `In scholarly interpretation, ${lowerLead(text)}`;
    case "SYNTHETIC_INTERPRETATION": return `Read across the sources, ${lowerLead(text)}`;
    case "MODERN_RECEPTION": return `In modern interpretation, ${lowerLead(text)}`;
    case "NORMATIVE_RELEVANCE": return `As a modern reflection, ${lowerLead(text)}`;
    case "CONTESTED": return `This remains debated: ${text}`;
    case "HISTORICAL_FACT": return item.contractStatus === "SUPPORTED" ? text : `${text} ${UNESTABLISHED}`;
    default: return text;
  }
}

const UNESTABLISHED = "The available evidence does not establish this historically.";

/** A short reader-facing description of what kind of evidence a record is. */
export function evidenceDescription(item: EpistemicItem): string | null {
  const work = workOf(item);
  const type = item.epistemicType as EpistemicType | null | undefined;
  const status = item.contractStatus as ContractStatus | null | undefined;
  switch (type) {
    case "TRADITIONAL_NARRATIVE": return `What the ${work || "traditional"} narrative tells${status === "SUPPORTED" ? "" : " (passage support incomplete)"}; not independent historical evidence`;
    case "TEXTUAL_ASSERTION": return `What the ${work ? `${work} text` : "text"} itself says`;
    case "HISTORICAL_FACT": return status === "SUPPORTED" ? "Historical claim corroborated by independent scholarship" : "Historical claim the available evidence does not establish";
    case "HISTORICAL_INFERENCE": return "An inference from the evidence, not an established fact";
    case "SCHOLARLY_ATTRIBUTION": return "A scholar's stated view";
    case "SCHOLARLY_INTERPRETATION": return "Scholarly interpretation";
    case "SYNTHETIC_INTERPRETATION": return "An interpretation drawn across sources";
    case "MODERN_RECEPTION": return "Modern interpretation";
    case "NORMATIVE_RELEVANCE": return "A modern reflection on relevance";
    case "CONTESTED": return "A contested or uncertain point";
    case "METHODOLOGICAL": return "Research note";
    default: return null;
  }
}

/** Compact, fixed-vocabulary tag for the synthesis packet (internal; the prompt asks the model to phrase accordingly). */
export function packetTag(item: EpistemicItem): string | null {
  if (!item.epistemicType) return null;
  const standard = item.contractStatus === "SUPPORTED" || item.contractStatus === "CONTESTED_REPRESENTED" ? "evidence standard met"
    : item.contractStatus === "INSUFFICIENT_FOR_HISTORICAL_CLAIM" ? "narrative only, not historical proof" : "evidence standard not fully met";
  return `${item.epistemicType.toLowerCase().replace(/_/g, " ")} · ${standard}`;
}

const HISTORICAL_CERTAINTY = /\b(?:historically (?:verified|established|proven|attested|confirmed|accurate|true)|(?:is|was) a (?:historical|historically documented) fact|(?:is|are) historically (?:certain|established)|did (?:in fact|historically) (?:happen|occur|live))\b/i;
const UNCERTAINTY = /\b(?:uncertain|contested|debated|disputed|unclear|not (?:established|certain|settled)|scholars (?:differ|disagree)|remains? open)\b/i;

/**
 * Deterministic safeguard against epistemic collapse in a generated answer: historical certainty is not
 * asserted from narrative evidence, and contested evidence is not presented as settled.
 */
export function epistemicSafeguard(answer: string, evidence: EpistemicItem[]): { answer: string; notes: string[] } {
  const notes: string[] = [];
  const historicallySupported = evidence.some((item) => item.epistemicType === "HISTORICAL_FACT" && item.contractStatus === "SUPPORTED");
  if (HISTORICAL_CERTAINTY.test(answer) && !historicallySupported)
    notes.push("The cited evidence records what the texts and traditions narrate; it does not independently establish these events as historical fact.");
  if (evidence.some((item) => item.epistemicType === "CONTESTED") && !UNCERTAINTY.test(answer))
    notes.push("Some of the cited evidence concerns points that remain contested or uncertain.");
  return { answer: notes.length ? `${answer.trim()}\n\n${notes.map((note) => `*${note}*`).join(" ")}` : answer, notes };
}
