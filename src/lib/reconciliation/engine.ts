import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "@/lib/corpus/errors";
import { loadPersonalityCoverage } from "@/lib/corpus/onboarding";
import { loadPersonalityConfiguration } from "@/lib/corpus/personality-context";
import { evaluateDepth } from "@/lib/live-research/depth";
import { isExactSupportLink } from "@/lib/live-research/provenance-link";
import { locatorCovers, parseLocator, type Locator } from "@/lib/evidence-completion/locator";
import { excludedStems, passageLocators, type PassageIdentity } from "@/lib/evidence-completion/passage-match";
import { workTitleOf } from "@/lib/evidence-completion/queue";
import { normalizedClaimText, reconcile, type ReconciliationProposal } from "./analysis";
import { atomicChildPlan, existingEquivalent } from "./lineage";

const PROVENANCE_REASONS = new Set(["Approved claims lack exact passage links", "Core claims lack exact passage links", "Too many claims lack exact or strong passage support"]);
type Link = { chunk_id: string; relationship: string; confidence: number | null; link_method: string | null; metadata: Record<string, unknown> | null };
type ClaimRow = { id: string; claim_text: string; certainty: string | null; parameter_field_id: string | null; claim_kind: string | null; evidence_type: string | null;
  claim_sources: Array<{ id: string; source_id: string; page_or_section: string | null }>; claim_chunks: Link[] };
type ChunkRow = { id: string; source_id: string; chunk_text: string; page_or_section: string | null; section_title: string | null; sources: { title: string; metadata: Record<string, unknown> | null; source_type: string | null } | null };

async function pages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new CorpusError("DATABASE_FAILED", "Reconciliation state could not be loaded.", 500, { cause: error });
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

const levelOf = (link: Link) => String(link.metadata?.supportLevel || "");
const passageKind = (sourceType: string | null): "primary" | "scholarly" | "other" =>
  /primary|scripture|text/i.test(sourceType || "") ? "primary" : /scholar|journal|academic|article|book/i.test(sourceType || "") ? "scholarly" : "other";

/**
 * Builds the reconciliation queue: approved claims without EXACT support that already have a STRONG or
 * PARTIAL located passage. Reads stored evidence only; no web, no model calls. Decided rows are kept.
 */
