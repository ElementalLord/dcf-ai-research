import type { PersonalityConfiguration } from "@/lib/corpus/personality-config";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "./errors";
import { selectSourceAuthorization, type SourceAccessRule } from "@/lib/live-research/source-policy";
import { classifyProviderError } from "./provider-health";
import { embedTexts } from "./embeddings";
import { dedupeEvidence, reciprocalRankFusion } from "./dedupe";
import { isBroadSynthesisQuestion, lexicalSearchExpression, routeParameterCodes } from "./routing";
import { logStage, stageTimer } from "./observability";
import { normalizeForMatch } from "./text";
import { rerankEvidence, selectBroadEvidence } from "./rerank";
import { classifyQuestionScope } from "@/lib/ask/question-scope";
import type { ParameterField, RetrievedClaim, RetrievedEvidence, RetrievedPassage, RetrievalDebug } from "./types";
import { evidencePolicyMode, eligibleClaimOrigins } from "./approval-policy";
import { loadPersonalityConfiguration } from "./personality-context";
import { canonicalizeTerms, normalizedAliases, type TermAliasRecord } from "./personality-config";

type ParameterRow = {
  id: string;
  code: string;
  name: string;
  routing_hints: string[] | null;
  parameter_fields: Array<{ id: string; code: string; label: string }> | null;
};

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function questionTerms(question: string, personalityAliases: string[] = [], termAliases: TermAliasRecord[] = []): Set<string> {
  const ignored = new Set([
    "the", "and", "that", "this", "with", "from", "what", "when", "where", "which", "were", "was",
    "are", "did", "does", "how", "who", "his", "her", "their", "about",
  ]);
  for (const alias of personalityAliases) {
    for (const token of normalizeForMatch(alias).split(" ")) ignored.add(token);
  }
  const terms = canonicalizeTerms(question, termAliases).split(" ").filter((term) => term.length > 2 && !ignored.has(term));
  const references = (question.match(/\b\d+(?:\.\d+)+\b/g) || []).flatMap((reference) => reference.split("."));
  return new Set([...terms.flatMap((term) => (term.length > 4 && term.endsWith("s") ? [term, term.slice(0, -1)] : [term])), ...references]);
}

function isBroadProfileQuestion(question: string, terms: Set<string>): boolean {
  return terms.size === 0 || isBroadSynthesisQuestion(question);
}

function broadClaimQuality(text: string, sourceTitle: string, sourceType: string, hasPassage: boolean, personality: string): number {
  let score = 0;
  if (hasPassage) score += 8;
  if (/primary|institution|scholar|academic|critical/i.test(sourceType)) score += 4;
  if (personality && normalizeForMatch(text).includes(normalizeForMatch(personality))) score += 3;
  if (text.length >= 80 && text.length <= 650) score += 2;
  if (/parameters to study|research framework/i.test(sourceTitle)) score -= 35;
  if (/current source set|current corpus|research framework|should be stored|does not justify|metadata rather than|not safely subsumed/i.test(text)) score -= 18;
  return score;
}

