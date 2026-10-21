import { createHash, createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { answerQuestion } from "@/lib/corpus/answer";
import { retrieveEvidence } from "@/lib/corpus/retrieval";
import { withRequestUsage } from "@/lib/corpus/usage";
import { resolveQuestion } from "@/lib/ask/question-resolution";
import { executeDemandResearch, type ResearchDependencies } from "@/lib/live-research/on-demand-engine";
import { authenticateSource } from "@/lib/live-research/research-quality";
import { productionAdmissionStore, verifyDemandKnowledge } from "@/lib/live-research/knowledge-verification";
import { reserveResearchBudget, settleResearchBudget } from "@/lib/live-research/research-budget";
import { supabaseAdmin } from "@/lib/supabase-admin";

const enabled = process.env.DCF_LOCAL_DB_VALIDATION === "true";
if (enabled && !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || ""))
  throw new Error("Local database validation requires a loopback Supabase API URL");

const suite = enabled ? describe : describe.skip;
const personId = randomUUID();
const categoryId = randomUUID();
const personName = `Anika ${personId.slice(0, 8)} Sen`;
const question = `When was ${personName} awarded the Aurora Medal?`;
const secondQuestion = `What year was ${personName} awarded the Aurora Medal?`;
const claimText = `${personName} was awarded the Aurora Medal in 1928.`;
const sourceUrl = `https://archive.example.org/award/${personId}`;
const sourceTitle = "Aurora Medal register";
const excerpt = `The register records that ${personName} was awarded the Aurora Medal in 1928.`;
const source = authenticateSource({ url: sourceUrl, title: sourceTitle, author: "Registrar", publisher: "Example Archive",
  publicationDate: "1928", category: "institutional" });
const rights = "https://creativecommons.org/licenses/by/4.0/";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const required = (value: { data: unknown; error: { message: string } | null }): unknown => {
  if (value.error) throw new Error(value.error.message);
  return value.data;
};
const settleZero = async (id: string) => required(await supabaseAdmin.rpc("settle_demand_budget", { p_reservation_id: id,
  p_search_calls: 0, p_model_calls: 0, p_input_tokens: 0, p_output_tokens: 0, p_unmetered_calls: 0 }));
const admission = (text = claimText, url = sourceUrl, publisher = "Example Archive") => ({
  personality_id: personId, claim_text: text, claim_hash: hash(`${personId}:${text.toLowerCase()}`),
  epistemic_type: "HISTORICAL_FACT", classifier_version: "local-test", contract_version: "local-test",
  contract_status: "SUPPORTED", policy_version: "demand-admission/1", research_request_id: randomUUID(), research_work_id: "local-test",
  sources: [{ url, title: sourceTitle, author: "Registrar", publisher, publication_date: "1928",
    evidence_type: "institutional_record", work_key: `work:${url}`, rights, locator: "Award register, 1928", excerpt }],
});

