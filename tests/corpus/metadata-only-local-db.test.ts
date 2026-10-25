import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { retrieveEvidence } from "@/lib/corpus/retrieval";
import { resolveQuestion } from "@/lib/ask/question-resolution";
import { answerQuestion } from "@/lib/corpus/answer";
import { productionAdmissionStore, verifyDemandKnowledge } from "@/lib/live-research/knowledge-verification";
import type { EvidenceGapRequest } from "@/lib/ask/question-resolution";
import type { OnDemandResearchResult, ResearchFinding } from "@/lib/live-research/on-demand-engine";

const enabled = process.env.DCF_LOCAL_DB_VALIDATION === "true";
if (enabled && !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || ""))
  throw new Error("Metadata admission tests require loopback Supabase");
const suite = enabled ? describe : describe.skip;
const personId = randomUUID();
const categoryId = randomUUID();
const personName = `Mira ${personId.slice(0, 8)} Rao`;
const claimText = `${personName} was awarded the Meridian Medal in 1931.`;
const question = `What year was ${personName} awarded the Meridian Medal?`;
const url = `https://records.example.edu/meridian/${personId}`;
const title = "Meridian Medal register";
const publisher = "Example Institute Records";
const locator = "Register entry 1931, row 14";
const hash = createHash("sha256").update(`${personId}:${claimText.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`).digest("hex");
const ok = <T>(result: { data: T; error: { message: string } | null }): T => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const payload = (sourceUrl = url) => ({ personality_id: personId, claim_text: claimText, claim_hash: hash,
  epistemic_type: "HISTORICAL_FACT", classifier_version: "local-test", contract_version: "local-test",
  contract_status: "SUPPORTED", policy_version: "demand-admission/1", storage_mode: "metadata_only",
  category: "official_record_fact", official_issuer: true, independent_documents: true,
  research_request_id: randomUUID(), research_work_id: "local-test",
  sources: [{ url: sourceUrl, title, author: "Registrar", publisher, publication_date: "1931",
    evidence_type: "institutional_record", work_key: `register:${personId}`, locator, accessed_at: new Date().toISOString() }] });

