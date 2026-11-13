import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logStage } from "@/lib/corpus/observability";
import type { RetrievedPassage } from "@/lib/corpus/types";
import { inspectSearchSource, readGroundedExcerpt, sourceAccess } from "@/lib/live-research/search-credibility";
import { searchPolicyDecision, type SearchPolicy } from "@/lib/live-research/search-policy";
import { harvestEnabled, harvestStoreAvailable, noteHarvestStoreError } from "./harvest";
import { topicTerms } from "./topics";

export type RecallResult = {
  passages: RetrievedPassage[];
  /** Remembered sources that were tried. */
  attempted: number;
  /** knowledge_sources ids that could no longer supply a supporting passage. */
  failures: string[];
};

type RecallRow = { source_id: string; canonical_url: string; title: string; domain: string; evidence_type: string;
  credibility_score: number; credibility_tier: string; matched_terms: number; findings: number };

const EMPTY: RecallResult = { passages: [], attempted: 0, failures: [] };
const withTimeout = <T,>(work: Promise<T>, ms: number, fallback: T) =>
  Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

/**
 * Before any paid search, re-read works that earlier questions found credible and
 * on-topic for this person. The page is fetched again and must still contain a
 * directly supporting passage, so nothing is answered from memory alone.
 */
export async function recallKnownSources(input: { personalityId: string; personalityName: string; aliases: string[];
  question: string; policy: SearchPolicy; limit?: number }): Promise<RecallResult> {
  if (!harvestEnabled() || !harvestStoreAvailable()) return EMPTY;
  if (input.policy.mode === "approved_domains_only" && !input.policy.rules.some((rule) => rule.status === "allowed")) return EMPTY;
  const names = [input.personalityName, ...input.aliases];
  const terms = topicTerms(input.question, names, 16);
  if (!terms.length) return EMPTY;
  try {
    const { data, error } = await supabaseAdmin.rpc("recall_knowledge_sources", {
      p_personality_id: input.personalityId, p_terms: terms, p_limit: Math.max(1, Math.min(3, input.limit || 2)) });
    if (error) { noteHarvestStoreError(error); return EMPTY; }
    const rows = ((data || []) as RecallRow[]).filter((row) => searchPolicyDecision(row.canonical_url, input.policy).allowed);
    if (!rows.length) return EMPTY;
    const read = await Promise.all(rows.map((row, index) => withTimeout((async (): Promise<RetrievedPassage | null> => {
      const source = await inspectSearchSource(row.canonical_url, input.policy, row.title);
      if (!source) return null;
      const excerpt = await readGroundedExcerpt(source, input.question, names, input.policy);
      if (!excerpt) return null;
      return {
        kind: "passage", id: `recall:${row.source_id}:${index}`, chunkId: `recall:${row.source_id}:${index}`,
        sourceId: `recall:${row.source_id}`, text: excerpt.text, sectionTitle: null, pageOrSection: excerpt.locator,
        textualLayer: excerpt.identity.evidenceType === "traditional_text"
          ? "Traditional text; establishes what the text narrates, not historical occurrence"
          : "Original page re-read from an earlier DCF research finding; interpret textual status from source",
        sourceTitle: excerpt.title, sourceAuthor: excerpt.identity.author, sourceInstitution: source.domain,
        sourceUrl: excerpt.url, sourceType: source.category, sourceStatus: "discovered",
        personalityId: input.personalityId, personalityName: input.personalityName, origin: "knowledge_recall",
        retrievedAt: new Date().toISOString(), lexicalScore: 1, evidenceType: excerpt.identity.evidenceType,
        supportLevel: excerpt.supportLevel, supportReason: excerpt.supportReason, workKey: excerpt.identity.workKey,
        accessibility: "READABLE", rightsDeclaration: excerpt.rightsDeclaration,
        provenance: { title: excerpt.identity.title, author: excerpt.identity.author, publisher: excerpt.identity.publisher,
          publicationDate: excerpt.identity.publicationDate, journal: excerpt.identity.journal, doi: excerpt.identity.doi,
          isbn: excerpt.identity.isbn, complete: excerpt.identity.provenanceComplete },
      };
    })().catch(() => null), 9_000, null)));
    const passages = read.filter((item): item is RetrievedPassage => Boolean(item));
    // A readable page that simply does not cover this question is not a failure of the source.
    const missed = rows.filter((_, index) => !read[index]);
    const access = await Promise.all(missed.map((row) => withTimeout(sourceAccess(row.canonical_url).catch(() => "unreadable" as const), 6_000, "readable" as const)));
    const failures = missed.filter((_, index) => access[index] !== "readable").map((row) => row.source_id);
    logStage("KNOWLEDGE_RECALL", { candidates: rows.length, hits: passages.length });
    return { passages, attempted: rows.length, failures };
  } catch {
    return EMPTY;
  }
}
