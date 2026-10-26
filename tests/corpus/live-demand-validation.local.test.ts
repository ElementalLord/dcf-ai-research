import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => ({ research: null as unknown, verification: null as unknown }));
vi.mock("@/lib/live-research/on-demand-engine", async (original) => {
  const actual = await original<typeof import("@/lib/live-research/on-demand-engine")>();
  return { ...actual, executeDemandResearch: async (...args: Parameters<typeof actual.executeDemandResearch>) => {
    const result = await actual.executeDemandResearch(...args);
    capture.research = result;
    return result;
  } };
});
vi.mock("@/lib/live-research/knowledge-verification", async (original) => {
  const actual = await original<typeof import("@/lib/live-research/knowledge-verification")>();
  return { ...actual, verifyDemandKnowledge: async (...args: Parameters<typeof actual.verifyDemandKnowledge>) => {
    const result = await actual.verifyDemandKnowledge(...args);
    capture.verification = result;
    return result;
  } };
});

import { answerQuestion } from "@/lib/corpus/answer";
import { retrieveEvidence } from "@/lib/corpus/retrieval";
import { resolveQuestion } from "@/lib/ask/question-resolution";
import { isClaimEligible } from "@/lib/corpus/approval-policy";
import { supabaseAdmin } from "@/lib/supabase-admin";

const tracePath = process.env.DCF_LIVE_TRACE_PATH || "artifacts/corpus-verification/live-demand-validation-2026-10-23.json";
const personalityName = process.env.DCF_LIVE_PERSONALITY_NAME || "Jagadish Chandra Bose";
const question = process.env.DCF_LIVE_QUESTION || "In what year did Jagadish Chandra Bose establish the Bose Institute?";
const counts = { brave: 0, originalPages: 0, robots: 0, gemini: 0, otherExternal: 0 };
const requests: Array<{ kind: string; url: string; status?: number; error?: string }> = [];
const originalFetch = globalThis.fetch.bind(globalThis);

function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
  const local = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  const kind = local ? "local" : url.hostname === "api.search.brave.com" ? "brave"
    : /(?:^|\.)googleapis\.com$/.test(url.hostname) ? "gemini"
      : url.pathname === "/robots.txt" ? "robots" : "originalPages";
  if (kind !== "local") {
    if (kind === "brave") { if (counts.brave >= 1) throw new Error("Brave call cap reached"); counts.brave++; }
    if (kind === "gemini") { if (counts.gemini >= 5) throw new Error("Gemini call cap reached"); counts.gemini++; }
    if (kind === "originalPages") { if (counts.originalPages >= 4) throw new Error("Original page fetch cap reached"); counts.originalPages++; }
    if (kind === "robots") counts.robots++;
    const row: (typeof requests)[number] = { kind, url: url.toString() };
    requests.push(row);
    return originalFetch(input, init).then((response) => { row.status = response.status; return response; }, (error) => {
      row.error = error instanceof Error ? error.message : String(error); throw error;
    });
  }
  return originalFetch(input, init);
}

async function save(trace: Record<string, unknown>) {
  await writeFile(tracePath, `${JSON.stringify({ question, at: new Date().toISOString(),
    target: process.env.NEXT_PUBLIC_SUPABASE_URL, counts, requests, ...trace }, null, 2)}\n`);
}

