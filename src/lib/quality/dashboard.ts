import "server-only";
import { classifySourceAuthority } from "@/lib/sources/authority";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assessReadiness, type ReadinessInput } from "./readiness";
import evaluationSnapshot from "../../../data/quality-evaluation-summary-v1.json";

type Source = { id: string; title: string; url: string | null; source_type: string | null; publisher_or_institution: string | null };
type EvaluationRow = { personality_id: string; passed: boolean; citation_valid: boolean; citation_supported: boolean; retrieval_sufficient: boolean; latency_ms: number | null; external_search_calls: number | null };
const one = <T>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] || null : value;
const host = (url: string | null) => { try { return url ? new URL(url).hostname.replace(/^www\./, "") : null; } catch { return null; } };

async function allRows<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await supabaseAdmin.from(table).select(select).range(from, from + 999);
    if (result.error) throw result.error;
    rows.push(...((result.data || []) as T[]));
    if ((result.data || []).length < 1000) return rows;
  }
}

export async function loadReadinessDashboard() {
  const [peopleResult, sourceLinks, chunkLinks, claims] = await Promise.all([
    supabaseAdmin.from("personalities").select("id,canonical_name").order("canonical_name"),
    allRows<{ personality_id: string; sources: Source | Source[] | null }>("source_personalities", "personality_id,sources(id,title,url,source_type,publisher_or_institution)"),
    allRows<{ personality_id: string; source_chunks: { id: string } | Array<{ id: string }> | null }>("chunk_personalities", "personality_id,source_chunks!inner(id)"),
    allRows<{ id: string; personality_id: string; review_status: string; claim_chunks: Array<{ chunk_id: string }>; claim_epistemics: { contract_satisfied: boolean | null } | Array<{ contract_satisfied: boolean | null }> | null }>("claims", "id,personality_id,review_status,claim_chunks(chunk_id),claim_epistemics(contract_satisfied)"),
  ]);
  if (peopleResult.error) throw peopleResult.error;

  let evaluations: EvaluationRow[] = [];
  const evaluationResult = await supabaseAdmin.from("quality_evaluation_results")
    .select("personality_id,passed,citation_valid,citation_supported,retrieval_sufficient,latency_ms,external_search_calls").limit(10_000);
  // The dashboard remains useful before the additive evaluation migration is applied.
  if (!evaluationResult.error) evaluations = (evaluationResult.data || []) as EvaluationRow[];

  return (peopleResult.data || []).map((person) => {
    const linkedSources = sourceLinks.filter((row) => row.personality_id === person.id).map((row) => one(row.sources)).filter((row): row is Source => Boolean(row));
    const uniqueSources = [...new Map(linkedSources.map((source) => [source.id, source])).values()];
    const domainCounts = new Map<string, number>();
    let primarySources = 0; let authoritativeSources = 0;
    for (const source of uniqueSources) {
      const domain = host(source.url); if (domain) domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      const authority = classifySourceAuthority({ url: source.url, sourceType: source.source_type, institution: source.publisher_or_institution });
      if (authority.primary) primarySources++; if (authority.level === "authoritative") authoritativeSources++;
    }
    const personClaims = claims.filter((claim) => claim.personality_id === person.id);
    const approved = personClaims.filter((claim) => claim.review_status === "approved");
    const personEvaluations = evaluations.filter((row) => row.personality_id === person.id);
    const latencyValues = personEvaluations.map((row) => row.latency_ms).filter((value): value is number => value !== null);
    const snapshot = evaluationSnapshot.byPersonality.find((row) => row.personalityId === person.id);
    const evaluationQuestions = personEvaluations.length || snapshot?.questions || 0;
    const input: ReadinessInput = {
      sources: uniqueSources.length, domains: domainCounts.size, primarySources, authoritativeSources,
      passages: chunkLinks.filter((row) => row.personality_id === person.id).length,
      totalClaims: personClaims.length, approvedClaims: approved.length,
      rejectedClaims: personClaims.filter((claim) => claim.review_status === "rejected").length,
      claimsWithPassages: approved.filter((claim) => claim.claim_chunks?.length).length,
      supportedContracts: approved.filter((claim) => one(claim.claim_epistemics)?.contract_satisfied === true).length,
      evaluatedContracts: approved.filter((claim) => one(claim.claim_epistemics)).length,
      evaluationQuestions, evaluationPasses: personEvaluations.length ? personEvaluations.filter((row) => row.passed).length : snapshot?.passed || 0,
      citationValid: personEvaluations.length ? personEvaluations.filter((row) => row.citation_valid).length : snapshot?.citationValid || 0,
      citationSupported: personEvaluations.length ? personEvaluations.filter((row) => row.citation_supported).length : snapshot?.citationSupported || 0,
      retrievalSuccesses: personEvaluations.length ? personEvaluations.filter((row) => row.retrieval_sufficient).length : snapshot?.retrievalSucceeded || 0,
      averageLatencyMs: latencyValues.length ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length) : snapshot?.averageLatencyMs || null,
      externalSearches: personEvaluations.length ? personEvaluations.reduce((sum, row) => sum + (row.external_search_calls || 0), 0) : snapshot?.externalSearches || 0,
      largestDomainSourceCount: Math.max(0, ...domainCounts.values()),
    };
    return { id: person.id, name: person.canonical_name, metrics: input, ...assessReadiness(input) };
  });
}
