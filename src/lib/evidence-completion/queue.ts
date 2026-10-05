import { normalizeTransliteration } from "@/lib/live-research/provenance-link";
import { parseLocator, type Locator } from "./locator";

export type SupportLevelNow = "NONE" | "PARTIAL" | "STRONG";
/** What it takes to read the cited source, from its stored state alone (no network). */
export type SourceAvailability = "stored" | "verified_not_ingested" | "oversize" | "unparsed" | "unreachable" | "restricted" | "no_url" | "unapproved";

export type QueueClaim = {
  id: string; text: string; certainty: string | null; parameterFieldId: string | null; support: SupportLevelNow;
  citations: Array<{ claimSourceId: string; sourceId: string; locator: string | null; excerpt: string | null }>;
};
export type QueueSource = {
  id: string; title: string; url: string | null; approved: boolean; ingestionStatus: string; lastError: string | null; workTitle: string;
};
export type ParameterStanding = { fieldId: string; parameterCode: string; state: string; closeToGood: boolean };

export type MissingEvidence = {
  personalityId: string; claimId: string; claimSourceId: string; sourceId: string; work: string;
  citation: string; locator: Locator; locationKey: string; parameterFieldId: string | null; parameterCode: string | null;
  certainty: string | null; support: SupportLevelNow; availability: SourceAvailability;
};
export type EvidenceLocation = {
  key: string; locator: Locator; work: string; sourceIds: string[]; availability: SourceAvailability[];
  storedAlternate: boolean; claims: Array<{ id: string; core: boolean; parameterCode: string | null }>;
  items: MissingEvidence[]; priority: number; factors: Record<string, number>;
};

