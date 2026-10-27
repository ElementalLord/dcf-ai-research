import { createHash } from "node:crypto";
import { classifyQuestionScope, type QuestionScope } from "./question-scope";
import { detectLens } from "./lenses";
import { detectContextIntent } from "./historical-context";
import { assessEvidenceSufficiency } from "@/lib/live-research/sufficiency";
import { isClaimEligible, type EvidencePolicyMode } from "@/lib/corpus/approval-policy";
import { canonicalizeTerms, type TermAliasRecord } from "@/lib/corpus/personality-config";
import { normalizeForMatch } from "@/lib/corpus/text";
import type { RetrievedClaim, RetrievedEvidence, RetrievedPassage } from "@/lib/corpus/types";
import { sourceWorkKey } from "@/lib/live-research/research-quality";

export type GapType = "factual_detail" | "chronology" | "primary_source_attribution" | "scholarly_interpretation" |
  "historical_context" | "comparison" | "contested_claim" | "contemporary_observation" |
  "contemporary_legacy" | "missing_corroboration" | "conflicting_evidence";
export type ResolutionState = "local_sufficient" | "partial_local" | "research_required" |
  "research_unavailable" | "unsupported";
export type ResolutionRoute = "answer" | "research" | "partial_answer" | "decline";

export type EvidenceGap = {
  id: string;
  requirementKey: string;
  type: GapType;
  requirement: string;
  subjectId: string;
  topic: string;
  suitableSources: string[];
  completion: string;
  contested: boolean;
};

/** Prompt 2 consumes this request; creating it performs no network operation or write. */
export type EvidenceGapRequest = {
  needId: string;
  personalityId: string;
  personalityName: string;
  normalizedIntent: string;
  category: QuestionScope;
  gaps: EvidenceGap[];
  existingEvidenceIds: string[];
  maxExternalSearches: number;
  minimumIndependentWorks?: number;
};

export type QuestionResolution = {
  needId: string;
  subject: { id: string; name: string };
  normalizedIntent: string;
  category: QuestionScope;
  state: ResolutionState;
  route: ResolutionRoute;
  verifiedClaims: RetrievedClaim[];
  verifiedPassages: RetrievedPassage[];
  freshness: "historical" | "current" | "stale";
  sufficient: boolean;
  reason: string;
  gaps: EvidenceGap[];
  researchJustified: boolean;
  researchRequest: EvidenceGapRequest | null;
};

