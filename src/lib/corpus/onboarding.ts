import "server-only";
import { inMetricScope, type ClaimEpistemicState, type MetricScope } from "@/lib/claim-epistemics/evaluation";
import { independentWorkKey, type ContractStatus, type EpistemicType } from "@/lib/claim-epistemics/types";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generationCircuit, embeddingCircuit } from "./provider-health";
import { CorpusError } from "./errors";
import { extractUrl } from "./source-extract";
import { ingestSections } from "./ingest";
import { tagSourceChunks } from "./tagging";
import { embedSourceChunks } from "./embeddings";
import { extractCandidateProposals, type ProposalType } from "./candidate-claims";
import { retrieveEvidence } from "./retrieval";
import { computeCorpusCoverage } from "./coverage";
import { loadPersonalityConfiguration } from "./personality-context";
import { normalizeOnboardingPlan, type OnboardingStep } from "./onboarding-plan";
import { selectSourceAuthorization, type SourceAccessRule } from "@/lib/live-research/source-policy";
import { isExactSupportLink } from "@/lib/live-research/provenance-link";

export async function runPersonalityOnboarding(input: {
  personalityId: string;
  sourceIds: string[];
  steps: OnboardingStep[];
  benchmarkQuestions?: string[];
}) {
  const plan = normalizeOnboardingPlan(input);
  const configuration = await loadPersonalityConfiguration(input.personalityId);
  const { data: sources, error } = await supabaseAdmin
    .from("sources")
    .select("id, title, url, source_status, ingestion_status, textual_layer, content_language")
    .in("id", plan.sourceIds);
  if (error) throw new CorpusError("DATABASE_FAILED", "The onboarding source set could not be loaded.", 500, { cause: error });
  if ((sources || []).some((source) => source.source_status !== "approved")) {
    throw new CorpusError("INVALID_INPUT", "Onboarding may only run against evidence-approved sources.", 422);
  }

  if ((sources || []).length > 0) {
    const { error: mappingError } = await supabaseAdmin.from("source_personalities").upsert(
      (sources || []).map((source) => ({
        source_id: source.id,
        personality_id: input.personalityId,
        relationship: "onboarding_source",
        confidence: 1,
        mapping_method: "manual",
        metadata: { workflow: "reusable_onboarding" },
      })),
      { onConflict: "source_id,personality_id" },
    );
    if (mappingError) throw new CorpusError("DATABASE_FAILED", "Source-personality mappings could not be saved.", 500, { cause: mappingError });
  }

  const results: Array<{ step: OnboardingStep; sourceId?: string; ok: boolean; detail: unknown }> = [];
  for (const source of sources || []) {
    if (plan.steps.includes("ingest")) {
      try {
        if (!source.url) throw new Error("Source has no URL.");
        const extracted = await extractUrl(source.url);
        const detail = await ingestSections({
          sourceId: source.id,
          personalityIds: [input.personalityId],
          textualLayer: source.textual_layer,
          language: source.content_language,
          sections: extracted.sections,
        });
        results.push({ step: "ingest", sourceId: source.id, ok: true, detail });
      } catch (stepError) {
        results.push({ step: "ingest", sourceId: source.id, ok: false, detail: stepError instanceof Error ? stepError.message : String(stepError) });
      }
    }
    const aiPaused = () => generationCircuit.state().open || embeddingCircuit.state().open;
    if (plan.steps.includes("tag") && !aiPaused()) {
      try {
        results.push({ step: "tag", sourceId: source.id, ok: true, detail: await tagSourceChunks(source.id, true) });
      } catch (stepError) {
        results.push({ step: "tag", sourceId: source.id, ok: false, detail: stepError instanceof Error ? stepError.message : String(stepError) });
      }
    }
    if (plan.steps.includes("embed") && !aiPaused()) {
      try {
        results.push({ step: "embed", sourceId: source.id, ok: true, detail: await embedSourceChunks(source.id) });
      } catch (stepError) {
        results.push({ step: "embed", sourceId: source.id, ok: false, detail: stepError instanceof Error ? stepError.message : String(stepError) });
      }
    }
    const proposalSteps = [
      ["extract_claims", "claims"],
      ["propose_events", "events"],
      ["propose_relationships", "relationships"],
    ] as const;
    const requestedProposals = proposalSteps.filter(([step]) => plan.steps.includes(step)).map(([, proposal]) => proposal) as ProposalType[];
    if (requestedProposals.length > 0 && !aiPaused()) {
      try {
        const detail = await extractCandidateProposals({ sourceId: source.id, personalityId: input.personalityId, limit: 10, proposalTypes: requestedProposals });
        for (const [step] of proposalSteps.filter(([, proposal]) => requestedProposals.includes(proposal))) {
          results.push({ step, sourceId: source.id, ok: true, detail });
        }
      } catch (stepError) {
        for (const [step] of proposalSteps.filter(([, proposal]) => requestedProposals.includes(proposal))) {
          results.push({ step, sourceId: source.id, ok: false, detail: stepError instanceof Error ? stepError.message : String(stepError) });
        }
      }
    }
    if (aiPaused()) {
      results.push({ step: "tag", sourceId: source.id, ok: false, detail: { aiPaused: true, reason: generationCircuit.state().category || embeddingCircuit.state().category, resume: "Re-run the same plan after provider cooldown; completed AI work is checkpointed." } });
    }
  }

  if (plan.steps.includes("backfill")) {
    const [tags, exactLinks, overlapLinks] = await Promise.all([
      supabaseAdmin.rpc("tag_personality_chunks_from_claim_sources", { personality_uuid: input.personalityId }),
      supabaseAdmin.rpc("backfill_personality_claim_chunks", {
        personality_uuid: input.personalityId,
        minimum_confidence: 0.72,
        maximum_links_per_claim: 2,
      }),
      supabaseAdmin.rpc("backfill_personality_claim_chunks_overlap", {
        personality_uuid: input.personalityId,
        minimum_matched_terms: 2,
        minimum_overlap_ratio: 0.1,
        maximum_links_per_claim: 2,
      }),
    ]);
    if (tags.error || exactLinks.error || overlapLinks.error) throw new CorpusError("DATABASE_FAILED", "The generic provenance backfill failed.", 500, { cause: tags.error || exactLinks.error || overlapLinks.error });
    results.push({ step: "backfill", ok: true, detail: { tags: tags.data, exactLinks: exactLinks.data, overlapLinks: overlapLinks.data } });
  }

  if (plan.steps.includes("benchmark")) {
    const questions = plan.benchmarkQuestions.length > 0
      ? plan.benchmarkQuestions
      : [`Who is ${configuration.canonicalName}?`];
    for (const question of questions) {
      try {
        const retrieval = await retrieveEvidence(question, input.personalityId);
        results.push({ step: "benchmark", ok: retrieval.evidence.length > 0, detail: { question, evidence: retrieval.evidence.length, debug: retrieval.debug } });
      } catch (stepError) {
        results.push({ step: "benchmark", ok: false, detail: { question, error: stepError instanceof Error ? stepError.message : String(stepError) } });
      }
    }
  }

  return { personality: { id: input.personalityId, name: configuration.canonicalName }, plan, results };
}

