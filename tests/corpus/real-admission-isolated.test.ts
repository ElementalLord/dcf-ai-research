import { describe, expect, it } from "vitest";
import { executeDemandResearch } from "@/lib/live-research/on-demand-engine";
import { productionResearchDependencies } from "@/lib/live-research/on-demand-adapter";
import { productionAdmissionStore, productionVerificationProvider, verifyDemandKnowledge } from "@/lib/live-research/knowledge-verification";
import { retrieveEvidence } from "@/lib/corpus/retrieval";
import { resolveQuestion } from "@/lib/ask/question-resolution";
import { answerQuestion } from "@/lib/corpus/answer";
import type { EvidenceGapRequest } from "@/lib/ask/question-resolution";

const enabled = process.env.DCF_REAL_ADMISSION_VALIDATION === "true";
if (enabled && !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || ""))
  throw new Error("Real admission validation requires loopback Supabase");

(enabled ? describe : describe.skip)("real licensed publisher admission and reuse in isolated Supabase", () => {
  it("admits an independently verified historical fact and answers from the saved claim", async () => {
    const personId = "6b9a4d86-8330-4256-a749-4daf0f596128";
    const personName = "C. V. Raman";
    const question = "In what year was C. V. Raman awarded the Nobel Prize in Physics?";
    process.env.DEMAND_VERIFICATION_SHADOW_ENABLED = "true";
    const urls = [
      "https://www.cambridge.org/core/journals/british-journal-for-the-history-of-science/article/imperialism-in-the-academy-the-royal-society-cv-raman-and-the-indian-academy-of-sciences-19341970/B1E49AAB9478A3673518A4604065E43C",
      "https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2025.1577702/full",
    ];
    const before = await retrieveEvidence(question, personId);
    const request: EvidenceGapRequest = { needId: "isolated-real-raman-nobel-1930", personalityId: personId,
      personalityName: personName, normalizedIntent: "Raman Nobel Prize in Physics year", category: "NARROW_FACT",
      gaps: [{ id: "isolated-real-raman-nobel-year", requirementKey: "date", type: "chronology",
        requirement: "The year Raman received the Nobel Prize in Physics", subjectId: personId,
        topic: "C. V. Raman Nobel Prize in Physics year", suitableSources: ["scholarly publisher"],
        completion: "The original sources directly state the year", contested: false }],
      existingEvidenceIds: [], maxExternalSearches: 1 };
    const deps = { ...productionResearchDependencies(),
      provider: { name: "isolated-discovery", isConfigured: () => true,
        async search() { return urls.map((url, index) => ({ url,
          title: index === 0 ? "Imperialism in the academy: the Royal Society, C.V. Raman and the Indian Academy of Sciences"
            : "Non-invasive applications of Raman spectroscopy in assisted reproduction",
          sourceProvider: "fixture" })); } },
      async claimNeed() { return "acquired" as const; }, async finishNeed() {}, reserveBudget: undefined };
    const research = await executeDemandResearch(request, question, before.evidence, [personName, "Raman"], deps);
    expect(research.findings).toHaveLength(2);
    expect(research.findings.every((finding) => finding.verificationReady && finding.retention === "license_candidate")).toBe(true);
    const verified = await verifyDemandKnowledge(request, research, { provider: productionVerificationProvider(),
      store: productionAdmissionStore(), enabled: true });
    expect(verified.decisions.some((decision) => ["admitted", "duplicate"].includes(decision.outcome) && decision.claimId)).toBe(true);
    const after = await retrieveEvidence(question, personId);
    const admittedIds = verified.decisions.filter((decision) => ["admitted", "duplicate"].includes(decision.outcome)).map((decision) => decision.claimId);
    expect(after.evidence.some((item) => item.kind === "claim" && admittedIds.includes(item.claimId))).toBe(true);
    const resolved = resolveQuestion({ question, personalityId: personId, personalityName: personName,
      personalityAliases: after.personalityAliases, termAliases: after.termAliases,
      allParameters: after.allParameters, evidence: after.evidence, policyMode: "strict", researchAvailable: true });
    expect(resolved.researchRequest).toBeNull();
    process.env.DEMAND_RESEARCH_ENABLED = "false";
    process.env.SYNTHESIS_DISABLED = "true";
    process.env.EMBEDDINGS_DISABLED = "true";
    const answer = await answerQuestion(question, personId);
    expect(answer.debug.webSearchCalls).toBe(0);
    expect(answer.citations.some((citation) => Boolean(citation.url && urls.includes(citation.url)))).toBe(true);
  }, 120_000);
});