suite("real local Supabase demand transactions", () => {
  afterAll(async () => {
    const claims = await supabaseAdmin.from("claims").select("claim_sources(source_id)").eq("personality_id", personId);
    if (claims.error) throw claims.error;
    const sourceIds = [...new Set((claims.data || []).flatMap((claim) => claim.claim_sources.map((link) => link.source_id)))];
    required(await supabaseAdmin.from("demand_research_needs").delete().eq("personality_id", personId));
    required(await supabaseAdmin.from("external_research_runs").delete().eq("personality_id", personId));
    required(await supabaseAdmin.from("personalities").delete().eq("id", personId));
    required(await supabaseAdmin.from("categories").delete().eq("id", categoryId));
    if (sourceIds.length) required(await supabaseAdmin.from("sources").delete().in("id", sourceIds));
  });
  it("admits a mocked original-source finding and reuses the committed claim in Ask", async () => {
    required(await supabaseAdmin.from("categories").insert({ id: categoryId, slug: `local-test-${categoryId}`, name: "Local test" }));
    required(await supabaseAdmin.from("personalities").insert({ id: personId, canonical_name: personName, research_status: "approved" }));
    required(await supabaseAdmin.from("personality_categories").insert({ personality_id: personId, category_id: categoryId, is_primary: true }));
    required(await supabaseAdmin.from("search_policy").upsert({ id: true, mode: "credible_web" }));
    const before = await retrieveEvidence(question, personId);
    const resolution = resolveQuestion({ question, personalityId: personId, personalityName: personName, personalityAliases: before.personalityAliases,
      termAliases: before.termAliases, allParameters: before.allParameters, evidence: before.evidence, policyMode: "strict", researchAvailable: true });
    expect(resolution.researchRequest).not.toBeNull();
    let searches = 0;
    const deps: ResearchDependencies = {
      provider: { name: "fixture", isConfigured: () => true, async search() { searches++; return [{ title: sourceTitle, url: sourceUrl, sourceProvider: "fixture" }]; } },
      async claimNeed(needId, personalityId, owner) {
        return required(await supabaseAdmin.rpc("claim_demand_research_need", { p_need_id: needId, p_personality_id: personalityId, p_owner: owner })) as "acquired" | "active" | "cooldown";
      },
      async finishNeed(needId, owner, status, calls, outcome, cooldown) {
        expect(required(await supabaseAdmin.rpc("finish_demand_research_need", { p_need_id: needId, p_owner: owner,
          p_status: status, p_search_calls: calls, p_outcome: outcome, p_cooldown_seconds: cooldown }))).toBe(true);
      },
      reserveBudget: (requestId) => reserveResearchBudget(requestId, 8),
      async inspect(url) { return { url, domain: new URL(url).hostname, category: "institutional", title: sourceTitle }; },
      async robotsAllowed() { return true; },
      async read() { return { text: excerpt, title: sourceTitle, url: sourceUrl, locator: "Award register, 1928",
        supportLevel: "EXACT", supportReason: "Direct date and person", identity: source, rightsDeclaration: rights }; },
      async existingSourceId() { return null; },
    };
    await withRequestUsage(async usage => {
      const concurrent = await Promise.all([
        executeDemandResearch(resolution.researchRequest!, question, before.evidence, [personName], deps),
        executeDemandResearch(resolution.researchRequest!, question, before.evidence, [personName], deps),
      ]);
      expect(concurrent.filter((item) => item.attempted)).toHaveLength(1);
      expect(concurrent.some((item) => item.status === "in_progress" || item.status === "cooldown")).toBe(true);
      const research = concurrent.find((item) => item.attempted)!;
      expect(research.status).toBe("complete");
      const provider = {
        async extract() { return [{ proposition: claimText, type: "HISTORICAL_FACT" as const, evidenceIndexes: [0], context: null,
          period: "1928", qualification: null, category: "official_record_fact" as const }]; },
        async assess() { return { support: "SUPPORTED" as const, supportingIndexes: [0], equivalentExisting: false,
          conflictsExisting: false, materialContradiction: false, exactEntities: true, exactDatesAndUnits: true,
          qualifiersPreserved: true, officialIssuer: true, independentDocuments: true, reason: "Issuing register" }; },
      };
      const verified = await verifyDemandKnowledge(resolution.researchRequest!, research,
        { provider, store: productionAdmissionStore(), enabled: true });
      expect(verified.decisions[0], JSON.stringify(verified.decisions[0])).toMatchObject({ outcome: "admitted" });
      expect(await settleResearchBudget(usage)).toBe(10_000);
    });
    expect(searches).toBe(1);
    const claims = required(await supabaseAdmin.from("claims").select("id,approval_origin,review_status,claim_sources(source_id),claim_chunks(chunk_id),claim_epistemics(contract_status)")
      .eq("personality_id", personId).eq("claim_text", claimText)) as Array<{ approval_origin: string; review_status: string;
        claim_sources: unknown[]; claim_chunks: unknown[]; claim_epistemics: { contract_status: string } }>;
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ approval_origin: "automated_evidence_verification", review_status: "approved" });
    expect(claims[0].claim_sources).toHaveLength(1);
    expect(claims[0].claim_chunks).toHaveLength(1);
    expect(claims[0].claim_epistemics).toMatchObject({ contract_status: "SUPPORTED" });
    const second = await retrieveEvidence(secondQuestion, personId);
    const reused = resolveQuestion({ question: secondQuestion, personalityId: personId,
      personalityName: personName, personalityAliases: second.personalityAliases, termAliases: second.termAliases,
      allParameters: second.allParameters, evidence: second.evidence, policyMode: "strict", researchAvailable: true });
    expect(reused).toMatchObject({ state: "local_sufficient", researchRequest: null });
    process.env.DEMAND_RESEARCH_ENABLED = "true";
    process.env.SYNTHESIS_DISABLED = "true";
    const answer = await answerQuestion(secondQuestion, personId);
    expect(answer.debug.webSearchCalls).toBe(0);
    expect(answer.status).not.toBe("abstained");
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(searches).toBe(1);
  }, 30_000);

  it("keeps unsupported, contradictory, rights-restricted and provider-failed findings out of verified claims", async () => {
    const candidate = `${personName} was awarded the Comet Medal in 1941.`;
    const finding = { source: { ...source, url: `https://archive.example.org/comet/${randomUUID()}`, sourceId: null,
      publisherDomain: "archive.example.org", retrievedAt: new Date().toISOString() },
      passage: { text: `The register records that ${personName} was awarded the Comet Medal in 1941.`, locator: "Comet register, 1941",
        supportLevel: "EXACT" as const, supportReason: "Direct statement" },
      relation: "supports" as const, retention: "license_candidate" as const, rightsDeclaration: rights,
      citeableNow: true, verificationReady: true };
    const request = { needId: hash(randomUUID()), personalityId: personId, personalityName: personName,
      normalizedIntent: "comet date", category: "NARROW_FACT" as const, gaps: [], existingEvidenceIds: [], maxExternalSearches: 1 };
    const research = { requestId: randomUUID(), needId: request.needId, workId: hash(randomUUID()), status: "complete" as const,
      attempted: true, candidates: [], findings: [finding], passages: [], unresolvedGaps: [], sufficientForVerification: true,
      citeableNow: true, usage: { searchCalls: 1, sourceFetches: 1, modelCalls: 0 as const, provider: "fixture", errorCategory: null } };
    const extract = async () => [{ proposition: candidate, type: "HISTORICAL_FACT" as const, evidenceIndexes: [0],
      context: null, period: "1941", qualification: null, category: "official_record_fact" as const }];
    const contradicted = await verifyDemandKnowledge(request, research, { enabled: true, store: productionAdmissionStore(),
      provider: { extract, async assess() { return { support: "CONTRADICTED" as const, supportingIndexes: [],
        equivalentExisting: false, conflictsExisting: false, materialContradiction: false, exactEntities: true,
        exactDatesAndUnits: true, qualifiersPreserved: true, officialIssuer: true, independentDocuments: true, reason: "Contradicted" }; } } });
    expect(contradicted.decisions[0]?.outcome).toBe("rejected");
    const restricted = await verifyDemandKnowledge(request, { ...research, findings: [{ ...finding, retention: "transient_only", rightsDeclaration: null }] },
      { enabled: true, store: productionAdmissionStore(), provider: { extract, async assess() { throw new Error("must not assess restricted source"); } } });
    expect(restricted.decisions[0]?.outcome).toBe("quarantined");
    const providerFailed = await verifyDemandKnowledge(request, research,
      { enabled: true, store: productionAdmissionStore(), provider: { extract, async assess() { throw new Error("provider failed"); } } });
    expect(providerFailed.decisions[0]?.outcome).toBe("quarantined");
    expect(required(await supabaseAdmin.from("claims").select("id").eq("personality_id", personId).eq("claim_text", candidate))).toHaveLength(0);
  });

  it("rolls back mid-transaction failures, rejects restricted rights, and deduplicates concurrent admissions", async () => {
    const rollbackUrl = `https://archive.example.org/rollback/${randomUUID()}`;
    const bad = admission(`${personName} was awarded the Aurora Medal in 1931.`, rollbackUrl);
    bad.sources.push({ ...bad.sources[0], url: sourceUrl, work_key: `work:${sourceUrl}`, publisher: "Different Publisher" });
    const failed = await supabaseAdmin.rpc("admit_demand_verified_claim", { p_admission: bad });
    expect(failed.error).not.toBeNull();
    expect(required(await supabaseAdmin.from("claims").select("id").eq("personality_id", personId).eq("claim_text", bad.claim_text))).toHaveLength(0);
    expect(required(await supabaseAdmin.from("sources").select("id").eq("url", rollbackUrl))).toHaveLength(0);
    expect(required(await supabaseAdmin.from("demand_verification_decisions").select("id").eq("claim_hash", bad.claim_hash))).toHaveLength(0);
    const restricted = admission(`${personName} was awarded the Aurora Medal in 1932.`, `https://archive.example.org/restricted/${randomUUID()}`);
    restricted.sources[0].rights = "all rights reserved";
    expect((await supabaseAdmin.rpc("admit_demand_verified_claim", { p_admission: restricted })).error).not.toBeNull();
    expect(required(await supabaseAdmin.from("claims").select("id").eq("personality_id", personId).eq("claim_text", restricted.claim_text))).toHaveLength(0);
    const paused = admission(`${personName} was awarded the Aurora Medal in 1934.`, `https://archive.example.org/paused/${randomUUID()}`);
    required(await supabaseAdmin.from("demand_budget_policy").update({ auto_admission_paused: true }).eq("id", true));
    try {
      expect((await supabaseAdmin.rpc("admit_demand_verified_claim", { p_admission: paused })).error).not.toBeNull();
      expect(required(await supabaseAdmin.from("claims").select("id").eq("personality_id", personId).eq("claim_text", paused.claim_text))).toHaveLength(0);
    } finally {
      required(await supabaseAdmin.from("demand_budget_policy").update({ auto_admission_paused: false }).eq("id", true));
    }
    const concurrent = admission(`${personName} was awarded the Aurora Medal in 1933.`, `https://archive.example.org/concurrent/${randomUUID()}`);
    const outcomes = await Promise.all([supabaseAdmin.rpc("admit_demand_verified_claim", { p_admission: concurrent }),
      supabaseAdmin.rpc("admit_demand_verified_claim", { p_admission: concurrent })]);
    expect(outcomes.every((value) => !value.error)).toBe(true);
    expect(outcomes.map((value) => value.data?.created).sort()).toEqual([false, true]);
    expect(required(await supabaseAdmin.from("claims").select("id").eq("personality_id", personId).eq("claim_text", concurrent.claim_text))).toHaveLength(1);
    const admittedId = (required(await supabaseAdmin.from("claims").select("id").eq("personality_id", personId).eq("claim_text", claimText).single()) as { id: string }).id;
    required(await supabaseAdmin.from("claims").update({ review_status: "needs_review" }).eq("id", admittedId));
    const admittedRecord = required(await supabaseAdmin.from("demand_verification_decisions").select("claim_hash")
      .eq("claim_id", admittedId).eq("outcome", "admitted").single()) as { claim_hash: string };
    expect((await supabaseAdmin.rpc("admit_demand_verified_claim", { p_admission: {
      ...admission(), claim_hash: admittedRecord.claim_hash,
    } })).error).not.toBeNull();
    const linked = required(await supabaseAdmin.from("claim_chunks").select("chunk_id").eq("claim_id", admittedId).single()) as { chunk_id: string };
    expect((required(await supabaseAdmin.from("source_chunks").select("is_active").eq("id", linked.chunk_id).single()) as { is_active: boolean }).is_active).toBe(false);
    const after = await retrieveEvidence(question, personId);
    expect(after.evidence.some((item) => item.kind === "claim" && item.claimId === admittedId)).toBe(false);
  }, 30_000);

  it("enforces leases, cooldowns, reservation concurrency and daily limits across requests", async () => {
    const oldReservations = required(await supabaseAdmin.from("demand_budget_reservations").select("id").eq("status", "reserved")) as Array<{ id: string }>;
    for (const old of oldReservations) await settleZero(old.id);
    const need = hash(randomUUID());
    const owner = randomUUID();
    const first = required(await supabaseAdmin.rpc("claim_demand_research_need", { p_need_id: need, p_personality_id: personId, p_owner: owner }));
    expect(first).toBe("acquired");
    const active = required(await supabaseAdmin.rpc("claim_demand_research_need", { p_need_id: need, p_personality_id: personId, p_owner: randomUUID() }));
    expect(active).toBe("active");
    expect(required(await supabaseAdmin.rpc("finish_demand_research_need", { p_need_id: need, p_owner: owner, p_status: "failed",
      p_search_calls: 0, p_outcome: { errorCategory: "TEMPORARY" }, p_cooldown_seconds: 120 }))).toBe(true);
    expect(required(await supabaseAdmin.rpc("claim_demand_research_need", { p_need_id: need, p_personality_id: personId, p_owner: randomUUID() }))).toBe("cooldown");
    required(await supabaseAdmin.from("demand_research_needs").update({ retry_after: new Date(0).toISOString() }).eq("need_id", need));
    expect(required(await supabaseAdmin.rpc("claim_demand_research_need", { p_need_id: need, p_personality_id: personId, p_owner: randomUUID() }))).toBe("acquired");
    required(await supabaseAdmin.from("demand_research_needs").update({ lease_until: new Date(0).toISOString() }).eq("need_id", need));
    expect(required(await supabaseAdmin.rpc("claim_demand_research_need", { p_need_id: need, p_personality_id: personId, p_owner: randomUUID() }))).toBe("acquired");
    const policy = required(await supabaseAdmin.from("demand_budget_policy").select("*").eq("id", true).single()) as {
      request_limit_micro: number; daily_limit_micro: number; monthly_limit_micro: number; max_concurrent_jobs: number };
    try {
      expect((await reserveResearchBudget(randomUUID(), 9)).status).toBe("call_limit");
      required(await supabaseAdmin.from("demand_budget_policy").update({ max_concurrent_jobs: 1 }).eq("id", true));
      const [a, b] = await Promise.all([reserveResearchBudget(randomUUID(), 1), reserveResearchBudget(randomUUID(), 1)]);
      expect([a.status, b.status].sort()).toEqual(["concurrency_limit", "reserved"]);
      const winner = a.status === "reserved" ? a : b;
      expect(winner.reservedMicro).toBe(policy.request_limit_micro);
      await settleZero(winner.reservationId!);
      const todayUtc = new Date();
      todayUtc.setUTCHours(0, 0, 0, 0);
      const rows = required(await supabaseAdmin.from("demand_budget_reservations").select("status,reserved_micro,actual_micro")
        .gte("created_at", todayUtc.toISOString())) as
        Array<{ status: string; reserved_micro: number; actual_micro: number | null }>;
      const spend = rows.reduce((sum, row) => sum + (row.status === "reserved" ? row.reserved_micro : row.actual_micro || 0), 0);
      required(await supabaseAdmin.from("demand_budget_policy").update({ daily_limit_micro: spend + policy.request_limit_micro,
        monthly_limit_micro: Math.max(policy.monthly_limit_micro, spend + 2 * policy.request_limit_micro), max_concurrent_jobs: 4 }).eq("id", true));
      const dailyWinner = await reserveResearchBudget(randomUUID(), 1);
      expect(dailyWinner.status).toBe("reserved");
      expect((await reserveResearchBudget(randomUUID(), 1)).status).toBe("daily_limit");
      await settleZero(dailyWinner.reservationId!);
      const monthUtc = new Date();
      monthUtc.setUTCDate(1);
      monthUtc.setUTCHours(0, 0, 0, 0);
      const monthlyRows = required(await supabaseAdmin.from("demand_budget_reservations").select("status,reserved_micro,actual_micro")
        .gte("created_at", monthUtc.toISOString())) as
        Array<{ status: string; reserved_micro: number; actual_micro: number | null }>;
      const monthSpend = monthlyRows.reduce((sum, row) => sum + (row.status === "reserved" ? row.reserved_micro : row.actual_micro || 0), 0);
      required(await supabaseAdmin.from("demand_budget_policy").update({ daily_limit_micro: Math.max(policy.daily_limit_micro, monthSpend + 2 * policy.request_limit_micro),
        monthly_limit_micro: monthSpend + policy.request_limit_micro }).eq("id", true));
      const monthlyWinner = await reserveResearchBudget(randomUUID(), 1);
      expect(monthlyWinner.status).toBe("reserved");
      expect((await reserveResearchBudget(randomUUID(), 1)).status).toBe("monthly_limit");
      required(await supabaseAdmin.from("demand_budget_reservations").update({ expires_at: new Date(0).toISOString() }).eq("id", monthlyWinner.reservationId!));
      required(await supabaseAdmin.from("demand_budget_policy").update({ monthly_limit_micro: policy.monthly_limit_micro }).eq("id", true));
      expect((await reserveResearchBudget(randomUUID(), 1)).status).toBe("reserved");
      expect(required(await supabaseAdmin.from("demand_budget_reservations").select("status,settlement_reason")
        .eq("id", monthlyWinner.reservationId!).single())).toMatchObject({ status: "settled", settlement_reason: "expired_unreconciled" });
    } finally {
      required(await supabaseAdmin.from("demand_budget_policy").update({ daily_limit_micro: policy.daily_limit_micro,
        monthly_limit_micro: policy.monthly_limit_micro, max_concurrent_jobs: policy.max_concurrent_jobs }).eq("id", true));
    }
  }, 30_000);

  it("denies anonymous and authenticated RPC and table access", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.DCF_LOCAL_ANON_KEY!);
    expect((await anon.rpc("reserve_demand_budget", { p_request_id: randomUUID(), p_planned_calls: 1 })).error).not.toBeNull();
    const policy = await anon.from("demand_budget_policy").select("*");
    expect(policy.error !== null || !policy.data?.length).toBe(true);
    expect((await anon.from("demand_budget_policy").insert({ id: true })).error).not.toBeNull();
    const jwt = (part: object) => Buffer.from(JSON.stringify(part)).toString("base64url");
    const tokenBody = `${jwt({ alg: "HS256", typ: "JWT" })}.${jwt({ role: "authenticated", aud: "authenticated",
      sub: randomUUID(), exp: Math.floor(Date.now() / 1000) + 300 })}`;
    const token = `${tokenBody}.${createHmac("sha256", process.env.DCF_LOCAL_JWT_SECRET!).update(tokenBody).digest("base64url")}`;
    const authenticated = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.DCF_LOCAL_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } });
    expect((await authenticated.rpc("admit_demand_verified_claim", { p_admission: admission() })).error).not.toBeNull();
    const ledger = await authenticated.from("demand_verification_decisions").select("id");
    expect(ledger.error !== null || !ledger.data?.length).toBe(true);
  });
});