export function shouldUseSemanticRetrieval(claimCount: number, lexicalCount: number): boolean {
  return claimCount + lexicalCount < 2;
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

export function rankApprovedClaims(
  question: string,
  rows: Array<Record<string, unknown>>,
  options: { personalityAliases?: string[]; termAliases?: TermAliasRecord[]; personalityId?: string; personalityName?: string } = {},
): RetrievedClaim[] {
  const terms = questionTerms(question, options.personalityAliases, options.termAliases);
  const broad = isBroadProfileQuestion(question, terms);
  const stem = (term: string) => term === "taught" ? "teach" : term === "took" ? "take" : term.replace(/(ing|ers?|ed)$/i, "").replace(/(?<=.{4})s$/, "");
  const ranked = rows
    .filter((row) => {
      const links = (row.claim_sources as Array<Record<string, unknown>> | null) || [];
      return !links.length || links.some((link) => unwrap<Record<string, unknown>>(link.sources as Record<string, unknown> | null)?.source_status === "approved");
    })
    .map((row) => {
      const field = unwrap(row.parameter_fields as Record<string, unknown> | Array<Record<string, unknown>> | null);
      const parameter = unwrap(field?.parameters as Record<string, unknown> | Array<Record<string, unknown>> | null);
      const links = (row.claim_sources as Array<Record<string, unknown>> | null) || [];
      const link = links.find((candidate) => {
        const source = unwrap(candidate.sources as Record<string, unknown> | Array<Record<string, unknown>> | null);
        return source?.source_status === "approved";
      }) || links[0];
      const source = unwrap(link?.sources as Record<string, unknown> | Array<Record<string, unknown>> | null);
      const chunkLink = ((row.claim_chunks as Array<Record<string, unknown>> | null) || [])[0];
      const chunk = unwrap(chunkLink?.source_chunks as Record<string, unknown> | Array<Record<string, unknown>> | null);
      // Persisted epistemics (computed in corpus processing, never per request).
      const epistemics = unwrap(row.claim_epistemics as Record<string, unknown> | Array<Record<string, unknown>> | null);
      const searchable = normalizeForMatch(`${String(row.claim_text || "")} ${String(field?.label || "")} ${String(parameter?.name || "")}`);
      const tokens = new Set(searchable.split(" ").filter(Boolean));
      const termScore = [...terms].reduce((sum, term) => {
        const termStem = stem(term);
        const matches = [...tokens].some((token) => token === term || (termStem.length >= 4 && stem(token) === termStem));
        return sum + (matches ? 1 : 0);
      }, 0);
      const parameterSortOrder = Number(parameter?.sort_order);
      const score = broad
        ? (Number.isFinite(parameterSortOrder) ? 1_000 - parameterSortOrder : 0)
          + broadClaimQuality(String(row.claim_text || ""), String(source?.title || ""), String(source?.source_type || ""), Boolean(chunk?.id), options.personalityName || "") / 100
        : termScore;
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
          approvalOrigin: String(row.approval_origin || "imported_existing"),
          evidenceType: String(row.evidence_type || "uncertain"),
          epistemicType: epistemics?.epistemic_type ? String(epistemics.epistemic_type) : null,
          contractStatus: epistemics?.contract_status ? String(epistemics.contract_status) : null,
          provenanceSignature: JSON.stringify({ reviewStatus: row.review_status, sources: links.map((candidate) => candidate.sources), support: row.claim_chunks }),
          personalityId: options.personalityId,
          personalityName: options.personalityName,
          parameterName: parameter?.name ? String(parameter.name) : null,
          parameterCode: parameter?.code ? String(parameter.code) : null,
          fieldLabel: field?.label ? String(field.label) : null,
          sourceTitle: source?.title ? String(source.title) : null,
          sourceAuthor: source?.author ? String(source.author) : null,
          sourceInstitution: source?.publisher_or_institution ? String(source.publisher_or_institution) : null,
          sourceUrl: source?.url ? String(source.url) : null,
          sourceType: source?.source_type ? String(source.source_type) : null,
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
      if (selected.length >= 16) return selected;
    }
    for (const candidate of ranked) {
      if (!selected.some((item) => item.claimId === candidate.item.claimId)) selected.push(candidate.item);
      if (selected.length >= 32) break;
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

function passageFromRpc(row: Record<string, unknown>, kind: "lexical" | "semantic", personalityId: string, personalityName: string): RetrievedPassage {
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
    personalityId,
    personalityName,
    origin: metadata.origin === "live_cache" ? "live_cache" : "permanent",
    retrievedAt: metadata.retrievedAt ? String(metadata.retrievedAt) : null,
    cacheExpiresAt: metadata.cacheExpiresAt ? String(metadata.cacheExpiresAt) : null,
    lexicalScore: kind === "lexical" ? Number(row.lexical_score) : undefined,
    semanticScore: kind === "semantic" ? Number(row.semantic_score) : undefined,
  };
}

export async function retrieveEvidence(
  question: string,
  personalityId: string,
  options: { additionalPersonalityAliases?: string[]; configuration?: PersonalityConfiguration } = {},
): Promise<{
  personality: string;
  personalityId: string;
  personalityAliases: string[];
  termAliases: TermAliasRecord[];
  parameters: Array<{ code: string; name: string }>;
  allParameters: Array<{ code: string; name: string }>;
  parameterFieldIds: string[];
  evidence: RetrievedEvidence[];
  debug: RetrievalDebug;
}> {
  const latenciesMs: Record<string, number> = {};
  const stopRoute = stageTimer("ROUTING");
  const configuration = options.configuration || await loadPersonalityConfiguration(personalityId);
  const aliases = [...new Set([
    ...normalizedAliases(configuration.canonicalName, configuration.aliases),
    ...(options.additionalPersonalityAliases || []).map(normalizeForMatch).filter(Boolean),
  ])];
  const policyMode = evidencePolicyMode();
  const { data: parameterData, error: parameterError } = await supabaseAdmin
    .from("parameters")
    .select("id, code, name, routing_hints, parameter_fields(id, code, label)")
    .eq("category_id", configuration.categoryId)
    .order("sort_order");
  if (parameterError) throw new CorpusError("RETRIEVAL_FAILED", "The research framework could not be loaded.", 500, { cause: parameterError });
  const parameters = (parameterData || []) as ParameterRow[];
  const broadQuestion = isBroadProfileQuestion(question, questionTerms(question, aliases, configuration.termAliases));
  const localCodes = broadQuestion
    ? []
    : routeParameterCodes(question, parameters.map((parameter) => ({ code: parameter.code, routingHints: parameter.routing_hints })));
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

  const searchExpression = lexicalSearchExpression(question, aliases, configuration.termAliases);
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
  const broadLexicalPromise = broadQuestion
    ? Promise.all(parameters.filter((parameter) => (parameter.parameter_fields || []).length > 0).slice(0, 16).map(async (parameter) => {
        const generic = new Set(["role", "person", "figure", "research", "source", "text", "known", "when", "king", "sage", "rishi"]);
        const hints = (parameter.routing_hints || []).map(normalizeForMatch)
          .filter((hint) => hint.length >= 4 && !generic.has(hint) && !hint.includes(" ")).slice(0, 6);
        const query = hints.length ? hints.join(" OR ") : aliases.slice(0, 2).join(" OR ");
        const result = await supabaseAdmin.rpc("search_source_chunks_lexical", {
          query_text: query,
          personality_uuid: personalityId,
          parameter_field_uuids: (parameter.parameter_fields || []).map((field) => field.id),
          textual_layers: null,
          max_results: 4,
        });
        return { parameter, result };
      }))
    : Promise.resolve([]);
  const claimsPromise = supabaseAdmin
    .from("claims")
    .select(`
      id, claim_text, claim_kind, certainty, review_status, approval_origin, evidence_type,
      parameter_fields(id, code, label, parameters(id, code, name, sort_order)),
      claim_sources(relationship, evidence_excerpt, page_or_section,
        sources(id, title, author, publisher_or_institution, source_type, url, citation, source_status)),
      claim_chunks(relationship, source_chunks(id, textual_layer)),
      claim_epistemics(epistemic_type, contract_status)
    `, { count: "exact" })
    .eq("personality_id", personalityId)
    .eq("review_status", "approved")
    .in("approval_origin", eligibleClaimOrigins(policyMode))
    .limit(500);
  const chunkSelection = "id,source_id,chunk_text,section_title,page_or_section,textual_layer,is_active,metadata,sources(id,title,author,publisher_or_institution,url,source_type,source_status)";
  const eventsPromise = supabaseAdmin.from("events")
    .select(`id,title,summary,event_personalities!inner(personality_id),event_chunks(source_chunks(${chunkSelection}))`)
    .eq("review_status", "approved").eq("event_personalities.personality_id", personalityId).limit(40);
  const relationshipsPromise = supabaseAdmin.from("relationships")
    .select(`id,object_name,relationship_type,description,relationship_chunks(source_chunks(${chunkSelection}))`)
    .eq("review_status", "approved").or(`subject_personality_id.eq.${personalityId},object_personality_id.eq.${personalityId}`).limit(40);
  const inventoryPromise = supabaseAdmin.rpc("get_retrieval_inventory", { personality_uuid: personalityId });
  const liveSourceCountPromise = supabaseAdmin
    .from("approved_source_access")
    .select("id,display_name,domain,scope_type,allowed_path_prefix,exact_url,include_subdomains,allow_live_search,allow_live_fetch,allow_ingestion,evidence_use_status,priority,default_textual_layer,default_source_type,cache_ttl_hours,is_active", { count: "exact" })
    .eq("is_active", true)
    .eq("allow_live_fetch", true)
    .eq("evidence_use_status", "approved");

  const timed = async <T>(name: string, query: PromiseLike<T>): Promise<T> => {
    const start = performance.now();
    try { return await query; } finally { latenciesMs[name] = Math.round(performance.now() - start); }
  };
  const [lexicalResult, broadLexicalResults, claimsResult, inventoryResult, liveSourceCountResult, eventsResult, relationshipsResult] = await Promise.all([
    timed<{ data: unknown; error: { message: string } | null }>("lexical", lexicalPromise), timed("broadLexical", broadLexicalPromise), timed("claims", claimsPromise), timed("inventory", inventoryPromise), timed("sourceRegistry", liveSourceCountPromise), timed("events", eventsPromise), timed("relationships", relationshipsPromise),
  ]);
  stopLexical();
  const lexicalError = lexicalResult.error?.message || null;
  const claimRetrievalError = claimsResult.error?.message || null;
  if (inventoryResult.error) console.warn("Retrieval inventory unavailable:", inventoryResult.error.message);
  if (liveSourceCountResult.error) console.warn("Approved-source count unavailable:", liveSourceCountResult.error.message);
  const approvedLiveRules = (liveSourceCountResult.error ? [] : liveSourceCountResult.data || []) as SourceAccessRule[];
  const isFresh = (item: RetrievedPassage) => {
    if (item.origin !== "live_cache") return true;
    if (item.cacheExpiresAt && new Date(item.cacheExpiresAt) <= new Date()) return false;
    if (!item.sourceUrl) return false;
    try { return Boolean(selectSourceAuthorization(item.sourceUrl, approvedLiveRules, "fetch", true)); }
    catch { return false; }
  };
  const lexical = [
    ...((lexicalError ? [] : lexicalResult.data || []) as Array<Record<string, unknown>>).map((row) => passageFromRpc(row, "lexical", personalityId, configuration.canonicalName)),
    ...broadLexicalResults.flatMap(({ parameter, result }) => result.error ? [] : ((result.data || []) as Array<Record<string, unknown>>).map((row) => ({
      ...passageFromRpc(row, "lexical", personalityId, configuration.canonicalName),
      parameterCodes: [parameter.code], parameterNames: [parameter.name],
    }))),
  ].filter(isFresh);
  const approvedClaimRows = (claimRetrievalError ? [] : claimsResult.data || []) as Array<Record<string, unknown>>;
  const claims = rankApprovedClaims(question, approvedClaimRows, { personalityAliases: aliases, termAliases: configuration.termAliases, personalityId, personalityName: configuration.canonicalName });
  const inventory = inventoryResult.data && typeof inventoryResult.data === "object"
    ? inventoryResult.data as Record<string, unknown>
    : {};
  const embeddingCount = Number(inventory.approvedEmbeddingCountForPersonality || inventory.embeddingCountForPersonality || 0);
  let semanticFallbackReason: string | null = null;
  let semanticError: string | null = null;
  let semantic: RetrievedPassage[] = [];
  let queryEmbeddingRequested = false;
  const shouldUseSemantic = shouldUseSemanticRetrieval(claims.length, lexical.length);
  if (embeddingCount === 0) {
    semanticFallbackReason = "no_embeddings_available";
    semanticError = `No approved ${configuration.canonicalName} chunks currently have embeddings.`;
  } else if (!shouldUseSemantic) {
    semanticFallbackReason = "semantic_skipped_sufficient_lexical_claim_candidates";
  } else {
    queryEmbeddingRequested = true;
    const embeddingStarted = performance.now();
    const embedding = await embedTexts([question])
      .then((vectors) => ({ vector: vectors[0] || null, reason: null as string | null }))
      .catch((error: unknown) => ({ vector: null, reason: `query_embedding_failed: ${classifyProviderError(error)}` }));
    latenciesMs.semantic = Math.round(performance.now() - embeddingStarted);
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
      semantic = ((semanticError ? [] : vectorResult.data || []) as Array<Record<string, unknown>>).map((row) => passageFromRpc(row, "semantic", personalityId, configuration.canonicalName)).filter(isFresh);
    }
  }
  latenciesMs.semantic ??= 0;
  if (lexical.length === 0 && claims.length === 0) semantic = semantic.filter((item) => (item.semanticScore || 0) >= 0.52);
  else semantic = semantic.filter((item) => (item.semanticScore || 0) >= 0.32);
  logStage("LEXICAL_SEARCH", { results: lexical.length, ms: latenciesMs.lexical });
  logStage("VECTOR_SEARCH", { results: semantic.length, ms: latenciesMs.semantic, fallback: Boolean(semanticFallbackReason) });

  // Approved structured records contribute only their active approved source passages.
  // Unreviewed event/relationship descriptions never become answer evidence.
  const structuredPassages: RetrievedPassage[] = [];
  for (const [result, linkName] of [[eventsResult, "event_chunks"], [relationshipsResult, "relationship_chunks"]] as const) {
    if (result.error) continue;
    for (const record of (result.data || []) as unknown as Array<Record<string, unknown>>) {
      const links = record[linkName] as Array<Record<string, unknown>> || [];
      for (const link of links) {
        const chunk = unwrap<Record<string, unknown>>(link.source_chunks as Record<string, unknown> | null);
        const source = unwrap<Record<string, unknown>>(chunk?.sources as Record<string, unknown> | null);
        if (!chunk?.is_active || source?.source_status !== "approved") continue;
        const text = String(chunk.chunk_text || "");
        const terms = questionTerms(question, aliases, configuration.termAliases);
        if (!broadQuestion && ![...terms].some((term) => normalizeForMatch(text).split(" ").includes(term))) continue;
        const passage = passageFromRpc({
          ...chunk, chunk_id: chunk.id, source_title: source.title, source_author: source.author,
          source_institution: source.publisher_or_institution, source_url: source.url,
          source_type: source.source_type, source_status: source.source_status, lexical_score: 1,
        }, "lexical", personalityId, configuration.canonicalName);
        if (isFresh(passage)) structuredPassages.push(passage);
      }
    }
  }
  const stopMerge = stageTimer("MERGE");
  const merged = dedupeEvidence(reciprocalRankFusion([claims, lexical, semantic, structuredPassages]));
  latenciesMs.merge = stopMerge();
  logStage("MERGE", { unique: merged.length, ms: latenciesMs.merge });
  const stopRerank = stageTimer("RERANK");
  const reranked = broadQuestion
    ? selectBroadEvidence(merged, 20, aliases)
    : await rerankEvidence(question, merged, 16, { personalityAliases: aliases, termAliases: configuration.termAliases });
  latenciesMs.rerank = stopRerank();
  logStage("RERANK", { selected: reranked.length, ms: latenciesMs.rerank });

  return {
    personality: configuration.canonicalName,
    personalityId,
    personalityAliases: aliases,
    termAliases: configuration.termAliases,
    parameters: selectedParameters.map((parameter) => ({ code: parameter.code, name: parameter.name })),
    allParameters: parameters.map((parameter) => ({ code: parameter.code, name: parameter.name })),
    parameterFieldIds: fields.map((field) => field.id),
    evidence: reranked,
    debug: {
      questionScope: classifyQuestionScope(question),
      parametersRepresented: [...new Set(reranked.flatMap((item) => item.kind === "claim" ? [item.parameterCode].filter((code): code is string => Boolean(code)) : item.parameterCodes || []))],
      retrievedClaimCount: reranked.filter((item) => item.kind === "claim").length,
      retrievedChunkCount: reranked.filter((item) => item.kind === "passage").length,
      sourcesRepresented: [...new Set(reranked.map((item) => item.sourceTitle).filter(Boolean))] as string[],
      sourceTypesRepresented: [...new Set(reranked.map((item) => item.sourceType).filter(Boolean))] as string[],
      evidenceTypesRepresented: [...new Set(reranked.map((item) => item.kind === "claim" ? item.evidenceType : "source_passage"))],
      braveTriggered: false,
      braveQueries: [],
      newSourcesFetched: 0,
      geminiCalls: 0,
      executionMode: "FAST",
      routingStrategy: selectedCodes.length > 0 ? "deterministic" : "broad",
      selectedPersonality: configuration.canonicalName,
      selectedPersonalityId: personalityId,
      selectedPersonalities: [{ id: personalityId, name: configuration.canonicalName }],
      evidencePolicyMode: policyMode,
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
      webSearchProvider: "brave",
      webSearchConfigured: Boolean(process.env.BRAVE_SEARCH_API_KEY),
      webSearchCalls: 0,
      webSearchCacheHits: 0,
      webSearchLatencyMs: 0,
      candidateResults: 0,
      policyAcceptedResults: 0,
      policyRejectedResults: 0,
      pagesFetched: 0,
      pagesCacheHits: 0,
      chunksAdded: 0,
      webSearchErrorCategory: null,
      liveResearchSkipReason: null,
      lexicalError,
      semanticError,
      claimRetrievalError,
      mergedCandidates: merged.length,
      rerankedEvidence: reranked.map((item) => item.id),
      finalSelectedEvidenceCount: reranked.length,
      semanticFallbackReason,
      queryEmbeddingRequested,
      latenciesMs,
    },
  };
}