export type ResolutionInput = {
  question: string;
  personalityId: string;
  personalityName: string;
  personalityAliases: string[];
  termAliases: TermAliasRecord[];
  allParameters: Array<{ code: string; name: string }>;
  evidence: RetrievedEvidence[];
  policyMode: EvidencePolicyMode;
  researchAvailable: boolean;
  retrievalErrors?: string[];
  now?: Date;
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const FILLER = new Set(["what", "which", "when", "where", "why", "how", "did", "does", "was", "were", "is", "are", "the", "a", "an", "of", "to", "in", "on", "for", "by", "about", "tell", "me", "year", "date", "happen", "happened", "occur", "occurred", "discovered", "discover", "discovery", "scientifically", "scientific", "important", "importance", "significant", "significance", "matter", "mattered"]);

function questionNeeds(question: string): Array<{ key: string; type: GapType; requirement: string; suitableSources: string[]; completion: string }> {
  const needs = [] as ReturnType<typeof questionNeeds>;
  if (/\b(?:when|what year|which year|what date|date of|chronolog|timeline)\b/i.test(question)) needs.push({ key: "date", type: "chronology", requirement: "A dated event or chronology directly answering the question", suitableSources: ["dated primary record", "scholarly chronology"], completion: "A verified source explicitly dates the requested event." });
  if (/\b(?:why|how).{0,100}\b(?:important|significant|matter)|\b(?:impact|influence|significance|importance|legacy)\b/i.test(question)) needs.push({ key: "significance", type: "scholarly_interpretation", requirement: "Evidence explaining the consequence or significance of the specific subject", suitableSources: ["scholarly interpretation", "institutional history"], completion: "A qualified source connects the contribution to its consequence." });
  if (/\b(?:what|which).{0,100}\b(?:discover|contribut|invent|achiev|establish|found)|\b(?:contribution|discovery|achievement)\b/i.test(question) && !/\b(?:when|what year|which year|what date)\b/i.test(question)) needs.push({ key: "contribution", type: "factual_detail", requirement: "The specific contribution, work, or event requested", suitableSources: ["primary record", "institutional history"], completion: "An approved source directly identifies the contribution." });
  if (/\b(?:compare|differ|difference|versus|vs\.?|similar|contemporar)\b/i.test(question)) needs.push({ key: "comparison", type: "comparison", requirement: "Comparable evidence for each side of the question", suitableSources: ["independent primary records", "comparative scholarship"], completion: "Independent works support both sides on the same dimension." });
  if (/\b(?:contested|disputed|conflict|disagree|first|only|earliest)\b/i.test(question)) needs.push({ key: "contested", type: "contested_claim", requirement: "Independent evidence establishing the competing accounts or priority", suitableSources: ["independent primary records", "critical scholarship"], completion: "At least two independent works represent the disagreement." });
  if (/\b(?:today|currently|now|recent|latest|202[0-9])\b/i.test(question)) needs.push({ key: "current", type: "contemporary_observation", requirement: "A dated current observation relevant to the question", suitableSources: ["current institutional record", "dated official statistics"], completion: "A dated observation is current for the requested time period." });
  return needs;
}

function topicIdentity(question: string, aliases: string[], termAliases: TermAliasRecord[]): string {
  const ignored = new Set([...FILLER, ...aliases.flatMap((alias) => normalizeForMatch(alias).split(" "))]);
  return [...new Set(canonicalizeTerms(question, termAliases).split(" ")
    .map((term) => term.replace(/(?:ing|ed|s)$/i, ""))
    .filter((term) => term.length > 2 && !ignored.has(term)))].sort().join(" ") || "subject";
}

function eligibleEvidence(item: RetrievedEvidence, input: ResolutionInput, now: Date): boolean {
  if (item.personalityId !== input.personalityId) return false;
  if (item.kind === "claim") {
    if (!isClaimEligible(item.reviewStatus || "", item.approvalOrigin, input.policyMode)) return false;
    if (!item.sourceTitle && !item.chunkId) return false;
    if (item.contractStatus && !["SUPPORTED", "CONTESTED_REPRESENTED"].includes(item.contractStatus)) return false;
    if ((item.epistemicType === "CONTESTED" || item.contractStatus === "CONTESTED_REPRESENTED")
      && !/\b(?:contested|disputed|conflict|disagree|uncertain|first|only|earliest|accounts|traditions)\b/i.test(input.question)) return false;
    if (/\b(?:when|what year|which year|what date|historically|historical fact|actually happen)\b/i.test(input.question)
      && item.epistemicType === "TRADITIONAL_NARRATIVE") return false;
    return true;
  }
  if (item.sourceStatus !== "approved") return false;
  if (item.origin === "google_grounding" || item.origin === "brave_live" || item.origin === "pmc_oai") return false;
  if (item.origin === "live_cache" && (!item.cacheExpiresAt || !Number.isFinite(Date.parse(item.cacheExpiresAt)) || new Date(item.cacheExpiresAt) <= now)) return false;
  return item.accessibility !== "UNREADABLE" && item.supportLevel !== "RELATED";
}

function supportsNeed(key: string, evidence: RetrievedEvidence[], now: Date): boolean {
  const texts = evidence.map((item) => item.text);
  if (key === "date") return texts.some((text) => /\b(?:1[0-9]{3}|20[0-9]{2})\b/.test(text));
  if (key === "significance") return texts.some((text) => /\b(?:led to|enabled|influenc\w*|impact\w*|important|significan\w*|changed|foundation|advanced|because|resulted|inspired|consequence)\b/i.test(text));
  if (key === "contribution") return texts.some((text) => /\b(?:discover\w*|contribut\w*|invent\w*|develop\w*|establish\w*|found\w*|achiev\w*|work)\b/i.test(text));
  if (key === "comparison" || key === "contested") return new Set(evidence.map((item) => item.kind === "passage" && item.workKey
    ? item.workKey : sourceWorkKey({ url: item.sourceUrl || "", title: item.sourceTitle, author: item.sourceAuthor }))).size >= 2;
  if (key === "current") return evidence.some((item) => item.kind === "passage" && item.retrievedAt && now.getTime() - new Date(item.retrievedAt).getTime() < 365 * 24 * 60 * 60 * 1000);
  return false;
}

/** Check a bounded research result against the requirements that justified its dispatch. */
export function fillsEvidenceGaps(gaps: EvidenceGap[], evidence: RetrievedEvidence[], now = new Date()): boolean {
  return gaps.every((gap) => !["date", "significance", "contribution", "comparison", "contested", "current"].includes(gap.requirementKey)
    || supportsNeed(gap.requirementKey, evidence, now));
}

export function resolveQuestion(input: ResolutionInput): QuestionResolution {
  const now = input.now || new Date();
  const category = classifyQuestionScope(input.question);
  const topic = topicIdentity(input.question, input.personalityAliases, input.termAliases);
  const needs = questionNeeds(input.question);
  const intent = needs.length ? needs.map((need) => need.key).sort().join("+") : category.toLowerCase();
  const lens = detectLens(input.question)?.id || "general";
  const context = needs.some((need) => need.key === "date") ? "none" : detectContextIntent(input.question) || "none";
  const normalizedIntent = `${intent}:${lens}:${context}:${topic}`;
  const needId = hash(`need/v1:${input.personalityId}:${normalizedIntent}`);
  const eligible = input.evidence.filter((item) => eligibleEvidence(item, input, now));
  const verifiedClaims = eligible.filter((item): item is RetrievedClaim => item.kind === "claim");
  const verifiedPassages = eligible.filter((item): item is RetrievedPassage => item.kind === "passage");
  const decision = assessEvidenceSufficiency(input.question, eligible, { personalityAliases: input.personalityAliases, termAliases: input.termAliases, allParameters: input.allParameters });
  const missing = needs.filter((need) => !supportsNeed(need.key, eligible, now));
  const genericMissing = decision.sufficient ? [] : decision.missingDimensions.filter((dimension) => !missing.some((need) => dimension.toLowerCase().includes(need.key)));
  const gapSpecs = [...missing, ...genericMissing.map((dimension) => ({ key: dimension, type: category === "COMPARISON" ? "comparison" as const : category === "CONTESTED_OR_HISTORICAL" ? "historical_context" as const : "factual_detail" as const,
    requirement: `Evidence for ${dimension} in the question`, suitableSources: ["primary record", "scholarly source"], completion: `Verified evidence directly addresses ${dimension}.` }))];
  if (!decision.sufficient && !gapSpecs.length) gapSpecs.push({ key: "direct", type: "factual_detail", requirement: "Direct evidence answering the specific question", suitableSources: ["primary record", "scholarly source"], completion: "Verified evidence directly answers the question." });
  const contested = needs.some((need) => need.key === "contested") || category === "CONTESTED_OR_HISTORICAL";
  const gaps: EvidenceGap[] = gapSpecs.map((gap) => ({ id: hash(`gap/v1:${needId}:${gap.key}`), requirementKey: gap.key, type: gap.type, requirement: gap.requirement,
    subjectId: input.personalityId, topic, suitableSources: gap.suitableSources, completion: gap.completion, contested }));
  const retrievalFailed = Boolean(input.retrievalErrors?.length);
  const sufficient = decision.sufficient && gaps.length === 0 && !retrievalFailed;
  const researchJustified = !sufficient && input.researchAvailable && gaps.length > 0;
  const state: ResolutionState = sufficient ? "local_sufficient" : researchJustified
    ? decision.answerable ? "partial_local" : "research_required" : "research_unavailable";
  const route: ResolutionRoute = sufficient ? "answer" : researchJustified ? "research" : decision.answerable ? "partial_answer" : "decline";
  return { needId, subject: { id: input.personalityId, name: input.personalityName }, normalizedIntent, category, state, route,
    verifiedClaims, verifiedPassages, freshness: needs.some((need) => need.key === "current") ? missing.some((need) => need.key === "current") ? "stale" : "current" : "historical",
    sufficient, reason: retrievalFailed ? "Local retrieval was incomplete; the missing evidence requires external research." : missing.length ? `Missing ${missing.map((need) => need.requirement.toLowerCase()).join("; ")}.` : decision.reason,
    gaps, researchJustified, researchRequest: researchJustified ? { needId, personalityId: input.personalityId, personalityName: input.personalityName,
      normalizedIntent, category, gaps, existingEvidenceIds: eligible.map((item) => item.id), maxExternalSearches: 1 } : null };
}
