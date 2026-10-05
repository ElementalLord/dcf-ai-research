import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "@/lib/corpus/errors";
import { loadPersonalityCoverage } from "@/lib/corpus/onboarding";
import { evaluateDepth } from "@/lib/live-research/depth";
import { isExactSupportLink } from "@/lib/live-research/provenance-link";
import { classifyClaim } from "./classification";
import { CONTRACTS, evaluateContract, evaluateUnresolved } from "./contracts";
import { inMetricScope, type MetricScope } from "./evaluation";
import { CLASSIFIER_VERSION, CONTRACT_VERSION, DEPTH_VERSION, EPISTEMIC_TYPES, independentWorkKey, sourceClassOf,
  type ContractEvidence, type EpistemicType, type PassageLevel, type SourceClass } from "./types";

type Link = { chunk_id: string; relationship: string; confidence: number | null; link_method: string | null; metadata: Record<string, unknown> | null };
type ClaimRow = { id: string; claim_text: string; claim_kind: string | null; evidence_type: string | null; certainty: string | null; approval_origin: string | null;
  approval_metadata: Record<string, unknown> | null; parameter_field_id: string | null;
  claim_sources: Array<{ source_id: string; page_or_section: string | null }>; claim_chunks: Link[] };
type SourceRow = { id: string; title: string | null; author: string | null; source_type: string | null; textual_layer: string | null; content_hash: string | null; metadata: Record<string, unknown> | null };
type ExistingRow = { claim_id: string; epistemic_type: EpistemicType | null; type_origin: string; type_review_status: string; reviewer: string | null; reviewer_kind: string | null; review_note: string | null; reviewed_at: string | null };

async function pages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new CorpusError("DATABASE_FAILED", "Claim epistemics could not be loaded.", 500, { cause: error });
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

/** A passage link's level as the contract sees it; links a reviewer marked non-supporting are dropped. */
export function linkLevel(link: Link): PassageLevel | null {
  if (link.metadata?.reviewNonSupporting) return null;
  if (isExactSupportLink(link)) return "EXACT";
  const level = String(link.metadata?.supportLevel || "");
  if (level === "STRONG" || level === "PARTIAL" || level === "RELATED") return level;
  return link.relationship === "contradicts" ? null : "RELATED";
}

/**
 * Classifies every approved claim deterministically and evaluates its evidence contract, persisting the result.
 * Human and mentor type decisions are kept; only their contract evaluation is refreshed.
 */