describe.skipIf(process.env.DCF_LIVE_DEMAND_VALIDATION !== "true")("one isolated live demand validation", () => {
  it("runs one bounded real-provider Ask and reuses admission if successful", async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
    expect(process.env.DEMAND_RESEARCH_ENABLED).toBe("true");
    expect(process.env.DEMAND_AUTO_ADMISSION_ENABLED).toBe("true");
    expect(process.env.SYNTHESIS_DISABLED).toBe("true");
    expect(process.env.EMBEDDINGS_DISABLED).toBe("true");
    const personResult = await supabaseAdmin.from("personalities").select("id,canonical_name").eq("canonical_name", personalityName).single();
    if (personResult.error || !personResult.data) throw personResult.error || new Error(`${personalityName} absent in isolated DB`);
    const person = personResult.data;
    const before = await retrieveEvidence(question, person.id);
    const resolution = resolveQuestion({ question, personalityId: person.id, personalityName: person.canonical_name,
      personalityAliases: before.personalityAliases, termAliases: before.termAliases, allParameters: before.allParameters,
      evidence: before.evidence, policyMode: "strict", researchAvailable: true });
    const preflight = { state: resolution.state, sufficient: resolution.sufficient, researchRequest: Boolean(resolution.researchRequest),
      gaps: resolution.gaps.map((gap) => gap.requirement), localEvidence: before.evidence.length };
    if (process.env.DCF_LIVE_PREFLIGHT_ONLY === "true") {
      await save({ preflight, preflightOnly: true });
      expect(preflight.sufficient).toBe(false);
      expect(preflight.researchRequest).toBe(true);
      return;
    }
    if (preflight.sufficient || !preflight.researchRequest) throw new Error("Local evidence does not require research");
    globalThis.fetch = guardedFetch;
    const trace: Record<string, unknown> = { preflight };
    let failure: Error | null = null;
    try {
      const first = await answerQuestion(question, person.id);
      trace.first = { status: first.status, answer: first.answer, citations: first.citations,
        debug: { demandResearchStatus: first.debug.demandResearchStatus, demandVerificationOutcomes: first.debug.demandVerificationOutcomes,
          demandAdmittedClaims: first.debug.demandAdmittedClaims, webSearchCalls: first.debug.webSearchCalls,
          liveFetches: first.debug.liveFetches, demandVerificationModelCalls: first.debug.demandVerificationModelCalls,
          estimatedMicroUsd: first.debug.demandEstimatedCostMicros } };
      trace.research = capture.research;
      trace.verification = capture.verification;
      const admitted = await supabaseAdmin.from("claims")
        .select("id,claim_text,review_status,approval_origin,claim_sources(evidence_excerpt,page_or_section,sources(id,title,url,source_status,rights_or_access_note)),metadata_claim_evidence(locator,metadata_admission_permissions(source_url,is_active))")
        .eq("personality_id", person.id).eq("approval_origin", "automated_evidence_verification").order("created_at", { ascending: false }).limit(5);
      if (admitted.error) throw admitted.error;
      trace.resources = admitted.data;
      const claim = (admitted.data || []).find((row) => row.review_status === "approved"
        && isClaimEligible(row.review_status, row.approval_origin, "strict")
        && row.claim_sources.length >= 2
        && row.claim_sources.every((link) => (Array.isArray(link.sources) ? link.sources[0] : link.sources)?.source_status === "approved"
          && link.evidence_excerpt === null)
        && row.metadata_claim_evidence.length >= 2);
      if (!claim || !first.citations.some((citation) => citation.claimId === claim.id))
        throw new Error(`No admitted claim cited by the first Ask; research status: ${first.debug.demandResearchStatus || "unknown"}`);
      const geminiBefore = counts.gemini;
      const second = await answerQuestion(question, person.id);
      trace.second = { status: second.status, answer: second.answer, citations: second.citations,
        debug: { webSearchCalls: second.debug.webSearchCalls, generativeCalls: second.debug.generativeCalls } };
      trace.reusedWithoutProviders = second.debug.webSearchCalls === 0 && counts.brave === 1 && counts.gemini === geminiBefore
        && second.citations.some((citation) => citation.claimId === claim.id);
      if (!trace.reusedWithoutProviders) throw new Error("The second Ask did not reuse the admitted claim without providers");
      const reservations = await supabaseAdmin.from("demand_budget_reservations")
        .select("status,search_calls,model_calls,input_tokens,output_tokens,actual_micro,settlement_reason")
        .order("created_at", { ascending: false }).limit(1);
      trace.budget = reservations.error ? { error: reservations.error.message } : reservations.data?.[0];
    } catch (error) {
      trace.error = error instanceof Error ? error.message : String(error);
      trace.research = capture.research;
      trace.verification = capture.verification;
      failure = error instanceof Error ? error : new Error(String(error));
    } finally {
      globalThis.fetch = originalFetch;
      await save(trace);
    }
    if (failure) throw failure;
  }, 120_000);
});
