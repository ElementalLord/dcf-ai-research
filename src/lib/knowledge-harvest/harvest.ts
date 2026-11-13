import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logStage } from "@/lib/corpus/observability";
import type { RetrievedPassage } from "@/lib/corpus/types";
import { readSubjectPassages } from "@/lib/live-research/search-credibility";
import type { SearchPolicy } from "@/lib/live-research/search-policy";
import { buildHarvest, groupByWork, type HarvestInput, type HarvestPayload, type TrackRecord } from "./plan";
import { passageHash, questionFingerprint } from "./topics";

/** On unless explicitly switched off. A database without the harvest tables simply records nothing. */
export const harvestEnabled = () => process.env.KNOWLEDGE_HARVEST_ENABLED !== "false";
const deepHarvestEnabled = () => process.env.KNOWLEDGE_DEEP_HARVEST_ENABLED !== "false";

// After a missing-table error, stop asking for a while instead of failing on every question.
let unavailableUntil = 0;
const MISSING = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
export function harvestStoreAvailable(): boolean { return Date.now() >= unavailableUntil; }
export function noteHarvestStoreError(error: { code?: string } | null | undefined): void {
  if (error?.code && MISSING.has(error.code)) unavailableUntil = Date.now() + 10 * 60_000;
}
/** Test hook. */
export function resetHarvestStoreAvailability(): void { unavailableUntil = 0; }

export type HarvestJob = HarvestInput & { policy: SearchPolicy };
export type HarvestOutcome = { stored: boolean; sources: number; findings: number; newSources: number; newFindings: number; promotionReady: number; reason?: string };

async function loadTrackRecords(workKeys: string[], questionHash: string): Promise<Map<string, TrackRecord>> {
  const records = new Map<string, TrackRecord>();
  if (!workKeys.length) return records;
  const { data, error } = await supabaseAdmin.rpc("knowledge_source_track_records", { p_work_keys: workKeys.slice(0, 60) });
  if (error) { noteHarvestStoreError(error); throw new Error("HARVEST_STORE_UNAVAILABLE"); }
  for (const row of (data || []) as Array<{ work_key: string; status: string; distinct_questions: number; times_cited: number;
    consecutive_recall_failures: number; question_hashes: string[] | null }>) {
    records.set(row.work_key, { status: row.status, distinctQuestions: row.distinct_questions, timesCited: row.times_cited,
      consecutiveRecallFailures: row.consecutive_recall_failures, seenQuestion: (row.question_hashes || []).includes(questionHash) });
  }
  return records;
}

/**
 * Look further into the best pages this answer already read: other fact-dense passages
 * about the same person become pointers, so a later question on a different topic can
 * find the page without a paid search. Bounded to a few free page reads.
 */
async function deepHarvest(job: HarvestJob, payload: HarvestPayload): Promise<RetrievedPassage[]> {
  const targets = payload.sources.filter((source) => source.tier === "trusted" || source.tier === "credible")
    .sort((a, b) => Number(b.cited) - Number(a.cited) || b.score - a.score).slice(0, 3);
  const groups = new Map(groupByWork(job.passages).map((group) => [group.workKey, group]));
  const extra: RetrievedPassage[] = [];
  await Promise.all(targets.map(async (source) => {
    const template = groups.get(source.work_key)?.passages[0];
    if (!template) return;
    const known = new Set(source.findings.map((finding) => finding.passage_hash));
    const passages = await readSubjectPassages(source.url, [job.personalityName, ...job.aliases], job.policy, 6).catch(() => []);
    let added = 0;
    for (const passage of passages) {
      const hash = passageHash(passage.text);
      if (known.has(hash) || added >= 4) continue;
      known.add(hash);
      added += 1;
      extra.push({ ...template, id: `deep:${hash.slice(0, 16)}`, chunkId: `deep:${hash.slice(0, 16)}`, text: passage.text,
        pageOrSection: passage.locator, sectionTitle: null, supportLevel: undefined, supportReason: undefined,
        rightsDeclaration: passage.rightsDeclaration, workKey: source.work_key });
    }
  }));
  return extra;
}

/** Record what one Ask's live research read. Never throws: harvesting cannot affect an answer. */
export async function runHarvest(job: HarvestJob): Promise<HarvestOutcome> {
  const none = (reason: string): HarvestOutcome => ({ stored: false, sources: 0, findings: 0, newSources: 0, newFindings: 0, promotionReady: 0, reason });
  if (!harvestEnabled()) return none("disabled");
  if (!harvestStoreAvailable()) return none("store_unavailable");
  const hasRecallActivity = Boolean(job.recall?.attempted);
  try {
    const groups = groupByWork(job.passages);
    if (!groups.length && !hasRecallActivity) return none("no_live_evidence");
    const names = [job.personalityName, ...job.aliases];
    const records = await loadTrackRecords(groups.map((group) => group.workKey),
      questionFingerprint(job.personalityId, job.question, names));
    let payload = buildHarvest(job, records);
    if (deepHarvestEnabled() && payload.sources.length) {
      const extra = await deepHarvest(job, payload);
      if (extra.length) payload = buildHarvest({ ...job, passages: [...job.passages, ...extra] }, records);
    }
    if (!payload.sources.length && !hasRecallActivity) return none("nothing_credible");
    const { data, error } = await supabaseAdmin.rpc("record_knowledge_harvest", { p_harvest: payload });
    if (error || !data || typeof data !== "object") { noteHarvestStoreError(error); return none(error?.code || "write_failed"); }
    const row = data as { sources?: number; findings?: number; new_sources?: number; new_findings?: number; promotion_ready?: number };
    const outcome: HarvestOutcome = { stored: true, sources: row.sources || 0, findings: row.findings || 0,
      newSources: row.new_sources || 0, newFindings: row.new_findings || 0, promotionReady: row.promotion_ready || 0 };
    logStage("KNOWLEDGE_HARVEST", { sources: outcome.sources, findings: outcome.findings, newSources: outcome.newSources,
      newFindings: outcome.newFindings, promotionReady: outcome.promotionReady });
    return outcome;
  } catch (error) {
    return none(error instanceof Error ? error.message.slice(0, 60) : "failed");
  }
}