export async function reassessEpistemics(personalityId: string) {
  const [claims, parameters, existing, relations] = await Promise.all([
    pages<ClaimRow>((from, to) => supabaseAdmin.from("claims")
      .select("id,claim_text,claim_kind,evidence_type,certainty,approval_origin,approval_metadata,parameter_field_id,claim_sources(source_id,page_or_section),claim_chunks(chunk_id,relationship,confidence,link_method,metadata)")
      .eq("personality_id", personalityId).eq("review_status", "approved").order("id").range(from, to)),
    supabaseAdmin.from("parameter_fields").select("id,parameters(code)"),
    pages<ExistingRow>((from, to) => supabaseAdmin.from("claim_epistemics")
      .select("claim_id,epistemic_type,type_origin,type_review_status,reviewer,reviewer_kind,review_note,reviewed_at").eq("personality_id", personalityId).order("claim_id").range(from, to)),
    supabaseAdmin.from("claim_relations").select("claim_id,related_claim_id,relation"),
  ]);
  if (parameters.error || relations.error) throw new CorpusError("DATABASE_FAILED", "Claim epistemics could not be loaded.", 500, { cause: parameters.error || relations.error });
  const fieldCode = new Map((parameters.data || []).map((row) => {
    const parameter = Array.isArray(row.parameters) ? row.parameters[0] : row.parameters as { code: string } | null;
    return [row.id, parameter?.code || null] as [string, string | null];
  }));
  // Chunk → source, and source metadata for every cited or linked source.
  const chunkIds = [...new Set(claims.flatMap((claim) => claim.claim_chunks.map((link) => link.chunk_id)))];
  const chunkSource = new Map<string, string>();
  for (let index = 0; index < chunkIds.length; index += 200) {
    const { data, error } = await supabaseAdmin.from("source_chunks").select("id,source_id").in("id", chunkIds.slice(index, index + 200));
    if (error) throw new CorpusError("DATABASE_FAILED", "Passage sources could not be loaded.", 500, { cause: error });
    for (const row of data || []) chunkSource.set(row.id, row.source_id);
  }
  const sourceIds = [...new Set([...chunkSource.values(), ...claims.flatMap((claim) => claim.claim_sources.map((link) => link.source_id))])];
  const sources = new Map<string, SourceRow>();
  for (let index = 0; index < sourceIds.length; index += 100) {
    const { data, error } = await supabaseAdmin.from("sources").select("id,title,author,source_type,textual_layer,content_hash,metadata").in("id", sourceIds.slice(index, index + 100));
    if (error) throw new CorpusError("DATABASE_FAILED", "Sources could not be loaded.", 500, { cause: error });
    for (const row of (data || []) as SourceRow[]) sources.set(row.id, row);
  }
  const classOf = (id: string): SourceClass => { const source = sources.get(id); return source ? sourceClassOf(source) : "OTHER"; };
  const prior = new Map(existing.map((row) => [row.claim_id, row]));
  const now = new Date().toISOString();

  const evaluated = claims.map((claim) => {
    const classification = classifyClaim({ text: claim.claim_text, claimKind: claim.claim_kind, evidenceType: claim.evidence_type,
      parameterCode: claim.parameter_field_id ? fieldCode.get(claim.parameter_field_id) : null,
      sourceClasses: [...new Set(claim.claim_sources.map((link) => classOf(link.source_id)))], locators: claim.claim_sources.map((link) => link.page_or_section) });
    const previous = prior.get(claim.id);
    const human = previous && previous.type_origin !== "deterministic";
    const type: EpistemicType | null = human ? previous!.epistemic_type : classification.needsReview ? null : classification.type;
    const evidence: ContractEvidence[] = claim.claim_chunks.flatMap((link) => {
      const level = linkLevel(link);
      const sourceId = chunkSource.get(link.chunk_id);
      const source = sourceId ? sources.get(sourceId) : null;
      return level && source ? [{ level, sourceClass: sourceClassOf(source), workKey: independentWorkKey(source) }] : [];
    });
    return { claim, classification, previous, human, type, evidence };
  });
  // Contested claims are represented when a recorded conflicting claim is itself supported.
  const firstPass = new Map(evaluated.map((item) => [item.claim.id, evaluateContract(item.type, item.evidence)]));
  const rows = evaluated.map(({ claim, classification, previous, human, type, evidence }) => {
    const conflictSupported = (relations.data || []).some((relation) => [relation.claim_id, relation.related_claim_id].includes(claim.id)
      && firstPass.get(relation.claim_id === claim.id ? relation.related_claim_id : relation.claim_id)?.satisfied === true);
    const unresolved = type || previous?.type_review_status === "kept_unclassified" ? null : evaluateUnresolved(classification.candidates, evidence, { conflictSupported });
    const contract = unresolved || evaluateContract(type, evidence, { conflictSupported });
    const provisional = type ? null : { candidates: classification.candidates, typeDependent: unresolved?.typeDependent ?? true };
    return {
      claim_id: claim.id, personality_id: personalityId, epistemic_type: type, proposed_type: classification.type,
      type_origin: human ? previous!.type_origin : "deterministic", type_confidence: classification.confidence,
      type_review_status: human ? previous!.type_review_status : classification.needsReview ? "needs_type_review" : "auto_assigned",
      classifier_version: CLASSIFIER_VERSION, classification_signals: classification.signals, is_compound: classification.compound, proposition_count: classification.parts,
      contract_status: contract.status, contract_satisfied: contract.satisfied, contract_basis: contract.basis, contract_version: CONTRACT_VERSION,
      contract_detail: { reasons: contract.reasons, contract: type ? CONTRACTS[type].description : null, provisional,
        evidence: evidence.map((item) => `${item.level}:${item.sourceClass}`), strictScope: inMetricScope(claim, "strict") },
      reviewer: previous?.reviewer || null, reviewer_kind: previous?.reviewer_kind || null, review_note: previous?.review_note || null, reviewed_at: previous?.reviewed_at || null,
      evaluated_at: now, updated_at: now,
    };
  });
  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await supabaseAdmin.from("claim_epistemics").upsert(rows.slice(index, index + 200), { onConflict: "claim_id" });
    if (error) throw new CorpusError("DATABASE_FAILED", "Claim epistemics could not be saved.", 500, { cause: error });
  }
  return { claims: rows.length, humanKept: evaluated.filter((item) => item.human).length, versions: { classifier: CLASSIFIER_VERSION, contracts: CONTRACT_VERSION } };
}

export type TypeReviewAction = "confirm_type" | "change_type" | "mark_contested" | "mark_synthetic" | "mark_historical_inference" | "keep_unclassified";

