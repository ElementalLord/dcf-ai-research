import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "./errors";
import { embedTexts } from "./embeddings";
import { dedupeEvidence, reciprocalRankFusion } from "./dedupe";
import { lexicalSearchExpression, routeParameterCodes } from "./routing";
import { logStage, stageTimer } from "./observability";
import { normalizeForMatch } from "./text";
import { rerankEvidence } from "./rerank";
import type { ParameterField, RetrievedClaim, RetrievedEvidence, RetrievedPassage, RetrievalDebug } from "./types";

type ParameterRow = {
  id: string;
  code: string;
  name: string;
  parameter_fields: Array<{ id: string; code: string; label: string }> | null;
};

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function questionTerms(question: string): Set<string> {
  const ignored = new Set([
    "the", "and", "that", "this", "with", "from", "what", "when", "where", "which", "were", "was",
    "are", "did", "does", "how", "who", "his", "her", "their", "about", "vishvamitra", "vishwamitra", "visvamitra",
  ]);
  const terms = normalizeForMatch(question).split(" ").filter((term) => term.length > 2 && !ignored.has(term));
  const references = (question.match(/\b\d+(?:\.\d+)+\b/g) || []).flatMap((reference) => reference.split("."));
  return new Set([...terms.flatMap((term) => (term.length > 4 && term.endsWith("s") ? [term, term.slice(0, -1)] : [term])), ...references]);
}

function isBroadProfileQuestion(question: string, terms: Set<string>): boolean {
  return terms.size === 0 || /\b(who is|known for|tell me about|overview|biograph|profile|introduce)\b/i.test(question);
}

