import { createClient } from "@supabase/supabase-js";

const API_BASE = process.env.CORPUS_API_BASE || "http://localhost:3000";
const REVIEWER = "system_test_bulk_approval";
const BATCH_KEY = "vishvamitra-master-corpus-2026-09-23";
const ABSTENTION = "The approved knowledge base does not currently contain enough evidence to answer that fully.";

const benchmark = [
  ["broad", "Who is Vishvamitra?", true],
  ["broad", "What is Vishvamitra known for?", true],
  ["rama", "What role did Vishvamitra play in Rama's story?", true],
  ["rama", "Why did Vishvamitra take Rama with him?", true],
  ["text", "What are Vishvamitra's major textual contributions?", true],
  ["text", "What evidence links Vishvamitra to Rigveda Mandala 3?", true],
  ["text", "What is the significance of Rigveda 3.33 in relation to Vishvamitra?", true],
  ["text", "What is the significance of Rigveda 3.62.10 in relation to Vishvamitra?", true],
  ["development", "Trace Vishvamitra's development from king to Brahmarshi.", true],
  ["development", "How did Vishvamitra's tapas evolve?", true],
  ["development", "What role did anger play in Vishvamitra's development?", true],
  ["relationship", "Explain Vishvamitra's relationship with Vasistha.", true],
  ["relationship", "What was Vishvamitra's relationship with Rama?", true],
  ["relationship", "What was Vishvamitra's relationship with Shunahshepa?", true],
  ["relationship", "What was Vishvamitra's relationship with Dasharatha?", true],
  ["comparison", "How does the Rigvedic Vishvamitra differ from the Vishvamitra portrayed in the Ramayana?", true],
  ["comparison", "What is the difference between primary textual evidence and later interpretive traditions regarding Vishvamitra?", true],
  ["comparison", "What does Sri Aurobindo say about Vishvamitra, and how is that different from the primary text?", true],
  ["uncertain", "Are all references to Vishvamitra about the same figure?", true],
  ["uncertain", "What uncertainties exist in reconstructing Vishvamitra historically?", true],
  ["uncertain", "What parts of the Vishvamitra tradition are epic narrative rather than independently verified history?", true],
  ["unsupported", "What was Vishvamitra's favorite food?", false],
  ["unsupported", "What was Vishvamitra's height?", false],
  ["unsupported", "Did Vishvamitra invent algebra?", false],
  ["unsupported", "Did Vishvamitra visit America?", false],
];

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function allRows(queryFactory) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const result = await queryFactory().range(from, from + 999);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if ((result.data || []).length < 1000) return rows;
  }
}

async function identity(supabase) {
  const { data, error } = await supabase
    .from("personalities")
    .select("id, canonical_name")
    .eq("canonical_name", "Vishvamitra")
    .single();
  if (error) throw error;
  return data;
}

async function linkedSources(supabase, personalityId) {
  const links = await allRows(() => supabase
    .from("claim_sources")
    .select("source_id, claims!inner(personality_id)")
    .eq("claims.personality_id", personalityId));
  const ids = [...new Set(links.map((link) => link.source_id))];
  if (!ids.length) return [];
  return allRows(() => supabase
    .from("sources")
    .select("id, title, url, source_status, ingestion_status, textual_layer, publisher_or_institution, last_ingestion_error")
    .in("id", ids));
}

async function corpusSources(supabase, personalityId) {
  const linked = await linkedSources(supabase, personalityId);
  const added = await allRows(() => supabase
    .from("sources")
    .select("id, title, url, source_status, ingestion_status, textual_layer, publisher_or_institution, last_ingestion_error, metadata")
    .eq("metadata->>approval_batch_key", BATCH_KEY)
    .not("metadata->benchmark_sarga", "is", null));
  return [...new Map([...linked, ...added].map((source) => [source.id, source])).values()];
}

function inferLayer(source) {
  const value = `${source.title} ${source.url || ""}`.toLowerCase();
  if (value.includes("rigveda")) return "Rigveda — Mandala 3";
  if (value.includes("ramayan") || value.includes("baala")) return "Ramayana — Bala Kanda";
  if (value.includes("aitareya")) return "Aitareya Brahmana tradition";
  if (value.includes("mahabharata")) return "Mahabharata tradition";
  if ((source.publisher_or_institution || "").toLowerCase().includes("aurobind")) return "Modern spiritual interpretation";
  return source.textual_layer || "Traditional or scholarly source";
}

