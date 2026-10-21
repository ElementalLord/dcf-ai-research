import { describe, expect, it } from "vitest";
import { answerQuestion } from "@/lib/corpus/answer";

const enabled = process.env.DCF_LOCAL_DB_VALIDATION === "true";
if (enabled && !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || ""))
  throw new Error("Launch answer inspection requires loopback Supabase");

(enabled ? describe : describe.skip)("strict staging answer inspection", () => {
  it("prints local answers and citation provenance for review", async () => {
    expect(process.env.EVIDENCE_POLICY_MODE).toBe("strict");
    for (const [personalityId, question] of [
      ["2abfe46e-6b67-4fba-a6c1-e5864f69bf35", "What honorary award did Satyajit Ray receive?"],
      ["9ef04ec3-7bf1-4210-a951-1d6da7b2fc99", "How is Ramakrishna’s vision of Kali described in the Gospel?"],
      ["32e53e02-71cd-4232-9d33-247d37f039a7", "How do scholars date Shankara?"],
    ] as const) {
      const result = await answerQuestion(question, personalityId);
      console.log(JSON.stringify({ question, status: result.status, answer: result.answer,
        citations: result.citations.map((citation) => ({ claimId: citation.claimId, url: citation.url, excerpt: citation.excerpt })),
        researchCalls: result.debug.webSearchCalls, localSufficient: result.debug.localEvidenceSufficient,
        sufficiencyReason: result.debug.localEvidenceSufficiencyReason, coverage: result.debug.coverageStatus }));
      expect(result.debug.webSearchCalls || 0).toBe(0);
      if (question.includes("vision of Kali")) expect(result.status).toBe("abstained");
      for (const citation of result.citations) expect(citation.url).toMatch(/^https:\/\//);
    }
  }, 30_000);
});
