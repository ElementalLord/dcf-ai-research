import { hasExplicitRetentionRights } from "@/lib/live-research/retention-rights";

/**
 * One explainable credibility score per harvested work.
 *
 * The score answers "how much should DCF trust this work as a place to find evidence
 * again?" It is deliberately separate from claim certainty: a trusted work can still
 * print an interpretation. Every point is attributed to a named signal so a reviewer
 * can see exactly why a source landed in its tier.
 */
export const CREDIBILITY_VERSION = "source-credibility/1";

export type CredibilityTier = "trusted" | "credible" | "provisional" | "unverified";
export type CredibilitySignal = { key: string; points: number; detail: string };
export type CredibilityAssessment = {
  score: number;
  tier: CredibilityTier;
  signals: CredibilitySignal[];
  /** Set when the work must not be stored at all. */
  rejected: string | null;
};

export type CredibilityInput = {
  url: string;
  authorityLevel: "authoritative" | "credible_secondary" | "general_web";
  authorityBasis?: string | null;
  evidenceType: "primary_document" | "traditional_text" | "scholarly_interpretation" | "institutional_record" | "edited_secondary" | "general_web";
  provenance?: { title?: string | null; author?: string | null; publisher?: string | null; publicationDate?: string | null;
    journal?: string | null; doi?: string | null; isbn?: string | null } | null;
  /** Strongest passage-support level this work reached against a real question. */
  bestSupport?: "EXACT" | "STRONG" | "PARTIAL" | "RELATED" | null;
  /** Other works, from other publishers, that supported the same question in the same request. */
  independentCorroboration?: number;
  rights?: string | null;
  /** What DCF already knows about this work from earlier questions. */
  trackRecord?: { distinctQuestions: number; timesCited: number; consecutiveRecallFailures: number } | null;
  /** An administrator's Search Sources decision for the domain, when one exists. */
  adminRule?: "allowed" | "blocked" | "disabled" | null;
};

/** Sites whose pages are user-generated, unsourced or aggregated. Never harvested. */
export const LOW_QUALITY_HOST = /(?:^|\.)(?:quora\.com|reddit\.com|pinterest\.[a-z.]+|blogspot\.[a-z.]+|medium\.com|wikipedia\.org|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|youtube\.com|brainyquote\.com|goodreads\.com|answers\.com|scribd\.com)$/i;

const AUTHORITY_POINTS = { authoritative: 40, credible_secondary: 32, general_web: 8 } as const;
const EVIDENCE_POINTS = { primary_document: 12, scholarly_interpretation: 12, institutional_record: 10,
  traditional_text: 10, edited_secondary: 8, general_web: 0 } as const;
const EVIDENCE_LABEL = { primary_document: "Primary document", scholarly_interpretation: "Scholarly work",
  institutional_record: "Institutional record", traditional_text: "Traditional text",
  edited_secondary: "Edited secondary source", general_web: "General web page" } as const;
const SUPPORT_POINTS = { EXACT: 15, STRONG: 11, PARTIAL: 4, RELATED: 0 } as const;

export function credibilityTier(score: number): CredibilityTier {
  return score >= 75 ? "trusted" : score >= 50 ? "credible" : score >= 30 ? "provisional" : "unverified";
}

export function assessCredibility(input: CredibilityInput): CredibilityAssessment {
  const signals: CredibilitySignal[] = [];
  const reject = (reason: string): CredibilityAssessment => ({ score: 0, tier: "unverified", signals, rejected: reason });
  let host: string;
  try {
    const url = new URL(input.url);
    if (url.protocol !== "https:" || url.username || url.password) return reject("The source is not a plain HTTPS page.");
    host = url.hostname.toLowerCase();
  } catch { return reject("The source URL is invalid."); }
  if (LOW_QUALITY_HOST.test(host)) return reject("The site publishes user-generated or unsourced content.");
  if (input.adminRule === "blocked" || input.adminRule === "disabled") return reject("An administrator blocked this site.");
  if (!input.bestSupport || input.bestSupport === "RELATED") return reject("No passage directly supported a question.");

  const add = (key: string, points: number, detail: string) => { if (points) signals.push({ key, points, detail }); };
  add("publisher", AUTHORITY_POINTS[input.authorityLevel], input.authorityBasis
    || (input.authorityLevel === "general_web" ? "Publisher is not a recognized institution" : "Recognized publisher"));
  add("evidence_type", EVIDENCE_POINTS[input.evidenceType], EVIDENCE_LABEL[input.evidenceType]);

  const provenance = input.provenance || {};
  const identified = [provenance.title && "title", provenance.author && "author", provenance.publisher && "publisher",
    provenance.publicationDate && "date", provenance.journal && "journal", (provenance.doi || provenance.isbn) && "DOI or ISBN"]
    .filter((value): value is string => Boolean(value));
  const provenancePoints = Math.min(15, (provenance.title ? 2 : 0) + (provenance.author ? 4 : 0) + (provenance.publisher ? 3 : 0)
    + (provenance.publicationDate ? 3 : 0) + (provenance.journal ? 2 : 0) + (provenance.doi || provenance.isbn ? 6 : 0));
  add("provenance", provenancePoints, `Page states its ${identified.join(", ")}`);

  add("passage_support", SUPPORT_POINTS[input.bestSupport], input.bestSupport === "EXACT"
    ? "A passage covered nearly every material term of a question"
    : input.bestSupport === "STRONG" ? "A passage directly covered a question's central topic" : "A passage covered part of a question");

  const corroboration = Math.max(0, Math.min(2, Math.floor(input.independentCorroboration || 0)));
  add("corroboration", corroboration * 5, `${corroboration} independent work${corroboration === 1 ? "" : "s"} agreed in the same research`);
  if (hasExplicitRetentionRights(input.rights)) add("open_licence", 3, "Page declares an open licence");
  if (input.adminRule === "allowed") add("administrator", 10, "Site allowed by a DCF administrator");

  const record = input.trackRecord;
  if (record) {
    const reuse = Math.min(6, Math.max(0, record.distinctQuestions - 1) * 2) + Math.min(4, Math.max(0, record.timesCited));
    add("track_record", reuse, `Useful for ${record.distinctQuestions} distinct question${record.distinctQuestions === 1 ? "" : "s"}, cited ${record.timesCited} time${record.timesCited === 1 ? "" : "s"}`);
    const failures = Math.min(3, Math.max(0, record.consecutiveRecallFailures));
    add("recall_failures", failures * -5, `Could not be re-read ${failures} time${failures === 1 ? "" : "s"} in a row`);
  }

  let score = Math.max(0, Math.min(100, signals.reduce((sum, signal) => sum + signal.points, 0)));
  // An unrecognized publisher cannot buy trust with keyword overlap or metadata alone.
  if (input.authorityLevel === "general_web" && input.adminRule !== "allowed") {
    const named = Boolean(provenance.author || provenance.publisher || provenance.journal || provenance.doi || provenance.isbn);
    const cap = named ? 74 : 49;
    if (score > cap) {
      signals.push({ key: "general_web_cap", points: cap - score, detail: named
        ? "Unrecognized publisher: cannot be trusted without review" : "Unrecognized publisher with no named author or publisher" });
      score = cap;
    }
  }
  return { score, tier: credibilityTier(score), signals, rejected: null };
}
