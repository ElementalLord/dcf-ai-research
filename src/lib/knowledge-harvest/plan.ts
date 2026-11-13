import { isLiveOrigin, type RetrievedPassage } from "@/lib/corpus/types";
import { classifySourceAuthority, type AuthorityRule } from "@/lib/sources/authority";
import { hasExplicitRetentionRights } from "@/lib/live-research/retention-rights";
import { evidenceTypeFor, sourceWorkKey } from "@/lib/live-research/research-quality";
import { canonicalResearchUrl } from "@/lib/live-research/source-policy";
import { assessCredibility, CREDIBILITY_VERSION, type CredibilityAssessment, type CredibilityInput } from "./credibility";
import { passageHash, questionFingerprint, topicTerms } from "./topics";

export type TrackRecord = { status: string; distinctQuestions: number; timesCited: number; consecutiveRecallFailures: number; seenQuestion: boolean };

export type HarvestFinding = {
  passage_hash: string;
  kind: "answer_evidence" | "deep_harvest";
  locator: string | null;
  /** Present only for openly licensed works; pointer-only findings carry no source text. */
  excerpt: string | null;
  topic_terms: string[];
  support_level: "EXACT" | "STRONG" | "PARTIAL" | null;
  support_reason: string | null;
  corroboration: number;
  cited: boolean;
};

export type HarvestSource = {
  work_key: string; url: string; domain: string; title: string;
  author: string | null; publisher: string | null; publication_date: string | null; journal: string | null;
  doi: string | null; isbn: string | null;
  evidence_type: CredibilityInput["evidenceType"];
  authority_level: CredibilityInput["authorityLevel"]; authority_basis: string;
  rights: string | null; retention: "pointer_only" | "licensed_excerpt";
  score: number; tier: CredibilityAssessment["tier"]; signals: CredibilityAssessment["signals"]; scoring_version: string;
  provider: string; cited: boolean; findings: HarvestFinding[];
};

export type HarvestPayload = {
  personality_id: string; question_hash: string; providers: string[];
  recall_attempted: number; recall_hits: number; recall_failures: string[]; search_saved: boolean;
  duration_ms: number; sources: HarvestSource[];
};

export type HarvestInput = {
  personalityId: string; personalityName: string; aliases: string[]; question: string;
  /** Every passage the research read for this person, cited or not. Non-live passages are ignored. */
  passages: RetrievedPassage[];
  /** chunkId values of the passages the final answer cited. */
  citedChunkIds: Set<string>;
  rules?: Array<AuthorityRule & { status: string }>;
  recall?: { attempted: number; failures: string[]; savedSearch: boolean };
  durationMs?: number;
};

const PROVIDER: Record<string, string> = { google_grounding: "google", brave_live: "brave", pmc_oai: "pmc", knowledge_recall: "recall" };
const SUPPORT_RANK = { EXACT: 3, STRONG: 2, PARTIAL: 1 } as const;
type StoredSupport = keyof typeof SUPPORT_RANK;

const publisherOf = (domain: string) => domain.replace(/^www\./, "");

function adminRuleFor(domain: string, rules: HarvestInput["rules"]): CredibilityInput["adminRule"] {
  const matching = (rules || []).filter((rule) => domain === rule.domain || domain.endsWith(`.${rule.domain}`));
  if (matching.some((rule) => rule.status === "blocked")) return "blocked";
  const narrowest = matching.sort((a, b) => b.domain.length - a.domain.length)[0];
  return narrowest ? narrowest.status as CredibilityInput["adminRule"] : null;
}

type Group = { workKey: string; url: string; domain: string; passages: RetrievedPassage[] };

/** Group live passages by the work they come from. Several URLs can deliver one work. */
export function groupByWork(passages: RetrievedPassage[]): Group[] {
  const groups = new Map<string, Group>();
  for (const passage of passages) {
    if (passage.kind !== "passage" || !isLiveOrigin(passage.origin) || !passage.sourceUrl || !passage.text?.trim()) continue;
    if (passage.accessibility && passage.accessibility !== "READABLE") continue;
    let url: string;
    let domain: string;
    try {
      url = canonicalResearchUrl(passage.sourceUrl);
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") continue;
      domain = parsed.hostname.toLowerCase();
    } catch { continue; }
    const workKey = passage.workKey || sourceWorkKey({ url, title: passage.provenance?.title || passage.sourceTitle,
      author: passage.provenance?.author || passage.sourceAuthor, doi: passage.provenance?.doi, isbn: passage.provenance?.isbn });
    const group = groups.get(workKey) || { workKey, url, domain, passages: [] };
    group.passages.push(passage);
    groups.set(workKey, group);
  }
  return [...groups.values()];
}

/**
 * Turn one Ask's live research into storable records. Pure: no network, no database.
 * `records` is what DCF already knew about these works (keyed by work key).
 */
