import { describe, expect, it } from "vitest";
import saved from "../fixtures/raman-demand-live.json";
import { citedAnswerAddressesTarget, passageAddressesTarget } from "@/lib/ask/target-support";
import { assessPassageSupport } from "@/lib/live-research/research-quality";
import { hasExplicitRetentionRights } from "@/lib/live-research/retention-rights";
import type { Citation, RetrievedClaim, RetrievedPassage } from "@/lib/corpus/types";

const claim = (text: string, excerpt: string): RetrievedClaim => ({ kind: "claim", id: "claim", claimId: "claim", text,
  claimKind: "established_fact", certainty: "high", approvalOrigin: "corpus_evidence_review", evidenceType: "historical_fact",
  parameterName: null, fieldLabel: null, sourceTitle: "Institutional record", sourceAuthor: null, sourceInstitution: null,
  sourceUrl: "https://example.org/record", sourceType: "institutional", pageOrSection: "record", evidenceExcerpt: excerpt, chunkId: null,
  textualLayer: null });
const citation = (id = "C1"): Citation => ({ id, kind: "approved_claim", title: "Institutional record", author: null,
  institution: null, url: "https://example.org/record", sourceType: "institutional", pageOrSection: "record",
  textualLayer: null, excerpt: "record" });

describe("final named-target citation gate", () => {
  it("reproduces the saved Raman failure and refuses its unrelated IISc citation", () => {
    const item = claim(saved.unrelatedClaim, saved.unrelatedExcerpt);
    expect(citedAnswerAddressesTarget(saved.question, `${saved.unrelatedClaim} [C1]`, [item], [citation()],
      ["C. V. Raman", "Raman"])).toBe(false);
    expect(passageAddressesTarget(saved.question, saved.passage, ["C. V. Raman", "Raman"])).toBe(false);
    expect(["PARTIAL", "RELATED"]).toContain(assessPassageSupport(saved.passage, saved.question,
      "C. V. Raman", ["Raman", "Sir Chandrasekhara Venkata Raman"]).level);
    expect(hasExplicitRetentionRights(saved.rightsDeclaration)).toBe(false);
  });

  it("requires the cited passage to identify a second named award and its date", () => {
    const question = "When was Anika Sen awarded the Aurora Medal?";
    const wrong = claim("Anika Sen was awarded the Comet Medal in 1938.",
      "The register records that Anika Sen was awarded the Comet Medal in 1938.");
    expect(citedAnswerAddressesTarget(question, "She received the Aurora Medal in 1938. [C1]", [wrong], [citation()],
      ["Anika Sen"])).toBe(false);
    const right = claim("Anika Sen was awarded the Aurora Medal in 1928.",
      "The register records that Anika Sen was awarded the Aurora Medal in 1928.");
    expect(citedAnswerAddressesTarget(question, "She received the Aurora Medal in 1928. [C1]", [right], [citation()],
      ["Anika Sen"])).toBe(true);
    expect(citedAnswerAddressesTarget(question, "She received the Aurora Medal in 1938. [C1]", [right], [citation()],
      ["Anika Sen"])).toBe(false);
    const mixed = claim("Anika Sen was awarded the Aurora Medal in 1928.",
      "Anika Sen was awarded the Aurora Medal in 1928. The university was founded in 1938.");
    expect(citedAnswerAddressesTarget(question, "She received the Aurora Medal in 1938. [C1]", [mixed], [citation()],
      ["Anika Sen"])).toBe(false);
  });

  it("keeps initials with the dated award sentence", () => {
    expect(passageAddressesTarget(saved.question,
      "On 10 December 1930, C.V. Raman took the stage to receive the Nobel Prize in Physics.",
      ["C. V. Raman", "Raman"])).toBe(true);
  });

  it("requires a cited original passage, not merely a claim or source title", () => {
    const question = "When was Anika Sen awarded the Aurora Medal?";
    const unsupported = claim("Anika Sen was awarded the Aurora Medal in 1928.", "Anika Sen worked at the university in 1928.");
    expect(citedAnswerAddressesTarget(question, "Anika Sen won the Aurora Medal in 1928. [C1]",
      [unsupported], [citation()], ["Anika Sen"])).toBe(false);
    const live: RetrievedPassage = { kind: "passage", id: "p", chunkId: "p", sourceId: "s",
      text: "Anika Sen was awarded the Aurora Medal in 1928.", sectionTitle: null, pageOrSection: "register",
      textualLayer: "institutional_record", sourceTitle: "Award register", sourceAuthor: null, sourceInstitution: "Archive",
      sourceUrl: "https://example.org/award", sourceType: "institutional", sourceStatus: "discovered" };
    expect(citedAnswerAddressesTarget(question, "Anika Sen won the Aurora Medal in 1928. [S1]",
      [live], [citation("S1")], ["Anika Sen"])).toBe(true);
  });

  it("requires the requested event and date in institution and life-date questions", () => {
    expect(passageAddressesTarget("When did Anika Sen join Aurora University?",
      "Anika Sen visited Aurora University in 1928.", ["Anika Sen"])).toBe(false);
    expect(passageAddressesTarget("When did Anika Sen join Aurora University?",
      "Anika Sen joined Aurora University in 1928.", ["Anika Sen"])).toBe(true);
    expect(passageAddressesTarget("When did Anika Sen die?",
      "Anika Sen received a medal in 1938.", ["Anika Sen"])).toBe(false);
    expect(passageAddressesTarget("When did Anika Sen die?",
      "Anika Sen died in 1948.", ["Anika Sen"])).toBe(true);
  });

  it("checks every cited passage in a grouped citation", () => {
    const question = "When was Anika Sen awarded the Aurora Medal?";
    const right = claim("Anika Sen was awarded the Aurora Medal in 1928.",
      "Anika Sen was awarded the Aurora Medal in 1928.");
    const wrong = claim("Anika Sen joined the university in 1928.", "Anika Sen joined the university in 1928.");
    expect(citedAnswerAddressesTarget(question, "1928. [C1, C2]", [right, wrong], [citation(), citation("C2")],
      ["Anika Sen"])).toBe(false);
  });

  it("recognizes only explicit retention declarations", () => {
    expect(hasExplicitRetentionRights("open access")).toBe(false);
    expect(hasExplicitRetentionRights("publicly readable")).toBe(false);
    expect(hasExplicitRetentionRights("not public domain")).toBe(false);
    expect(hasExplicitRetentionRights("https://creativecommons.org/licenses/by/4.0/")).toBe(true);
  });
});