/** Work identity from the stored record: explicit metadata first, then the title before its locator. */
export function workTitleOf(source: { title: string; metadata?: Record<string, unknown> | null }): string {
  const metadata = source.metadata || {};
  const verification = (metadata.verification || {}) as Record<string, unknown>;
  const explicit = metadata.underlyingWork || verification.work_title;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  return source.title.split(/\s*(?:,|\s[—–-]\s|\/|:|\()\s*/)[0].trim() || source.title;
}

export function sourceAvailability(source: QueueSource | undefined): SourceAvailability {
  if (!source) return "unapproved";
  if (!source.approved) return "unapproved";
  if (source.ingestionStatus === "ready") return "stored";
  if (!source.url) return "no_url";
  const error = (source.lastError || "").toLowerCase();
  if (/http 40[123]\b|forbidden|unauthori[sz]ed|paywall|restricted/.test(error)) return "restricted";
  if (/exceeds|too large|limit|timeout|timed out|aborted/.test(error)) return "oversize";
  if (/parse|no useful text|no extractable|not contain extractable/.test(error)) return "unparsed";
  if (/could not be fetched|certificate|tls|ssl|enotfound|econn|http 5\d\d/.test(error)) return "unreachable";
  return "verified_not_ingested";
}

/** Group key: canonical locators name the passage across copies; page/section/DOI belong to one work. */
export function locationKey(locator: Locator, work: string): string {
  return locator.kind === "canonical" || locator.kind === "doi" ? locator.key : `${work.toLowerCase()}|${locator.key}`;
}

export function missingEvidenceItems(input: {
  personalityId: string; claims: QueueClaim[]; sources: Map<string, QueueSource>; fieldParameter: Map<string, string>;
}): MissingEvidence[] {
  return input.claims.flatMap((claim) => claim.citations.map((citation) => {
    const source = input.sources.get(citation.sourceId);
    const work = source?.workTitle || "Unknown work";
    const parsed = parseLocator(citation.locator, source?.title || work);
    // A heading that only repeats the work's own title names the work, not a passage in it.
    const workTerms = new Set(normalizeTransliteration(work).split(" "));
    const locator = parsed.kind === "section" && (parsed.terms || []).every((term) => workTerms.has(term))
      ? { ...parsed, specific: false } : parsed;
    return {
      personalityId: input.personalityId, claimId: claim.id, claimSourceId: citation.claimSourceId, sourceId: citation.sourceId,
      work, citation: [work, citation.locator].filter(Boolean).join(", "), locator, locationKey: locationKey(locator, work),
      parameterFieldId: claim.parameterFieldId,
      parameterCode: claim.parameterFieldId ? input.fieldParameter.get(claim.parameterFieldId) || null : null,
      certainty: claim.certainty, support: claim.support, availability: sourceAvailability(source),
    };
  }));
}

const ACCESS_RANK: SourceAvailability[] = ["stored", "verified_not_ingested", "oversize", "unparsed", "unreachable", "restricted", "no_url", "unapproved"];

/**
 * Deterministic value of completing one location. Weights are a transparent heuristic:
 * core claims 3, other claims 1, claims in a parameter below GOOD +2, a parameter whose only
 * remaining blockers are provenance +3, an approved source +2, text already stored (here or
 * in another copy at the same canonical locator) +2, a stable locator +3 (section +1).
 * Reviewer notes that name no passage are not queued for acquisition.
 */
export function prioritizeLocations(items: MissingEvidence[], standings: Map<string, ParameterStanding>, storedCanonicalKeys: Set<string>): EvidenceLocation[] {
  const groups = new Map<string, MissingEvidence[]>();
  for (const item of items) {
    if (!item.locator.specific) continue;
    groups.set(item.locationKey, [...(groups.get(item.locationKey) || []), item]);
  }
  return [...groups].map(([key, group]) => {
    const claims = [...new Map(group.map((item) => [item.claimId, {
      id: item.claimId, core: item.certainty === "high", parameterCode: item.parameterCode,
    }])).values()];
    const standingOf = (claimId: string) => {
      const fieldId = group.find((item) => item.claimId === claimId)?.parameterFieldId;
      return fieldId ? standings.get(fieldId) : undefined;
    };
    const locator = group[0].locator;
    const availability = [...new Set(group.map((item) => item.availability))].sort((a, b) => ACCESS_RANK.indexOf(a) - ACCESS_RANK.indexOf(b));
    const chapterKey = locator.kind === "canonical" && locator.path ? `${locator.scheme}:${locator.path.join(".")}` : null;
    const storedAlternate = Boolean(chapterKey && storedCanonicalKeys.has(chapterKey));
    const factors = {
      coreClaims: 3 * claims.filter((claim) => claim.core).length,
      otherClaims: claims.filter((claim) => !claim.core).length,
      weakParameter: 2 * claims.filter((claim) => { const state = standingOf(claim.id)?.state; return state && state !== "GOOD" && state !== "DEEP"; }).length,
      closeToGood: claims.some((claim) => standingOf(claim.id)?.closeToGood) ? 3 : 0,
      verifiedSource: availability.some((value) => value !== "unapproved") ? 2 : 0,
      alreadyStored: availability.includes("stored") || storedAlternate ? 2 : 0,
      stableLocator: locator.kind === "section" ? 1 : 3,
    };
    return {
      key, locator, work: group[0].work, sourceIds: [...new Set(group.map((item) => item.sourceId))], availability, storedAlternate,
      claims, items: group, factors, priority: Object.values(factors).reduce((sum, value) => sum + value, 0),
    };
  }).sort((a, b) => b.priority - a.priority || b.claims.length - a.claims.length || a.key.localeCompare(b.key));
}

/** Persisted failure codes, so later runs know why a passage is still missing. */
export type FailureReason = "TLS_ERROR" | "ACCESS_DENIED" | "NO_LOCATOR" | "SOURCE_NOT_VERIFIED" | "ALTERNATE_NOT_FOUND" | "DOCUMENT_TOO_LARGE"
  | "OCR_UNAVAILABLE" | "EDITION_MISMATCH" | "PASSAGE_NOT_FOUND" | "PASSAGE_DOES_NOT_SUPPORT_CLAIM" | "FETCH_FAILED";

/** Failures that do not change unless the source itself changes; they are not retried by default. */
export const STABLE_FAILURES = new Set<FailureReason>(["TLS_ERROR", "ACCESS_DENIED", "NO_LOCATOR", "SOURCE_NOT_VERIFIED", "ALTERNATE_NOT_FOUND", "OCR_UNAVAILABLE"]);

/** Reads the error and its cause chain (network codes live on the cause, not the wrapper message). */
export function classifyFailure(error: unknown): FailureReason {
  const parts: string[] = [];
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    const item = current as { message?: string; code?: string; status?: number; cause?: unknown };
    parts.push(String(item.code || ""), String(item.message || ""), String(item.status || ""));
    current = item.cause;
  }
  const text = parts.join(" ");
  if (/CERT|TLS|SSL|altname|certificate/i.test(text)) return "TLS_ERROR";
  if (/HTTP 40[123]\b|\b40[123]\b.*(?:forbidden|unauthori)|ACCESS_DENIED|SOURCE_NOT_APPROVED/i.test(text)) return "ACCESS_DENIED";
  if (/TOO_LARGE|exceeds/i.test(text)) return "DOCUMENT_TOO_LARGE";
  return "FETCH_FAILED";
}
