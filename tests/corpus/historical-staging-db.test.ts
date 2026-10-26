import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { retrieveEvidence } from "@/lib/corpus/retrieval";
import { answerQuestion } from "@/lib/corpus/answer";

const enabled = process.env.DCF_LOCAL_DB_VALIDATION === "true";
if (enabled && !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || ""))
  throw new Error("Historical staging validation requires a loopback Supabase API URL");

const suite = enabled ? describe : describe.skip;
const ledger = JSON.parse(`[${readFileSync(join(process.cwd(), "artifacts/corpus-verification/decision-ledger.jsonl"), "utf8")
  .trim().split("\n").join(",")}]`) as Array<{
    claim_id: string; personality: string; personality_id: string; decision: string | null;
  }>;
const citationReview = JSON.parse(readFileSync(join(process.cwd(), "artifacts/corpus-verification/citation-hold-adjudication.json"), "utf8")) as {
  claims: Array<{ claim_id: string; personality: string; citation_resolution: string }>;
};

suite("historical corpus strict staging", () => {
  it("excludes every quarantined citation claim from strict Ask and profile retrieval", async () => {
    expect(process.env.EVIDENCE_POLICY_MODE).toBe("strict");
    const quarantined = new Set(citationReview.claims.filter((row) => row.citation_resolution === "QUARANTINED")
      .map((row) => row.claim_id));
    expect(quarantined.size).toBe(44);
    for (const personality of new Set(citationReview.claims.map((row) => row.personality))) {
      const personalityId = ledger.find((row) => row.personality === personality)?.personality_id;
      expect(personalityId).toBeTruthy();
      const result = await retrieveEvidence(`Who was ${personality}?`, personalityId!);
      for (const item of result.evidence) {
        if (item.kind === "claim") expect(quarantined.has(item.claimId)).toBe(false);
      }
    }
    const rayId = ledger.find((row) => row.personality === "Satyajit Ray")!.personality_id;
    const answer = await answerQuestion("What honorary award did Satyajit Ray receive?", rayId);
    expect(answer.citations.some((citation) => citation.claimId && quarantined.has(citation.claimId))).toBe(false);
  }, 30_000);

  it("retrieves newly reviewed personalities without pending or excluded IDs", async () => {
    for (const [name, question] of [
      ["Vishvamitra", "What does the Bala Kanda say Vishvamitra taught Rama?"],
      ["Yajnavalkya", "What does the Brihadaranyaka Upanishad say Yajnavalkya told Gargi?"],
      ["Rani Lakshmibai of Jhansi", "What did Lakshmibai ask the East India Company to recognise?"],
      ["Ramakrishna Paramahamsa", "How do scholars describe Ramakrishna’s teaching about religions?"],
    ] as const) {
      const rows = ledger.filter((row) => row.personality === name);
      const retained = new Set(rows.filter((row) => row.decision === "APPROVE" || row.decision === "REVISE AND APPROVE")
        .map((row) => row.claim_id));
      const result = await retrieveEvidence(question, rows[0].personality_id);
      const claims = result.evidence.filter((item) => item.kind === "claim");
      expect(claims.length).toBeGreaterThan(0);
      for (const item of claims) {
        if (item.kind === "claim") expect(retained.has(item.claimId)).toBe(true);
      }
    }
  }, 30_000);

  it("retrieves only reviewed Shankara claims for a profile and a focused Ask answer", async () => {
    const rows = ledger.filter((row) => row.personality === "Adi Shankaracharya");
    const personalityId = rows[0]?.personality_id;
    expect(personalityId).toBeTruthy();
    const retained = new Set(rows.filter((row) => row.decision === "APPROVE" || row.decision === "REVISE AND APPROVE")
      .map((row) => row.claim_id));
    const excluded = new Set(rows.filter((row) => row.decision === "REMOVE FROM ACTIVE CORPUS").map((row) => row.claim_id));
    const profile = await retrieveEvidence("Who was Adi Shankaracharya?", personalityId);
    const profileClaims = profile.evidence.filter((item) => item.kind === "claim");
    expect(profileClaims.length).toBeGreaterThan(0);
    for (const item of profileClaims) {
      if (item.kind !== "claim") continue;
      expect(retained.has(item.claimId)).toBe(true);
      expect(excluded.has(item.claimId)).toBe(false);
    }
    const answer = await answerQuestion("How do scholars date Shankara?", personalityId);
    expect(answer.status).not.toBe("abstained");
    expect(answer.citations.length).toBeGreaterThan(0);
    for (const citation of answer.citations) {
      expect(citation.url).toMatch(/^https:\/\//);
      expect(citation.excerpt.length).toBeGreaterThan(20);
      if (citation.claimId) expect(retained.has(citation.claimId)).toBe(true);
    }
  }, 30_000);
});
