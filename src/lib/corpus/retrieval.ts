import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "./errors";
import { embedTexts } from "./embeddings";
import { generateText } from "./gemini";
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

async function aiRoute(question: string, personality: string, parameters: ParameterRow[]): Promise<string[]> {
  const prompt = `Route a question to an existing research framework. Return parameter codes only, one per line, at most 4. Do not explain.
PERSONALITY: ${personality}
QUESTION: ${question}
PARAMETERS:\n${parameters.map((parameter) => `${parameter.code} | ${parameter.name}`).join("\n")}`;
  try {
    const { text } = await generateText(prompt, { timeoutMs: 12_000, errorCode: "RETRIEVAL_FAILED" });
    const valid = new Set(parameters.map((parameter) => parameter.code));
    return text
      .split(/\n|,/)
      .map((code) => code.trim().replace(/^[-*•\d.\s]+/, "").replace(/[`"'[\]]/g, ""))
      .filter((code) => valid.has(code))
      .slice(0, 4);
  } catch {
    return [];
  }
}

function questionTerms(question: string): Set<string> {
  const ignored = new Set([
    "the", "and", "that", "this", "with", "from", "what", "when", "where", "which", "were", "was",
    "are", "did", "does", "how", "his", "her", "their", "about", "vishvamitra", "vishwamitra", "visvamitra",
  ]);
  const terms = normalizeForMatch(question).split(" ").filter((term) => term.length > 2 && !ignored.has(term));
  return new Set(terms.flatMap((term) => (term.length > 4 && term.endsWith("s") ? [term, term.slice(0, -1)] : [term])));
}

function rankApprovedClaims(question: string, rows: Array<Record<string, unknown>>): RetrievedClaim[] {
  const terms = questionTerms(question);
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
      const score = [...terms].reduce((sum, term) => sum + (searchable.includes(term) ? 1 : 0), 0);
      return {
        score,
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
  const maximumScore = ranked[0]?.score || 0;
  const minimumScore = maximumScore >= 2 ? 2 : 1;
  return ranked
    .filter(({ score }) => score >= minimumScore)
    .slice(0, 24)
    .map(({ item }) => item);
}

function passageFromRpc(row: Record<string, unknown>, kind: "lexical" | "semantic"): RetrievedPassage {
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
    lexicalScore: kind === "lexical" ? Number(row.lexical_score) : undefined,
    semanticScore: kind === "semantic" ? Number(row.semantic_score) : undefined,
  };
}

export async function retrieveEvidence(question: string, personalityId: string): Promise<{
  personality: string;
  parameters: Array<{ code: string; name: string }>;
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
  const localCodes = routeParameterCodes(question, parameters.map((parameter) => parameter.code));
  const modelCodes = localCodes.length > 0
    ? []
    : await aiRoute(question, personality.canonical_name, parameters);
  const selectedCodes = [...new Set([...localCodes, ...modelCodes])].slice(0, 4);
  const selectedParameters = selectedCodes.length > 0 ? parameters.filter((parameter) => selectedCodes.includes(parameter.code)) : parameters;
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
  const fieldIds = selectedCodes.length > 0 ? fields.map((field) => field.id) : null;
  const stopLexical = stageTimer("LEXICAL_SEARCH");
  const lexicalPromise = searchExpression
    ? supabaseAdmin.rpc("search_source_chunks_lexical", {
        query_text: searchExpression,
        personality_uuid: personalityId,
        parameter_field_uuids: fieldIds,
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
    `)
    .eq("personality_id", personalityId)
    .eq("review_status", "approved")
    .in("parameter_field_id", fields.length > 0 ? fields.map((field) => field.id) : ["00000000-0000-0000-0000-000000000000"])
    .limit(80);

  let semanticFallbackReason: string | null = null;
  let vector: number[] | null = null;
  const stopEmbedding = stageTimer("VECTOR_SEARCH");
  try {
    vector = (await embedTexts([question]))[0];
  } catch (error) {
    semanticFallbackReason = error instanceof Error ? error.message : "Embedding unavailable.";
  }
  const vectorPromise = vector
    ? supabaseAdmin.rpc("search_source_chunks_vector", {
        query_embedding: vector,
        personality_uuid: personalityId,
        parameter_field_uuids: fieldIds,
        textual_layers: null,
        max_results: 30,
        min_similarity: 0.25,
      })
    : Promise.resolve({ data: [], error: null });

  const [lexicalResult, vectorResult, claimsResult] = await Promise.all([lexicalPromise, vectorPromise, claimsPromise]);
  latenciesMs.lexical = stopLexical();
  latenciesMs.semantic = stopEmbedding();
  if (lexicalResult.error) throw new CorpusError("RETRIEVAL_FAILED", "Full-text corpus search failed.", 500, { cause: lexicalResult.error });
  if (vectorResult.error) semanticFallbackReason = `Vector search unavailable: ${vectorResult.error.message}`;
  if (claimsResult.error) throw new CorpusError("RETRIEVAL_FAILED", "Approved claims could not be searched.", 500, { cause: claimsResult.error });
  const lexical = ((lexicalResult.data || []) as Array<Record<string, unknown>>).map((row) => passageFromRpc(row, "lexical"));
  let semantic = ((vectorResult.data || []) as Array<Record<string, unknown>>).map((row) => passageFromRpc(row, "semantic"));
  const claims = rankApprovedClaims(question, (claimsResult.data || []) as Array<Record<string, unknown>>);
  if (lexical.length === 0 && claims.length === 0) semantic = semantic.filter((item) => (item.semanticScore || 0) >= 0.52);
  else semantic = semantic.filter((item) => (item.semanticScore || 0) >= 0.32);
  logStage("LEXICAL_SEARCH", { results: lexical.length, ms: latenciesMs.lexical });
  logStage("VECTOR_SEARCH", { results: semantic.length, ms: latenciesMs.semantic, fallback: Boolean(semanticFallbackReason) });

  const stopMerge = stageTimer("MERGE");
  const merged = dedupeEvidence(reciprocalRankFusion([claims, lexical, semantic]));
  latenciesMs.merge = stopMerge();
  logStage("MERGE", { unique: merged.length, ms: latenciesMs.merge });
  const stopRerank = stageTimer("RERANK");
  const reranked = await rerankEvidence(question, merged, 16);
  latenciesMs.rerank = stopRerank();
  logStage("RERANK", { selected: reranked.length, ms: latenciesMs.rerank });

  return {
    personality: personality.canonical_name,
    parameters: selectedParameters.map((parameter) => ({ code: parameter.code, name: parameter.name })),
    evidence: reranked,
    debug: {
      selectedPersonality: personality.canonical_name,
      selectedParameters: selectedParameters.map((parameter) => ({ code: parameter.code, name: parameter.name })),
      lexicalResults: lexical.length,
      semanticResults: semantic.length,
      approvedClaimResults: claims.length,
      mergedCandidates: merged.length,
      rerankedEvidence: reranked.map((item) => item.id),
      finalSelectedEvidenceCount: reranked.length,
      semanticFallbackReason,
      latenciesMs,
    },
  };
}