suite("metadata-only verified admission against isolated Supabase", () => {
  let claimId = "";
  afterAll(async () => {
    ok(await supabaseAdmin.from("personalities").delete().eq("id", personId));
    ok(await supabaseAdmin.from("categories").delete().eq("id", categoryId));
    ok(await supabaseAdmin.from("sources").delete().eq("url", url));
    ok(await supabaseAdmin.from("metadata_admission_permissions").delete().eq("source_url", url));
  });

  it("requires a reviewed exact URL, admits metadata atomically, displays Resources data, and reuses the claim", async () => {
    ok(await supabaseAdmin.from("personalities").insert({ id: personId, canonical_name: personName, research_status: "approved" }));
    ok(await supabaseAdmin.from("categories").insert({ id: categoryId, slug: `metadata-local-${categoryId}`, name: "Metadata local test" }));
    ok(await supabaseAdmin.from("personality_categories").insert({ personality_id: personId, category_id: categoryId, is_primary: true }));
    const noTerms = await supabaseAdmin.rpc("admit_metadata_verified_claim", { p_admission: payload() });
    expect(noTerms.error?.message).toContain("terms are not approved");
    ok(await supabaseAdmin.from("metadata_admission_permissions").insert({ source_url: url, publisher,
      terms_url: "https://records.example.edu/terms", decision_basis: "Reviewed terms permit factual metadata citation without stored source text.",
      reviewed_by: "isolated-test-reviewer", reviewed_at: new Date(Date.now() - 60_000).toISOString(), is_active: true }));
    const before = await retrieveEvidence(question, personId);
    expect(before.evidence.some(item => item.kind === "claim" && item.text === claimText)).toBe(false);
    const sourceText = `The 1931 register awarded ${personName} its Meridian Medal.`;
    const sourceFinding: ResearchFinding = { source: { url, sourceId: null, publisherDomain: new URL(url).hostname,
      retrievedAt: new Date().toISOString(), title, author: "Registrar", publisher, publicationDate: "1931",
      journal: null, doi: null, isbn: null, evidenceType: "institutional_record", workKey: `register:${personId}`,
      provenanceComplete: true }, passage: { text: sourceText, locator, supportLevel: "EXACT", supportReason: "Direct date" },
      relation: "supports", retention: "transient_only", rightsDeclaration: null, citeableNow: true, verificationReady: false };
    const research: OnDemandResearchResult = { requestId: randomUUID(), needId: "fixture", workId: "fixture",
      status: "complete", attempted: true, candidates: [], findings: [sourceFinding], passages: [], unresolvedGaps: [],
      sufficientForVerification: false, citeableNow: true, usage: { searchCalls: 1, sourceFetches: 1, modelCalls: 0,
        provider: "fixture", errorCategory: null } };
    const provider = { async extract() { return [{ proposition: claimText, type: "HISTORICAL_FACT" as const,
      evidenceIndexes: [0], context: null, period: "1931", qualification: null, category: "official_record_fact" as const }]; },
      async assess() { return { support: "SUPPORTED" as const, supportingIndexes: [0], equivalentExisting: false,
        conflictsExisting: false, materialContradiction: false, exactEntities: true, exactDatesAndUnits: true,
        qualifiersPreserved: true, officialIssuer: true, independentDocuments: true, reason: "Direct register entry" }; } };
    const verified = await verifyDemandKnowledge({ personalityId: personId, personalityName: personName } as EvidenceGapRequest,
      research, { provider, store: productionAdmissionStore(), enabled: true });
    expect(verified.decisions[0], JSON.stringify(verified.decisions[0])).toMatchObject({ outcome: "admitted" });
    claimId = verified.decisions[0].claimId!;
    const duplicate = ok(await supabaseAdmin.rpc("admit_metadata_verified_claim", { p_admission: payload() })) as { claim_id: string; created: boolean };
    expect(duplicate).toEqual({ claim_id: claimId, created: false });
    const resource = ok(await supabaseAdmin.from("claims").select("approval_metadata,claim_sources(evidence_excerpt,page_or_section,sources(title,url,source_status)),claim_chunks(chunk_id),metadata_claim_evidence(locator,accessed_at,validity_status)").eq("id", claimId).single()) as {
      approval_metadata: { storage_mode: string }; claim_sources: Array<{ evidence_excerpt: string | null; page_or_section: string; sources: { title: string; url: string; source_status: string } }>;
      claim_chunks: unknown[]; metadata_claim_evidence: Array<{ locator: string; accessed_at: string; validity_status: string }> };
    expect(resource.approval_metadata.storage_mode).toBe("metadata_only");
    expect(resource.claim_sources[0]).toMatchObject({ evidence_excerpt: null, page_or_section: locator,
      sources: { title, url, source_status: "approved" } });
    expect(resource.claim_chunks).toHaveLength(0);
    expect(resource.metadata_claim_evidence[0]).toMatchObject({ locator, validity_status: "valid" });
    const second = await retrieveEvidence(question, personId);
    const reused = second.evidence.find(item => item.kind === "claim" && item.text === claimText);
    expect(reused).toMatchObject({ storageMode: "metadata_only", sourceUrl: url, pageOrSection: locator, evidenceExcerpt: null });
    const resolution = resolveQuestion({ question, personalityId: personId, personalityName: personName,
      personalityAliases: second.personalityAliases, termAliases: second.termAliases,
      allParameters: second.allParameters, evidence: second.evidence, policyMode: "strict", researchAvailable: true });
    expect(resolution.researchRequest).toBeNull();
    process.env.SYNTHESIS_DISABLED = "true";
    const answer = await answerQuestion(question, personId);
    expect(answer.debug.webSearchCalls).toBe(0);
    expect(answer.citations.some(citation => citation.storageMode === "metadata_only" && citation.url === url && citation.pageOrSection === locator && !citation.excerpt)).toBe(true);
    const source = ok(await supabaseAdmin.from("sources").select("id,rights_or_access_note,metadata").eq("url", url).single()) as { id: string; rights_or_access_note: string; metadata: unknown };
    const chunks = ok(await supabaseAdmin.from("source_chunks").select("id").eq("source_id", source.id));
    const audit = ok(await supabaseAdmin.from("demand_verification_decisions").select("reason_codes,source_work_keys").eq("claim_id", claimId));
    expect(chunks).toHaveLength(0);
    expect(JSON.stringify({ resource, source, chunks, audit, answer })).not.toContain(sourceText);
  }, 30_000);

  it("rejects restricted URLs and source text in the admission payload", async () => {
    const differentClaim = `${personName} was awarded the Nova Medal in 1931.`;
    const distinct = { ...payload(`${url}/restricted`), claim_text: differentClaim,
      claim_hash: createHash("sha256").update(`${personId}:${differentClaim.toLowerCase()}`).digest("hex") };
    const restricted = await supabaseAdmin.rpc("admit_metadata_verified_claim", { p_admission: distinct });
    expect(restricted.error?.message).toContain("terms are not approved");
    const copied = { ...distinct, sources: [{ ...distinct.sources[0], url }] } as typeof distinct & { sources: Array<Record<string, unknown>> };
    copied.sources[0].excerpt = "Unlicensed publisher passage must never be stored.";
    const result = await supabaseAdmin.rpc("admit_metadata_verified_claim", { p_admission: copied });
    expect(result.error?.message).toContain("unapproved fields");
  });

  it("suspends a claim when source validity cannot be established", async () => {
    expect(ok(await supabaseAdmin.rpc("suspend_metadata_verified_claim", { p_claim_id: claimId, p_reason: "inaccessible" }))).toBe(true);
    const evidence = await retrieveEvidence(question, personId);
    expect(evidence.evidence.some(item => item.kind === "claim" && item.claimId === claimId)).toBe(false);
    const rows = ok(await supabaseAdmin.from("metadata_claim_validity_events").select("reason").eq("claim_id", claimId));
    expect(rows).toEqual([{ reason: "inaccessible" }]);
  });
});