type EpistemicRow = { epistemic_type: string | null; contract_status: string; contract_satisfied: boolean | null; type_review_status: string };
function epistemicState(value: EpistemicRow | EpistemicRow[] | null | undefined): ClaimEpistemicState | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) return null;
  return { type: (row.epistemic_type as EpistemicType | null) || null, status: row.contract_status as ContractStatus, satisfied: row.contract_satisfied,
    needsTypeReview: row.type_review_status === "needs_type_review" || row.type_review_status === "kept_unclassified" };
}

export async function loadPersonalityCoverage(personalityId: string, options: { scope?: MetricScope } = {}) {
  const scope = options.scope || "strict";
  const configuration = await loadPersonalityConfiguration(personalityId);
  const [parametersResult, claimsResult, chunkLinksResult, sourceLinksResult, eventsResult, relationshipsResult, cacheResult, accessResult] = await Promise.all([
    supabaseAdmin.from("parameters").select("id, code, name, parameter_fields(id, code, label)").eq("category_id", configuration.categoryId).order("sort_order"),
    supabaseAdmin.from("claims").select("id, parameter_field_id, review_status, evidence_type, certainty, approval_origin, approval_metadata, claim_sources(source_id), claim_chunks(chunk_id,relationship,confidence,link_method,metadata), claim_epistemics(epistemic_type,contract_status,contract_satisfied,type_review_status)").eq("personality_id", personalityId).limit(10_000),
    supabaseAdmin.from("chunk_personalities").select("chunk_id, source_chunks!inner(id, source_id, embedding_status, textual_layer, chunk_parameter_fields(parameter_field_id))").eq("personality_id", personalityId).eq("source_chunks.is_active", true).limit(10_000),
    supabaseAdmin.from("source_personalities").select("source_id, sources(id, url, title, author, source_type, textual_layer, content_hash, metadata)").eq("personality_id", personalityId).limit(10_000),
    supabaseAdmin.from("event_personalities").select("event_id, events!inner(review_status)").eq("personality_id", personalityId).limit(10_000),
    supabaseAdmin.from("relationships").select("id, review_status").or(`subject_personality_id.eq.${personalityId},object_personality_id.eq.${personalityId}`).limit(10_000),
    supabaseAdmin.from("live_research_cache").select("id, source_id, fetch_status").eq("fetch_status", "ready").limit(10_000),
    supabaseAdmin.from("approved_source_access").select("id, display_name, domain, scope_type, allowed_path_prefix, exact_url, include_subdomains, allow_live_search, allow_live_fetch, allow_ingestion, evidence_use_status, priority, default_textual_layer, default_source_type, cache_ttl_hours, is_active").eq("evidence_use_status", "approved").eq("is_active", true).eq("allow_live_fetch", true),
  ]);
  const failed = [parametersResult, claimsResult, chunkLinksResult, sourceLinksResult, eventsResult, relationshipsResult, cacheResult, accessResult].find((result) => result.error)?.error;
  if (failed) throw new CorpusError("DATABASE_FAILED", "Personality corpus coverage could not be calculated.", 500, { cause: failed });
  const sourceIds = new Set((sourceLinksResult.data || []).map((row) => row.source_id));
  const accessRules = (accessResult.data || []) as SourceAccessRule[];
  const approvedScopeIds = new Set<string>();
  for (const link of sourceLinksResult.data || []) {
    const source = Array.isArray(link.sources) ? link.sources[0] : link.sources;
    if (!source?.url) continue;
    const rule = selectSourceAuthorization(source.url, accessRules, "fetch", true);
    if (rule) approvedScopeIds.add(rule.id);
  }
  const coverage = computeCorpusCoverage({
    parameters: (parametersResult.data || []).map((parameter) => ({
      id: parameter.id,
      code: parameter.code,
      name: parameter.name,
      fields: parameter.parameter_fields || [],
    })),
    claims: (claimsResult.data || []).filter((claim) => inMetricScope(claim, scope)).map((claim) => ({
      id: claim.id,
      parameterFieldId: claim.parameter_field_id,
      approved: claim.review_status === "approved",
      epistemic: epistemicState(claim.claim_epistemics),
      contested: claim.evidence_type === "contested",
      hasChunkEvidence: (claim.claim_chunks || []).some(isExactSupportLink),
      hasStrongSupport: (claim.claim_chunks || []).some((link) => link.metadata?.supportLevel === "STRONG"),
      core: claim.certainty === "high",
      sourceIds: (claim.claim_sources || []).map((link) => link.source_id),
    })),
    chunks: (chunkLinksResult.data || []).flatMap((link) => {
      const chunk = Array.isArray(link.source_chunks) ? link.source_chunks[0] : link.source_chunks;
      return chunk ? [{
        id: chunk.id,
        sourceId: chunk.source_id,
        parameterFieldIds: (chunk.chunk_parameter_fields || []).map((field) => field.parameter_field_id),
        embedded: chunk.embedding_status === "ready",
        textualLayer: chunk.textual_layer,
      }] : [];
    }),
    sourceCount: sourceIds.size,
    events: new Set((eventsResult.data || []).map((row) => row.event_id)).size,
    relationships: (relationshipsResult.data || []).length,
    cachedPages: (cacheResult.data || []).filter((row) => row.source_id && sourceIds.has(row.source_id)).length,
    approvedSourceScopes: approvedScopeIds.size,
    sourceWorks: (sourceLinksResult.data || []).flatMap((link) => {
      const source = Array.isArray(link.sources) ? link.sources[0] : link.sources;
      if (!source) return [];
      const key = independentWorkKey(source);
      const kind = /primary|scripture|textual|veda|ramayana/i.test(`${source.source_type || ""} ${source.textual_layer || ""}`) ? "primary"
        : /scholar|journal|academic|article/i.test(source.source_type || "") ? "scholarly" : "other";
      return [{ id: source.id, independentKey: key, evidenceKind: kind as "primary" | "scholarly" | "other" }];
    }),
  });
  return { personality: { id: personalityId, name: configuration.canonicalName, categoryName: configuration.categoryName }, coverage, scope };
}