export function diversifyBroadEvidence(evidence: RetrievedEvidence[], limit = 15): RetrievedEvidence[] {
  const selected: RetrievedEvidence[] = [];
  const passageCounts = new Map<string, number>();
  const claimCounts = new Map<string, number>();
  for (const item of evidence) {
    if (item.kind === "passage") {
      const count = passageCounts.get(item.sourceId) || 0;
      if (count >= 3) continue;
      passageCounts.set(item.sourceId, count + 1);
    } else {
      const group = item.parameterName || item.fieldLabel || "unclassified";
      const count = claimCounts.get(group) || 0;
      if (count >= 2) continue;
      claimCounts.set(group, count + 1);
    }
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function rankApprovedClaims(question: string, rows: Array<Record<string, unknown>>): RetrievedClaim[] {
  const terms = questionTerms(question);
  const broad = isBroadProfileQuestion(question, terms);
  const broadPriority: Record<string, number> = {
    role: 10,
    textual_contribution: 9,
    social_role: 8,
    historical_context: 7,
    parampara: 6,
    tapas_sadhana: 5,
    inner_qualities: 4,
    contested: 3,
    philosophy: 2,
    contemporary_relevance: 1,
  };
  const stem = (term: string) => term === "taught" ? "teach" : term.replace(/(ing|ers?|ed)$/i, "");
  const ranked = rows
    .map((row) => {
      const field = unwrap(row.parameter_fields as Record<string, unknown> | Array<Record<string, unknown>> | null);
      const parameter = unwrap(field?.parameters as Record<string, unknown> | Array<Record<string, unknown>> | null);
      const links = (row.claim_sources as Array<Record<string, unknown>> | null) || [];
      const link = links.find((candidate) => {
        const source = unwrap(candidate.sources as Record<string, unknown> | Array<Record<string, unknown>> | null);
        return source?.source_status !== "rejected";
      }) || links[0];
      const source = unwrap(link?.sources as Record<string, unknown> | Array<Record<string, unknown>> | null);
      const chunkLink = ((row.claim_chunks as Array<Record<string, unknown>> | null) || [])[0];
      const chunk = unwrap(chunkLink?.source_chunks as Record<string, unknown> | Array<Record<string, unknown>> | null);
      const searchable = normalizeForMatch(`${String(row.claim_text || "")} ${String(field?.label || "")} ${String(parameter?.name || "")}`);
      const tokens = new Set(searchable.split(" ").filter(Boolean));
      const termScore = [...terms].reduce((sum, term) => {
        const termStem = stem(term);
        const matches = [...tokens].some((token) => token === term || (termStem.length >= 4 && stem(token) === termStem));
        return sum + (matches ? 1 : 0);
      }, 0);
      const score = broad ? broadPriority[String(parameter?.code || "")] || 0 : termScore;
      return {
        score,
        group: String(parameter?.id || field?.id || "unclassified"),
        item: {
          kind: "claim" as const,
          id: `claim:${String(row.id)}`,
          claimId: String(row.id),
          text: String(row.claim_text),
          claimKind: String(row.claim_kind || "unknown"),
          certainty: String(row.certainty || "unknown"),
          parameterName: parameter?.name ? String(parameter.name) : null,
          fieldLabel: field?.label ? String(field.label) : null,
          sourceTitle: source?.title ? String(source.title) : null,
          sourceAuthor: source?.author ? String(source.author) : null,
          sourceInstitution: source?.publisher_or_institution ? String(source.publisher_or_institution) : null,
          sourceUrl: source?.url ? String(source.url) : null,
          pageOrSection: link?.page_or_section ? String(link.page_or_section) : null,
          evidenceExcerpt: link?.evidence_excerpt ? String(link.evidence_excerpt) : null,
          chunkId: chunk?.id ? String(chunk.id) : null,
          textualLayer: chunk?.textual_layer ? String(chunk.textual_layer) : null,
        },
      };
    })
    .sort((a, b) => b.score - a.score);
  if (broad) {
    const selected: RetrievedClaim[] = [];
    const usedGroups = new Set<string>();
    for (const candidate of ranked) {
      if (!usedGroups.has(candidate.group)) {
        selected.push(candidate.item);
        usedGroups.add(candidate.group);
      }
      if (selected.length >= 12) return selected;
    }
    for (const candidate of ranked) {
      if (!selected.some((item) => item.claimId === candidate.item.claimId)) selected.push(candidate.item);
      if (selected.length >= 12) break;
    }
    return selected;
  }
  const maximumScore = ranked[0]?.score || 0;
  const minimumScore = maximumScore >= 1 ? 1 : Number.POSITIVE_INFINITY;
  return ranked
    .filter(({ score }) => score >= minimumScore)
    .slice(0, 24)
    .map(({ item }) => item);
}

function passageFromRpc(row: Record<string, unknown>, kind: "lexical" | "semantic"): RetrievedPassage {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  return {
    kind: "passage",
    id: `passage:${String(row.chunk_id)}`,
    chunkId: String(row.chunk_id),
    sourceId: String(row.source_id),
    text: String(row.chunk_text),
    sectionTitle: row.section_title ? String(row.section_title) : null,
    pageOrSection: row.page_or_section ? String(row.page_or_section) : null,
    textualLayer: row.textual_layer ? String(row.textual_layer) : null,
    sourceTitle: String(row.source_title),
    sourceAuthor: row.source_author ? String(row.source_author) : null,
    sourceInstitution: row.source_institution ? String(row.source_institution) : null,
    sourceUrl: row.source_url ? String(row.source_url) : null,
    sourceType: row.source_type ? String(row.source_type) : null,
    sourceStatus: String(row.source_status),
    origin: metadata.origin === "live_cache" ? "live_cache" : "permanent",
    retrievedAt: metadata.retrievedAt ? String(metadata.retrievedAt) : null,
    cacheExpiresAt: metadata.cacheExpiresAt ? String(metadata.cacheExpiresAt) : null,
    lexicalScore: kind === "lexical" ? Number(row.lexical_score) : undefined,
    semanticScore: kind === "semantic" ? Number(row.semantic_score) : undefined,
  };
}

export async function retrieveEvidence(question: string, personalityId: string): Promise<{
  personality: string;
  parameters: Array<{ code: string; name: string }>;
  parameterFieldIds: string[];
  evidence: RetrievedEvidence[];
  debug: RetrievalDebug;
}> {
  const latenciesMs: Record<string, number> = {};
  const stopRoute = stageTimer("ROUTING");
  const { data: personality, error: personalityError } = await supabaseAdmin
    .from("personalities")
    .select("id, canonical_name, personality_categories(is_primary, category_id)")
    .eq("id", personalityId)
    .single();
  if (personalityError) throw new CorpusError("RETRIEVAL_FAILED", "The selected personality could not be loaded.", 404, { cause: personalityError });
  const memberships = (personality.personality_categories || []) as Array<{ is_primary: boolean; category_id: string }>;
  const categoryId = memberships.find((membership) => membership.is_primary)?.category_id || memberships[0]?.category_id;
  if (!categoryId) throw new CorpusError("RETRIEVAL_FAILED", "The personality has no research category.", 422);
  const { data: parameterData, error: parameterError } = await supabaseAdmin
    .from("parameters")
    .select("id, code, name, parameter_fields(id, code, label)")
    .eq("category_id", categoryId)
    .order("sort_order");
  if (parameterError) throw new CorpusError("RETRIEVAL_FAILED", "The research framework could not be loaded.", 500, { cause: parameterError });
  const parameters = (parameterData || []) as ParameterRow[];
  const broadQuestion = isBroadProfileQuestion(question, questionTerms(question));
  const localCodes = routeParameterCodes(question, parameters.map((parameter) => parameter.code));
  const selectedCodes = [...new Set(localCodes)].slice(0, 4);
  const selectedParameters = selectedCodes.length > 0 ? parameters.filter((parameter) => selectedCodes.includes(parameter.code)) : [];
  const fields: ParameterField[] = selectedParameters.flatMap((parameter) =>
    (parameter.parameter_fields || []).map((field) => ({
      id: field.id,
      code: field.code,
      label: field.label,
      parameterId: parameter.id,
      parameterCode: parameter.code,
      parameterName: parameter.name,
    })),
  );
  latenciesMs.routing = stopRoute();
  logStage("ROUTING", { parameters: selectedParameters.length, ms: latenciesMs.routing });

  const searchExpression = lexicalSearchExpression(question);
  // Expert fields guide routing and live tagging, but must not become hard knowledge boundaries.
  // Lexical/vector relevance remains bounded by personality, scores, and result limits.
  const stopLexical = stageTimer("LEXICAL_SEARCH");
  const lexicalPromise = searchExpression
    ? supabaseAdmin.rpc("search_source_chunks_lexical", {
        query_text: searchExpression,
        personality_uuid: personalityId,
        parameter_field_uuids: null,
        textual_layers: null,
        max_results: 30,
      })
    : Promise.resolve({ data: [], error: null });
  const claimsPromise = supabaseAdmin
    .from("claims")
    .select(`
      id, claim_text, claim_kind, certainty, review_status,
      parameter_fields(id, code, label, parameters(id, code, name)),
      claim_sources(relationship, evidence_excerpt, page_or_section,
        sources(id, title, author, publisher_or_institution, source_type, url, citation, source_status)),
      claim_chunks(relationship, source_chunks(id, textual_layer))
    `, { count: "exact" })
    .eq("personality_id", personalityId)
    .eq("review_status", "approved")
    .limit(500);
  const inventoryPromise = supabaseAdmin.rpc("get_retrieval_inventory", { personality_uuid: personalityId });
  const liveSourceCountPromise = supabaseAdmin
    .from("approved_source_access")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("allow_live_fetch", true)
    .eq("evidence_use_status", "approved");

  const embeddingStarted = performance.now();
  const embeddingTask = Promise.race([
    embedTexts([question])
      .then((vectors) => ({ vector: vectors[0] || null, reason: null as string | null }))
      .catch((error: unknown) => ({ vector: null, reason: `query_embedding_failed: ${error instanceof Error ? error.message : "Embedding unavailable."}` })),
    new Promise<{ vector: null; reason: string }>((resolve) => {
      setTimeout(() => resolve({ vector: null, reason: "query_embedding_timeout" }), 4_000);
    }),
  ]);

  const [lexicalResult, claimsResult, inventoryResult, liveSourceCountResult] = await Promise.all([
    lexicalPromise, claimsPromise, inventoryPromise, liveSourceCountPromise,
  ]);
  latenciesMs.lexical = stopLexical();
  const lexicalError = lexicalResult.error?.message || null;
  const claimRetrievalError = claimsResult.error?.message || null;
  if (inventoryResult.error) console.warn("Retrieval inventory unavailable:", inventoryResult.error.message);
  if (liveSourceCountResult.error) console.warn("Approved-source count unavailable:", liveSourceCountResult.error.message);
  const isFresh = (item: RetrievedPassage) => item.origin !== "live_cache" || !item.cacheExpiresAt || new Date(item.cacheExpiresAt) > new Date();
  const lexical = ((lexicalError ? [] : lexicalResult.data || []) as Array<Record<string, unknown>>).map((row) => passageFromRpc(row, "lexical")).filter(isFresh);
  const approvedClaimRows = (claimRetrievalError ? [] : claimsResult.data || []) as Array<Record<string, unknown>>;
  const claims = rankApprovedClaims(question, approvedClaimRows);
  const inventory = inventoryResult.data && typeof inventoryResult.data === "object"
    ? inventoryResult.data as Record<string, unknown>
    : {};
  const embeddingCount = Number(inventory.approvedEmbeddingCountForPersonality || inventory.embeddingCountForPersonality || 0);
  let semanticFallbackReason: string | null = null;
  let semanticError: string | null = null;
  let semantic: RetrievedPassage[] = [];
  const shouldUseSemantic = claims.length + lexical.length < 2;
  if (embeddingCount === 0) {
    semanticFallbackReason = "no_embeddings_available";
    semanticError = "No approved Vishvamitra chunks currently have embeddings.";
  } else if (!shouldUseSemantic) {
    semanticFallbackReason = "semantic_skipped_sufficient_lexical_claim_candidates";
  } else {
    const embedding = await embeddingTask;
    semanticFallbackReason = embedding.reason;
    if (embedding.vector) {
      const vectorResult = await supabaseAdmin.rpc("search_source_chunks_vector", {
        query_embedding: embedding.vector,
        personality_uuid: personalityId,
        parameter_field_uuids: null,
        textual_layers: null,
        max_results: 30,
        min_similarity: 0.25,
      });
      semanticError = vectorResult.error?.message || null;
      if (vectorResult.error) semanticFallbackReason = `vector_rpc_failed: ${vectorResult.error.message}`;
      semantic = ((semanticError ? [] : vectorResult.data || []) as Array<Record<string, unknown>>).map((row) => passageFromRpc(row, "semantic")).filter(isFresh);
    }
  }
  latenciesMs.semantic = Math.round(performance.now() - embeddingStarted);
  if (lexical.length === 0 && claims.length === 0) semantic = semantic.filter((item) => (item.semanticScore || 0) >= 0.52);
  else semantic = semantic.filter((item) => (item.semanticScore || 0) >= 0.32);
  logStage("LEXICAL_SEARCH", { results: lexical.length, ms: latenciesMs.lexical });
  logStage("VECTOR_SEARCH", { results: semantic.length, ms: latenciesMs.semantic, fallback: Boolean(semanticFallbackReason) });

  const stopMerge = stageTimer("MERGE");
  const merged = dedupeEvidence(reciprocalRankFusion([claims, lexical, semantic]));
  latenciesMs.merge = stopMerge();
  logStage("MERGE", { unique: merged.length, ms: latenciesMs.merge });
  const stopRerank = stageTimer("RERANK");
  const rerankedCandidates = await rerankEvidence(question, merged, broadQuestion ? 24 : 16);
  const reranked = broadQuestion ? diversifyBroadEvidence(rerankedCandidates, 15) : rerankedCandidates;
  latenciesMs.rerank = stopRerank();
  logStage("RERANK", { selected: reranked.length, ms: latenciesMs.rerank });

  return {
    personality: personality.canonical_name,
    parameters: selectedParameters.map((parameter) => ({ code: parameter.code, name: parameter.name })),
    parameterFieldIds: fields.map((field) => field.id),
    evidence: reranked,
    debug: {
      executionMode: "FAST",
      routingStrategy: selectedCodes.length > 0 ? "deterministic" : "broad",
      selectedPersonality: personality.canonical_name,
      selectedParameters: selectedParameters.map((parameter) => ({ code: parameter.code, name: parameter.name })),
      lexicalResults: lexical.length,
      semanticResults: semantic.length,
      approvedClaimResults: claims.length,
      totalApprovedClaimsForPersonality: claimsResult.count || approvedClaimRows.length,
      approvedClaimsBeforeParameterFilter: claimsResult.count || approvedClaimRows.length,
      approvedClaimsAfterParameterFilter: claimsResult.count || approvedClaimRows.length,
      totalChunksForPersonality: Number(inventory.totalChunksForPersonality || 0),
      chunksBeforeParameterFilter: Number(inventory.approvedSourceChunksForPersonality || 0),
      chunksAfterParameterFilter: Number(inventory.approvedSourceChunksForPersonality || 0),
      embeddingCountForPersonality: embeddingCount,
      approvedLiveSourceCount: liveSourceCountResult.count || 0,
      cacheResults: [...lexical, ...semantic].filter((item) => item.origin === "live_cache").length,
      localEvidenceSufficient: false,
      liveResearchTriggered: false,
      approvedSourcesConsidered: [],
      liveUrlsAccepted: [],
      liveUrlsRejected: [],
      liveFetches: 0,
      cacheHits: 0,
      liveResearchSkipReason: null,
      lexicalError,
      semanticError,
      claimRetrievalError,
      mergedCandidates: merged.length,
      rerankedEvidence: reranked.map((item) => item.id),
      finalSelectedEvidenceCount: reranked.length,
      semanticFallbackReason,
      latenciesMs,
    },
  };
}