async function api(path, init = {}) {
  const headers = { "content-type": "application/json", ...(init.headers || {}) };
  if (process.env.CORPUS_ADMIN_TOKEN) headers.authorization = `Bearer ${process.env.CORPUS_ADMIN_TOKEN}`;
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body?.error?.code || "REQUEST_FAILED"}: ${body?.error?.message || response.statusText}`);
  return body;
}

async function mapConcurrent(items, concurrency, work) {
  let next = 0;
  const results = [];
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { ok: true, value: await work(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function ingest(supabase, personalityId) {
  const retryFailed = process.argv.includes("--retry-failed");
  const sources = (await corpusSources(supabase, personalityId))
    .filter((source) => source.source_status === "approved" && source.url && (
      source.ingestion_status === "not_ingested" || (retryFailed && source.ingestion_status === "failed")
    ))
    .sort((left, right) => left.title.localeCompare(right.title));
  console.log(`Ingesting ${sources.length} approved linked sources with URLs.`);
  const results = await mapConcurrent(sources, 4, async (source, index) => {
    const result = await api("/api/corpus/ingest", {
      method: "POST",
      body: JSON.stringify({
        sourceId: source.id,
        personalityIds: [personalityId],
        parameterFieldIds: [],
        mode: "url",
        url: source.url,
        textualLayer: inferLayer(source),
        language: "Sanskrit / English",
      }),
    });
    console.log(`[${index + 1}/${sources.length}] ingested ${source.title}: ${result.chunksActive} chunks`);
    return { sourceId: source.id, title: source.title, chunks: result.chunksActive };
  });
  const failures = results.map((result, index) => ({ result, source: sources[index] })).filter(({ result }) => !result.ok);
  failures.forEach(({ result, source }) => console.error(`FAILED ${source.title}: ${result.error}`));
  console.log(JSON.stringify({ attempted: sources.length, succeeded: results.length - failures.length, failed: failures.length }, null, 2));
  if (failures.length) process.exitCode = 2;
}

async function embed(supabase, personalityId) {
  const sources = (await corpusSources(supabase, personalityId)).filter((source) => source.ingestion_status === "ready");
  console.log(`Embedding ${sources.length} ready sources.`);
  const results = await mapConcurrent(sources, 1, async (source, index) => {
    const embedded = await api("/api/corpus/actions", { method: "POST", body: JSON.stringify({ action: "embed", sourceId: source.id }) });
    console.log(`[${index + 1}/${sources.length}] ${source.title}: embedded ${embedded.embedded}, failed ${embedded.failed}`);
    return { sourceId: source.id, embedded: embedded.embedded, failed: embedded.failed };
  });
  const failures = results.filter((result) => !result.ok);
  const chunkFailures = results.reduce((sum, result) => sum + (result.ok ? Number(result.value.failed || 0) : 0), 0);
  failures.forEach((result) => console.error(`FAILED: ${result.error}`));
  console.log(JSON.stringify({ attempted: sources.length, succeeded: results.length - failures.length, requestFailures: failures.length, chunkFailures }, null, 2));
  if (failures.length || chunkFailures) process.exitCode = 2;
}

async function candidates(supabase, personalityId) {
  const { data: rows, error } = await supabase
    .from("candidate_claims")
    .select("id, claim_text, extraction_confidence")
    .eq("personality_id", personalityId)
    .eq("status", "pending")
    .gte("extraction_confidence", 0.9);
  if (error) throw error;
  const { data: batch, error: batchError } = await supabase.from("corpus_change_batches").select("id").eq("batch_key", BATCH_KEY).single();
  if (batchError) throw batchError;
  let promoted = 0;
  for (const candidate of rows || []) {
    const { data: claimId, error: acceptError } = await supabase.rpc("accept_candidate_claim", {
      candidate_uuid: candidate.id,
      reviewer: REVIEWER,
    });
    if (acceptError) throw acceptError;
    const { data: claim, error: claimError } = await supabase.from("claims").select("review_status, approval_metadata, researcher_notes").eq("id", claimId).single();
    if (claimError) throw claimError;
    const { error: auditError } = await supabase.from("corpus_change_audit").upsert({
      batch_id: batch.id,
      entity_type: "claim",
      entity_id: claimId,
      action: "candidate_test_approval",
      previous_state: claim,
      new_state: { review_status: "approved", testing_only: true, candidate_id: candidate.id },
      reason: "High-confidence candidate with a direct source_chunk; promoted and approved for corpus testing.",
      actor: REVIEWER,
    }, { onConflict: "batch_id,entity_type,entity_id,action" });
    if (auditError) throw auditError;
    const { error: reviewError } = await supabase.from("claim_reviews").insert({
      claim_id: claimId,
      reviewer_name: REVIEWER,
      decision: "approved",
      notes: `High-confidence direct-chunk candidate approved for corpus testing (${BATCH_KEY}).`,
    });
    if (reviewError) throw reviewError;
    const { error: updateError } = await supabase.from("claims").update({
      review_status: "approved",
      approval_metadata: {
        ...(claim.approval_metadata || {}),
        testing_only: true,
        approval_actor: REVIEWER,
        approval_reason: "high-confidence candidate approved for corpus testing",
        approval_batch_key: BATCH_KEY,
        source_candidate_id: candidate.id,
      },
    }).eq("id", claimId);
    if (updateError) throw updateError;
    promoted += 1;
    console.log(`Promoted: ${candidate.claim_text}`);
  }
  console.log(JSON.stringify({ pendingHighConfidence: rows?.length || 0, promoted }, null, 2));
}

async function backfill(supabase) {
  const tags = await supabase.rpc("tag_vishvamitra_chunks_from_claim_sources");
  if (tags.error) throw tags.error;
  const exact = await supabase.rpc("backfill_vishvamitra_claim_chunks", {
    minimum_confidence: 0.72,
    maximum_links_per_claim: 2,
  });
  if (exact.error) throw exact.error;
  const overlap = await supabase.rpc("backfill_vishvamitra_claim_chunks_overlap", {
    minimum_matched_terms: 2,
    minimum_overlap_ratio: 0.1,
    maximum_links_per_claim: 2,
  });
  if (overlap.error) throw overlap.error;
  console.log(JSON.stringify({ tags: tags.data, exact: exact.data, overlap: overlap.data }, null, 2));
}

function group(rows, key) {
  return Object.fromEntries([...new Set(rows.map((row) => row[key]))].sort().map((value) => [String(value), rows.filter((row) => row[key] === value).length]));
}

async function inventory(supabase, personalityId) {
  const claims = await allRows(() => supabase.from("claims").select("id, review_status").eq("personality_id", personalityId));
  const sources = await linkedSources(supabase, personalityId);
  const corpus = await corpusSources(supabase, personalityId);
  const personalityChunks = await allRows(() => supabase.from("chunk_personalities").select("chunk_id").eq("personality_id", personalityId));
  const taggedChunkIds = [...new Set(personalityChunks.map((row) => row.chunk_id))];
  const chunks = taggedChunkIds.length ? await allRows(() => supabase.from("source_chunks").select("id, source_id, embedding_status, is_active").in("id", taggedChunkIds).eq("is_active", true)) : [];
  const chunkIds = chunks.map((chunk) => chunk.id);
  const parameterChunks = chunkIds.length ? await allRows(() => supabase.from("chunk_parameter_fields").select("chunk_id").in("chunk_id", chunkIds)) : [];
  const claimSources = await allRows(() => supabase.from("claim_sources").select("claim_id, claims!inner(personality_id)").eq("claims.personality_id", personalityId));
  const claimChunks = await allRows(() => supabase.from("claim_chunks").select("claim_id, confidence, link_method, claims!inner(personality_id)").eq("claims.personality_id", personalityId));
  const candidatesRows = await allRows(() => supabase.from("candidate_claims").select("id, status").eq("personality_id", personalityId));
  const relationships = await allRows(() => supabase.from("relationships").select("id, review_status").or(`subject_personality_id.eq.${personalityId},object_personality_id.eq.${personalityId}`));
  const eventLinks = await allRows(() => supabase.from("event_personalities").select("event_id, events!inner(review_status)").eq("personality_id", personalityId));
  const access = await allRows(() => supabase.from("approved_source_access").select("id,is_active,evidence_use_status,allow_live_fetch"));
  const cache = await allRows(() => supabase.from("live_research_cache").select("id,fetch_status,hit_count"));
  console.log(JSON.stringify({
    claims: claims.length,
    claimsByStatus: group(claims, "review_status"),
    linkedSources: sources.length,
    approvedLinkedSources: sources.filter((source) => source.source_status === "approved").length,
    corpusSources: corpus.length,
    approvedCorpusSources: corpus.filter((source) => source.source_status === "approved").length,
    ingestionByStatus: group(corpus, "ingestion_status"),
    activeChunks: chunks.length,
    embeddedChunks: chunks.filter((chunk) => chunk.embedding_status === "ready").length,
    personalityTaggedChunks: new Set(personalityChunks.map((row) => row.chunk_id)).size,
    parameterTaggedChunks: new Set(parameterChunks.map((row) => row.chunk_id)).size,
    claimSourceLinks: claimSources.length,
    claimsWithSources: new Set(claimSources.map((row) => row.claim_id)).size,
    claimsWithSourcesPercent: Number(((new Set(claimSources.map((row) => row.claim_id)).size / Math.max(claims.length, 1)) * 100).toFixed(1)),
    claimChunkLinks: claimChunks.length,
    claimsWithChunks: new Set(claimChunks.map((row) => row.claim_id)).size,
    claimsWithChunksPercent: Number(((new Set(claimChunks.map((row) => row.claim_id)).size / Math.max(claims.length, 1)) * 100).toFixed(1)),
    claimChunkMethods: group(claimChunks, "link_method"),
    candidates: candidatesRows.length,
    candidatesByStatus: group(candidatesRows, "status"),
    relationships: relationships.length,
    relationshipsByStatus: group(relationships, "review_status"),
    events: new Set(eventLinks.map((row) => row.event_id)).size,
    approvedLiveScopes: access.filter((row) => row.is_active && row.evidence_use_status === "approved" && row.allow_live_fetch).length,
    readyCacheEntries: cache.filter((row) => row.fetch_status === "ready").length,
    cacheHits: cache.reduce((sum, row) => sum + row.hit_count, 0),
  }, null, 2));
}

async function runBenchmark(personalityId) {
  const results = [];
  for (let index = 0; index < benchmark.length; index += 1) {
    const [category, question, shouldAnswer] = benchmark[index];
    const started = Date.now();
    try {
      const body = await api("/api/ask", { method: "POST", body: JSON.stringify({ personalityId, question }) });
      const abstained = body.answer === ABSTENTION;
      const passed = shouldAnswer ? !abstained && (body.citations?.length || 0) > 0 : abstained;
      const result = {
        category, question, shouldAnswer, passed, abstained,
        citations: body.citations?.length || 0,
        evidence: body.evidence?.length || 0,
        mode: body.debug?.executionMode,
        liveTriggered: body.debug?.liveResearchTriggered,
        cacheHits: body.debug?.cacheHits || 0,
        liveFetches: body.debug?.liveFetches || 0,
        durationMs: Date.now() - started,
      };
      results.push(result);
      console.log(`[${index + 1}/${benchmark.length}] ${passed ? "PASS" : "FAIL"} ${question} (${result.durationMs}ms, ${result.citations} citations)`);
    } catch (error) {
      results.push({ category, question, shouldAnswer, passed: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started });
      console.error(`[${index + 1}/${benchmark.length}] ERROR ${question}: ${results.at(-1).error}`);
    }
  }
  const byCategory = Object.fromEntries([...new Set(results.map((row) => row.category))].map((category) => {
    const selected = results.filter((row) => row.category === category);
    return [category, { passed: selected.filter((row) => row.passed).length, total: selected.length }];
  }));
  console.log(JSON.stringify({ passed: results.filter((row) => row.passed).length, total: results.length, byCategory, results }, null, 2));
  if (results.some((row) => !row.passed)) process.exitCode = 3;
}

async function main() {
  const action = process.argv[2] || "inventory";
  const supabase = client();
  const personality = await identity(supabase);
  if (action === "inventory") return inventory(supabase, personality.id);
  if (action === "ingest") return ingest(supabase, personality.id);
  if (action === "embed") return embed(supabase, personality.id);
  if (action === "candidates") return candidates(supabase, personality.id);
  if (action === "backfill") return backfill(supabase);
  if (action === "benchmark") return runBenchmark(personality.id);
  throw new Error(`Unknown action: ${action}. Use inventory, ingest, embed, candidates, backfill, or benchmark.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