export async function buildReconciliationQueue(personalityId: string, options: { dryRun?: boolean } = {}) {
  const configuration = await loadPersonalityConfiguration(personalityId);
  const aliases = [configuration.canonicalName, ...configuration.aliases.filter((item) => !item.isAmbiguous).map((item) => item.alias)];
  const [claims, parameters, coverage, existing] = await Promise.all([
    pages<ClaimRow>((from, to) => supabaseAdmin.from("claims")
      .select("id,claim_text,certainty,parameter_field_id,claim_kind,evidence_type,claim_sources(id,source_id,page_or_section),claim_chunks(chunk_id,relationship,confidence,link_method,metadata)")
      .eq("personality_id", personalityId).eq("review_status", "approved").order("id").range(from, to)),
    supabaseAdmin.from("parameters").select("code,parameter_fields(id)").eq("category_id", configuration.categoryId),
    loadPersonalityCoverage(personalityId),
    pages<{ claim_id: string; chunk_id: string; proposal_key: string; status: string }>((from, to) => supabaseAdmin.from("claim_reconciliations")
      .select("claim_id,chunk_id,proposal_key,status").eq("personality_id", personalityId).order("id").range(from, to)),
  ]);
  if (parameters.error) throw new CorpusError("DATABASE_FAILED", "Parameters could not be loaded.", 500, { cause: parameters.error });
  const fieldParameter = new Map((parameters.data || []).flatMap((parameter) => (parameter.parameter_fields || []).map((field) => [field.id, parameter.code] as [string, string])));
  const depth = evaluateDepth(coverage.coverage.parameters);
  const nearGood = new Set(depth.areas.filter((area) => area.state !== "GOOD" && area.state !== "DEEP" && area.reasons.length
    && area.reasons.every((reason) => PROVENANCE_REASONS.has(reason))).map((area) => area.code));
  const pending = claims.filter((claim) => !(claim.claim_chunks || []).some(isExactSupportLink)
    && (claim.claim_chunks || []).some((link) => ["STRONG", "PARTIAL"].includes(levelOf(link))));
  const chunkIds = [...new Set(pending.flatMap((claim) => claim.claim_chunks.filter((link) => ["STRONG", "PARTIAL"].includes(levelOf(link))).map((link) => link.chunk_id)))];
  const chunks = new Map<string, ChunkRow>();
  for (let index = 0; index < chunkIds.length; index += 100) {
    const { data, error } = await supabaseAdmin.from("source_chunks").select("id,source_id,chunk_text,page_or_section,section_title,sources(title,metadata,source_type)")
      .in("id", chunkIds.slice(index, index + 100));
    if (error) throw new CorpusError("DATABASE_FAILED", "Located passages could not be loaded.", 500, { cause: error });
    for (const row of (data || []) as unknown as ChunkRow[]) chunks.set(row.id, { ...row, sources: Array.isArray(row.sources) ? row.sources[0] : row.sources });
  }
  // Every passage of a linked source: the fact a claim needs may sit in another chunk of the same cited page.
  const sourceChunks = new Map<string, ChunkRow[]>();
  for (const sourceId of new Set([...chunks.values()].map((chunk) => chunk.source_id))) {
    const { data, error } = await supabaseAdmin.from("source_chunks").select("id,source_id,chunk_text,page_or_section,section_title,sources(title,metadata,source_type)")
      .eq("source_id", sourceId).eq("is_active", true).order("chunk_index").limit(80);
    if (error) throw new CorpusError("DATABASE_FAILED", "Source passages could not be loaded.", 500, { cause: error });
    sourceChunks.set(sourceId, ((data || []) as unknown as ChunkRow[]).map((row) => ({ ...row, sources: Array.isArray(row.sources) ? row.sources[0] : row.sources })));
  }
  const citedSourceIds = [...new Set(pending.flatMap((claim) => claim.claim_sources.map((link) => link.source_id)))];
  const citedTitles = new Map<string, string>();
  for (let index = 0; index < citedSourceIds.length; index += 100) {
    const { data } = await supabaseAdmin.from("sources").select("id,title,metadata").in("id", citedSourceIds.slice(index, index + 100));
    for (const row of data || []) citedTitles.set(row.id, workTitleOf(row));
  }
  const decided = new Set(existing.filter((row) => row.status !== "proposed").map((row) => `${row.claim_id}:${row.chunk_id}:${row.proposal_key}`));
  const rows: Array<Record<string, unknown>> = [];
  const reasonCounts: Record<string, number> = {};
  let compound = 0, interpretive = 0;
  for (const claim of pending) {
    const links = claim.claim_chunks.filter((link) => ["STRONG", "PARTIAL"].includes(levelOf(link)) && chunks.has(link.chunk_id)).slice(0, 4);
    let claimCounted = false;
    for (const link of links) {
      const chunk = chunks.get(link.chunk_id)!;
      const source = chunk.sources;
      const work = workTitleOf({ title: source?.title || "", metadata: source?.metadata });
      const locators = passageLocators({ pageOrSection: chunk.page_or_section, sectionTitle: chunk.section_title, sourceTitle: source?.title || "", work });
      // The citation this passage answers: the same source, else the citation whose locator the passage covers.
      const citation = claim.claim_sources.find((item) => item.source_id === chunk.source_id)
        || claim.claim_sources.find((item) => locators.some((locator) => locatorCovers(parseLocator(item.page_or_section, citedTitles.get(item.source_id) || ""), locator) !== "none"))
        || claim.claim_sources[0];
      const requested: Locator = parseLocator(citation?.page_or_section, citedTitles.get(citation?.source_id || "") || work);
      const identity = (link.metadata?.identity as PassageIdentity | undefined)
        || (citation?.source_id === chunk.source_id ? "same_source" : requested.kind === "canonical" ? "same_work" : "alternate_edition");
      const exclude = excludedStems(aliases, [work, citedTitles.get(citation?.source_id || "") || ""]);
      const run = (passage: ChunkRow) => reconcile({ claimText: claim.claim_text, requested, identity,
        passage: { text: passage.chunk_text, locators: passageLocators({ pageOrSection: passage.page_or_section, sectionTitle: passage.section_title, sourceTitle: source?.title || "", work }) },
        exclude, subjectName: configuration.canonicalName, aliases, passageKind: passageKind(source?.source_type || null) });
      const result = run(chunk);
      // Proposals found in other chunks of the same source are kept against the chunk that supports them.
      const elsewhere = (sourceChunks.get(chunk.source_id) || []).filter((other) => other.id !== chunk.id).flatMap((other) => {
        const found = run(other);
        return found.proposals.filter((proposal) => proposal.deterministic || proposal.kind === "atomic_claim").map((proposal) => ({ proposal, chunk: other, found }));
      });
      if (!claimCounted) {
        claimCounted = true;
        if (result.reasons.includes("COMPOUND_CLAIM")) compound++;
        if (result.reasons.includes("INTERPRETIVE_CLAIM")) interpretive++;
      }
      for (const reason of result.reasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      const parameterCode = claim.parameter_field_id ? fieldParameter.get(claim.parameter_field_id) : undefined;
      const base = 3 * (claim.certainty === "high" ? 1 : 0) + (levelOf(link) === "STRONG" ? 2 : 1)
        + (["same_source", "identical_document"].includes(identity) ? 2 : 0) + (result.assessment.locatorFit === "exact" ? 2 : 0)
        + (parameterCode && nearGood.has(parameterCode) ? 3 : 0);
      const own = result.proposals.map((proposal) => ({ proposal, chunk, found: result }));
      const seen = new Set(own.map((item) => normalizedClaimText(item.proposal.text)));
      // Prefer the deterministic version of a proposition when several chunks propose it.
      const extra = elsewhere.sort((a, b) => Number(b.proposal.deterministic) - Number(a.proposal.deterministic))
        .filter((item) => !seen.has(normalizedClaimText(item.proposal.text)) && seen.add(normalizedClaimText(item.proposal.text)));
      const entries: Array<{ proposal: ReconciliationProposal | null; chunk: ChunkRow; found: typeof result }> = [...own, ...extra].length
        ? [...own, ...extra] : [{ proposal: null, chunk, found: result }];
      for (const { proposal, chunk: passage, found } of entries) {
        const key = proposal ? `${proposal.kind}:${normalizedClaimText(proposal.text).slice(0, 180)}` : "none";
        if (decided.has(`${claim.id}:${passage.id}:${key}`) || rows.some((row) => row.claim_id === claim.id && row.proposal_key === key)) continue;
        rows.push({ personality_id: personalityId, claim_id: claim.id, chunk_id: passage.id, source_id: passage.source_id,
          locator_raw: citation?.page_or_section || null, locator: requested, current_level: levelOf(link) as "STRONG" | "PARTIAL",
          reasons: found.reasons, proposal_kind: proposal?.kind || "none", proposed_text: proposal?.text || null, proposal_key: key,
          deterministic: Boolean(proposal?.deterministic),
          assessment: { level: found.assessment.level, reason: found.assessment.reason, identity, locatorFit: found.assessment.locatorFit,
            supportRatio: found.assessment.supportRatio, matchedTerms: found.assessment.matchedTerms, proposalBasis: proposal?.basis || null,
            proposalSupport: proposal?.support || null, parameterCode: parameterCode || null, factualPropositions: found.factual,
            interpretivePropositions: found.interpretive, propositionScores: found.scores },
          priority: base + (proposal ? (proposal.deterministic ? 3 : 1) : 0), status: "proposed", updated_at: new Date().toISOString() });
      }
    }
  }
  // Undecided proposals are machine output and are rebuilt; reviewer decisions are never replaced.
  if (!options.dryRun) {
    const { error } = await supabaseAdmin.from("claim_reconciliations").delete().eq("personality_id", personalityId).eq("status", "proposed");
    if (error) throw new CorpusError("DATABASE_FAILED", "Undecided proposals could not be refreshed.", 500, { cause: error });
  }
  if (!options.dryRun) for (let index = 0; index < rows.length; index += 200) {
    const { error } = await supabaseAdmin.from("claim_reconciliations").upsert(rows.slice(index, index + 200), { onConflict: "claim_id,chunk_id,proposal_key" });
    if (error) throw new CorpusError("DATABASE_FAILED", "Reconciliation proposals could not be saved.", 500, { cause: error });
  }
  return { claimsInQueue: pending.length, items: rows.length, reasons: reasonCounts,
    compoundClaims: compound, interpretiveClaims: interpretive,
    proposals: { atomicDeterministic: rows.filter((row) => row.proposal_kind === "atomic_claim" && row.deterministic).length,
      atomicLikely: rows.filter((row) => row.proposal_kind === "atomic_claim" && !row.deterministic).length,
      confirmExact: rows.filter((row) => row.proposal_kind === "confirm_exact").length,
      none: rows.filter((row) => row.proposal_kind === "none").length },
    nearGoodParameters: [...nearGood] };
}

export async function listReconciliations(personalityId: string, status = "proposed", limit = 100) {
  const { data, error } = await supabaseAdmin.from("claim_reconciliations")
    .select("id,claim_id,chunk_id,locator_raw,current_level,reasons,proposal_kind,proposed_text,deterministic,assessment,priority,status,child_claim_id,duplicate_of_claim_id,parent_possibly_redundant,reviewer,reviewer_kind,review_note,reviewed_at,claims!claim_reconciliations_claim_id_fkey(claim_text,certainty,evidence_type),source_chunks(chunk_text,page_or_section,sources(title,url))")
    .eq("personality_id", personalityId).eq("status", status).order("priority", { ascending: false }).limit(limit);
  if (error) throw new CorpusError("DATABASE_FAILED", "Reconciliation items could not be loaded.", 500, { cause: error });
  return data || [];
}

/** Every write in a review decision must land; a partial approval is reported, not ignored. */
async function must(operation: PromiseLike<{ error: unknown }>) {
  const { error } = await operation;
  if (error) throw new CorpusError("DATABASE_FAILED", "The review decision could not be saved completely.", 500, { cause: error });
}

export type ReviewAction = "approve_atomic" | "confirm_exact" | "keep_original" | "mark_interpretive" | "reject" | "mark_non_supporting";

/**
 * Applies one reviewer decision. Approval goes through the normal candidate → claim path, keeps lineage to
 * the parent, attaches the cited passage as EXACT with review provenance, and never edits the parent claim.
 */
export async function decideReconciliation(input: { id: string; action: ReviewAction; reviewer: string; reviewerKind: "human" | "ai_assisted"; note?: string | null; editedText?: string | null }) {
  const { data: item, error } = await supabaseAdmin.from("claim_reconciliations")
    .select("*,claims!claim_reconciliations_claim_id_fkey(id,personality_id,claim_text,certainty,parameter_field_id,claim_kind,evidence_type)")
    .eq("id", input.id).single();
  if (error || !item) throw new CorpusError("INVALID_INPUT", "Reconciliation item not found.", 404, { cause: error });
  if (item.status !== "proposed") throw new CorpusError("INVALID_INPUT", "This item has already been decided.", 409);
  const parent = Array.isArray(item.claims) ? item.claims[0] : item.claims;
  const now = new Date().toISOString();
  const decision = { reviewer: input.reviewer, reviewer_kind: input.reviewerKind, review_note: input.note || null, reviewed_at: now, updated_at: now };
  const provenance = { reviewer: input.reviewer, reviewerKind: input.reviewerKind, reconciliationId: item.id, reviewedAt: now };

  if (input.action === "approve_atomic") {
    if (item.proposal_kind !== "atomic_claim") throw new CorpusError("INVALID_INPUT", "Only an atomic proposal can be approved as a claim.", 422);
    const text = (input.editedText || item.proposed_text || "").trim();
    if (text.split(/\s+/).length < 4) throw new CorpusError("INVALID_INPUT", "The atomic claim is too short.", 422);
    const siblings = await pages<{ id: string; claim_text: string; parameter_field_id: string | null }>((from, to) => supabaseAdmin.from("claims")
      .select("id,claim_text,parameter_field_id").eq("personality_id", parent.personality_id).neq("review_status", "rejected").order("id").range(from, to));
    const duplicate = existingEquivalent(parent, text, siblings);
    if (duplicate) {
      await must(supabaseAdmin.from("claim_reconciliations").update({ ...decision, status: "duplicate", duplicate_of_claim_id: duplicate.id }).eq("id", item.id));
      return { status: "duplicate", duplicateOf: duplicate.id };
    }
    const siblingTypes = await supabaseAdmin.from("claim_sources").select("claims!inner(evidence_type,review_status)").eq("source_id", item.source_id).eq("claims.review_status", "approved").limit(500);
    if (siblingTypes.error) throw new CorpusError("DATABASE_FAILED", "Source claim types could not be loaded.", 500, { cause: siblingTypes.error });
    const plan = atomicChildPlan(parent, item, text, { reviewer: input.reviewer, reviewerKind: input.reviewerKind, at: now },
      (siblingTypes.data || []).map((row) => String((Array.isArray(row.claims) ? row.claims[0] : row.claims as { evidence_type: string })?.evidence_type || "")));
    const candidate = await supabaseAdmin.from("candidate_claims").insert(plan.candidate).select("id").single();
    if (candidate.error) throw new CorpusError("DATABASE_FAILED", "The atomic candidate could not be created.", 500, { cause: candidate.error });
    const accepted = await supabaseAdmin.rpc("accept_candidate_claim", { candidate_uuid: candidate.data.id, reviewer: input.reviewer });
    if (accepted.error) throw new CorpusError("DATABASE_FAILED", "The atomic claim could not be created.", 500, { cause: accepted.error });
    const childId = accepted.data as string;
    await must(supabaseAdmin.from("claims").update(plan.claim).eq("id", childId));
    // Keep the parent's work/locator on the child's citation, and mark the passage link as reviewed EXACT provenance.
    await must(supabaseAdmin.from("claim_sources").update(plan.citation).eq("claim_id", childId));
    await must(supabaseAdmin.from("claim_chunks").update(plan.link).eq("claim_id", childId).eq("chunk_id", item.chunk_id));
    await must(supabaseAdmin.from("claim_reviews").insert({ claim_id: childId, reviewer_name: input.reviewer, decision: "approved",
      notes: `Atomic refinement of ${parent.id}. ${input.note || ""}`.trim() }));
    // The parent stays approved; it is flagged for later consolidation when the child carries all its factual content.
    await must(supabaseAdmin.from("claim_reconciliations").update({ ...decision, status: "approved_atomic", candidate_claim_id: candidate.data.id,
      child_claim_id: childId, parent_possibly_redundant: plan.parentPossiblyRedundant }).eq("id", item.id));
    return { status: "approved_atomic", childClaimId: childId };
  }
  if (input.action === "confirm_exact") {
    if (item.proposal_kind !== "confirm_exact" || item.assessment?.locatorFit !== "exact") throw new CorpusError("INVALID_INPUT", "Only a located confirm-exact proposal can be confirmed.", 422);
    await must(supabaseAdmin.from("claim_chunks").update({ relationship: "supports", link_method: "reconciliation_confirmed", confidence: 0.9,
      metadata: { supportLevel: "EXACT", identity: item.assessment?.identity, locatorFit: "exact", basis: "reviewer-confirmed translation equivalence",
        equivalence: item.assessment?.proposalSupport, ...provenance } }).eq("claim_id", item.claim_id).eq("chunk_id", item.chunk_id));
    await must(supabaseAdmin.from("claim_reviews").insert({ claim_id: item.claim_id, reviewer_name: input.reviewer, decision: "approved",
      notes: `Confirmed EXACT passage support (reconciliation ${item.id}). ${input.note || ""}`.trim() }));
    await must(supabaseAdmin.from("claim_reconciliations").update({ ...decision, status: "confirmed_exact" }).eq("id", item.id));
    return { status: "confirmed_exact" };
  }
  if (input.action === "mark_non_supporting") {
    await must(supabaseAdmin.from("claim_chunks").update({ relationship: "context",
      metadata: { supportLevel: "RELATED", reviewNonSupporting: true, ...provenance } }).eq("claim_id", item.claim_id).eq("chunk_id", item.chunk_id));
  }
  const status: Record<Exclude<ReviewAction, "approve_atomic" | "confirm_exact">, string> = {
    keep_original: "kept_original", mark_interpretive: "marked_interpretive", reject: "rejected", mark_non_supporting: "passage_non_supporting" };
  await must(supabaseAdmin.from("claim_reconciliations").update({ ...decision, status: status[input.action] }).eq("id", item.id));
  return { status: status[input.action] };
}