/** A reviewer decision outranks the classifier from now on; the contract is re-evaluated with the reviewed type. */
export async function reviewClaimType(input: { claimId: string; action: TypeReviewAction; type?: EpistemicType; reviewer: string; reviewerKind: "human" | "mentor" | "ai_assisted"; note?: string | null }) {
  const { data: row, error } = await supabaseAdmin.from("claim_epistemics").select("claim_id,personality_id,epistemic_type,proposed_type").eq("claim_id", input.claimId).single();
  if (error || !row) throw new CorpusError("INVALID_INPUT", "Run a reassessment before reviewing this claim's type.", 404, { cause: error });
  const target: EpistemicType | null = input.action === "confirm_type" ? (row.epistemic_type || row.proposed_type) as EpistemicType
    : input.action === "change_type" ? input.type || null : input.action === "mark_contested" ? "CONTESTED"
      : input.action === "mark_synthetic" ? "SYNTHETIC_INTERPRETATION" : input.action === "mark_historical_inference" ? "HISTORICAL_INFERENCE" : null;
  if (input.action !== "keep_unclassified" && (!target || !EPISTEMIC_TYPES.includes(target))) throw new CorpusError("INVALID_INPUT", "Choose a valid claim type.", 422);
  // Only a human or mentor decision becomes authoritative; an AI-assisted review stays a reviewable proposal.
  const origin = input.reviewerKind === "ai_assisted" ? "deterministic" : input.reviewerKind;
  const status = input.action === "keep_unclassified" ? "kept_unclassified" : input.action === "confirm_type" ? "human_confirmed" : "human_changed";
  const { error: updateError } = await supabaseAdmin.from("claim_epistemics").update({
    epistemic_type: input.action === "keep_unclassified" ? null : target, type_origin: origin,
    type_review_status: input.reviewerKind === "ai_assisted" ? "needs_type_review" : status,
    reviewer: input.reviewer, reviewer_kind: input.reviewerKind, review_note: input.note || null, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("claim_id", input.claimId);
  if (updateError) throw new CorpusError("DATABASE_FAILED", "The type review could not be saved.", 500, { cause: updateError });
  await reassessEpistemics(row.personality_id);
  return { claimId: input.claimId, type: target, status };
}

/** Admin summary: type mix, contract outcomes, type-aware parameter depth with explanations, and the type-review queue. */
export async function epistemicSummary(personalityId: string, scope: MetricScope = "strict") {
  type Embedded = { claim_text: string; certainty: string | null; approval_origin: string | null; approval_metadata: Record<string, unknown> | null; evidence_type: string | null };
  const [rawRows, coverage] = await Promise.all([
    pages<{ claim_id: string; epistemic_type: string | null; proposed_type: string; type_confidence: number; type_review_status: string; type_origin: string;
      classification_signals: unknown; is_compound: boolean; contract_status: string; contract_satisfied: boolean | null; contract_basis: string | null; contract_detail: Record<string, unknown>;
      claims: Embedded | Embedded[] | null }>((from, to) =>
      supabaseAdmin.from("claim_epistemics").select("claim_id,epistemic_type,proposed_type,type_confidence,type_review_status,type_origin,classification_signals,is_compound,contract_status,contract_satisfied,contract_basis,contract_detail,claims(claim_text,certainty,approval_origin,approval_metadata,evidence_type)")
        .eq("personality_id", personalityId).order("claim_id").range(from, to)),
    loadPersonalityCoverage(personalityId, { scope }),
  ]);
  const rows = rawRows.map((row) => ({ ...row, claims: Array.isArray(row.claims) ? row.claims[0] || null : row.claims }));
  const inScope = rows.filter((row) => row.claims && inMetricScope(row.claims, scope));
  const count = (key: (row: (typeof inScope)[number]) => string) => inScope.reduce<Record<string, number>>((acc, row) => { const k = key(row); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const depth = evaluateDepth(coverage.coverage.parameters);
  return {
    scope, versions: { classifier: CLASSIFIER_VERSION, contracts: CONTRACT_VERSION, depth: DEPTH_VERSION },
    claims: inScope.length, excludedFromScope: rows.length - inScope.length,
    byType: count((row) => row.epistemic_type || `UNTYPED (proposed ${row.proposed_type})`),
    byTypeSatisfied: count((row) => `${row.epistemic_type || "UNTYPED"}:${row.contract_satisfied === true ? "met" : row.contract_satisfied === null ? "n/a" : "unmet"}`),
    byStatus: count((row) => row.contract_status), byReview: count((row) => row.type_review_status),
    compound: inScope.filter((row) => row.is_compound).length,
    exact: { claims: coverage.coverage.overall.approvedClaims, exactClaims: coverage.coverage.overall.claimsWithExactPassages },
    parameters: depth.areas.map((area) => ({ code: area.code, name: area.name, state: area.state, reasons: area.reasons, explanation: area.explanation, depthVersion: area.depthVersion })),
    reviewQueue: inScope.filter((row) => row.type_review_status === "needs_type_review").sort((a, b) => b.type_confidence - a.type_confidence).slice(0, 150)
      .map((row) => ({ claimId: row.claim_id, text: row.claims?.claim_text, certainty: row.claims?.certainty, legacyEvidenceType: row.claims?.evidence_type,
        currentType: row.epistemic_type, proposedType: row.proposed_type, confidence: row.type_confidence, signals: row.classification_signals, compound: row.is_compound,
        contractStatus: row.contract_status, contractDetail: row.contract_detail })),
  };
}