export function buildHarvest(input: HarvestInput, records: Map<string, TrackRecord> = new Map()): HarvestPayload {
  const names = [input.personalityName, ...input.aliases];
  const questionHash = questionFingerprint(input.personalityId, input.question, names);
  const questionTerms = topicTerms(input.question, names, 10);
  const groups = groupByWork(input.passages);
  const supported = (group: Group) => group.passages.some((passage) => passage.supportLevel === "EXACT" || passage.supportLevel === "STRONG");
  const sources: HarvestSource[] = [];
  for (const group of groups) {
    const lead = group.passages.find((passage) => passage.provenance?.title) || group.passages[0];
    const provenance = lead.provenance || {};
    const best = group.passages.map((passage) => passage.supportLevel).filter((level): level is StoredSupport => Boolean(level && level in SUPPORT_RANK))
      .sort((a, b) => SUPPORT_RANK[b] - SUPPORT_RANK[a])[0] || null;
    const evidenceType = lead.evidenceType || evidenceTypeFor({ category: lead.sourceType });
    const authority = lead.authority || classifySourceAuthority({ url: group.url, sourceType: lead.sourceType, live: true }, input.rules || []);
    const rights = group.passages.map((passage) => passage.rightsDeclaration).find((value) => hasExplicitRetentionRights(value)) || null;
    // Agreement counts only across different works from different publishers.
    const corroboration = supported(group) ? groups.filter((other) => other.workKey !== group.workKey
      && publisherOf(other.domain) !== publisherOf(group.domain) && supported(other)).length : 0;
    const prior = records.get(group.workKey);
    const cited = group.passages.some((passage) => input.citedChunkIds.has(passage.chunkId));
    const trackRecord = prior ? { distinctQuestions: prior.distinctQuestions + (prior.seenQuestion ? 0 : 1),
      timesCited: prior.timesCited + (cited ? 1 : 0), consecutiveRecallFailures: 0 } : null;
    const assessment = assessCredibility({ url: group.url, authorityLevel: authority.level, authorityBasis: authority.basis, evidenceType,
      provenance, bestSupport: best, independentCorroboration: corroboration, rights, trackRecord,
      adminRule: adminRuleFor(group.domain, input.rules) });
    if (assessment.rejected) continue;
    const retention = rights ? "licensed_excerpt" as const : "pointer_only" as const;
    const seen = new Set<string>();
    const findings: HarvestFinding[] = [];
    for (const passage of group.passages) {
      const hash = passageHash(passage.text);
      if (seen.has(hash)) continue;
      seen.add(hash);
      const deep = passage.id.startsWith("deep:");
      const level = passage.supportLevel && passage.supportLevel in SUPPORT_RANK ? passage.supportLevel as StoredSupport : null;
      if (!deep && !level) continue;
      findings.push({ passage_hash: hash, kind: deep ? "deep_harvest" : "answer_evidence",
        locator: passage.pageOrSection || passage.sectionTitle || null,
        excerpt: retention === "licensed_excerpt" ? passage.text.slice(0, 600) : null,
        // A question's own terms describe what this passage answered; the passage's terms describe what else it covers.
        topic_terms: [...new Set([...(deep ? [] : questionTerms), ...topicTerms(passage.text, names, 28)])].slice(0, 36),
        support_level: level, support_reason: passage.supportReason?.slice(0, 300) || null,
        corroboration, cited: input.citedChunkIds.has(passage.chunkId) });
      if (findings.length >= 12) break;
    }
    if (!findings.length) continue;
    sources.push({ work_key: group.workKey.slice(0, 600), url: group.url, domain: group.domain,
      title: (provenance.title || lead.sourceTitle || group.domain).slice(0, 300),
      author: provenance.author || lead.sourceAuthor || null, publisher: provenance.publisher || null,
      publication_date: provenance.publicationDate || null, journal: provenance.journal || null,
      doi: provenance.doi || null, isbn: provenance.isbn || null,
      evidence_type: evidenceType, authority_level: authority.level, authority_basis: authority.basis,
      rights, retention, score: assessment.score, tier: assessment.tier, signals: assessment.signals,
      scoring_version: CREDIBILITY_VERSION, provider: PROVIDER[lead.origin || ""] || "live", cited, findings });
  }
  const recall = input.recall || { attempted: 0, failures: [], savedSearch: false };
  return { personality_id: input.personalityId, question_hash: questionHash,
    providers: [...new Set(sources.map((source) => source.provider))],
    recall_attempted: recall.attempted, recall_hits: sources.filter((source) => source.provider === "recall").length,
    recall_failures: recall.failures.slice(0, 10), search_saved: recall.savedSearch,
    duration_ms: Math.max(0, Math.round(input.durationMs || 0)), sources: sources.slice(0, 40) };
}
