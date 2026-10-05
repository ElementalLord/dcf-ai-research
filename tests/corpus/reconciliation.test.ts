import { describe, expect, it } from "vitest";
import { parseLocator } from "@/lib/evidence-completion/locator";
import { assessCitedPassage, excludedStems, matchedWords, nameStems, stems, termForms } from "@/lib/evidence-completion/passage-match";
import { atomicPropositions, isAttributional, nearDuplicate, reconcile, standaloneClaim } from "@/lib/reconciliation/analysis";
import { atomicChildPlan, childEvidenceType, existingEquivalent, type ParentClaim } from "@/lib/reconciliation/lineage";

const exclude = excludedStems(["Ada Example"], ["Fixture Chronicle"]);
const chapter = (text: string) => ({ text, locators: [parseLocator("Fixture Chronicle, Kanda 1, Sarga 19")] });

describe("A. title words are roles, not names", () => {
  it("treats King/Sage/Teacher as substantive words while keeping real names as names", () => {
    const names = nameStems("The Ramayana presents her asking King Dasharatha and Sage Vashishta for help.");
    expect(names.has([...stems("Dasharatha")][0])).toBe(true);
    expect(names.has("king")).toBe(false);
    expect(names.has("sage")).toBe(false);
  });

  it("lets a role-bearing factual claim reach EXACT when the action is stated", () => {
    const passage = chapter("Sage Vishvamitra asks King Dasharatha to send Rama to protect the Vedic ritual that is being conducted by him.");
    const result = assessCitedPassage({ claimText: "Vishvamitra asks King Dasharatha to send Rama to protect his ritual.",
      requested: parseLocator("1.19", "Ramayana"), identity: "same_work", passage, exclude: excludedStems(["Vishvamitra"], ["Valmiki Ramayana"]) });
    expect(result.level).toBe("EXACT");
  });
});

describe("B. archaic translation wording", () => {
  it("normalizes archaic verb forms deterministically", () => {
    expect(matchedWords(termForms("he comes and speaks"), stems("he cometh and speaketh"))).toHaveLength(2);
    // Irregular past forms are morphology, so they count as lexical support.
    expect(matchedWords(termForms("she gives the prize and teaches the class"), stems("she gave the prize and taught the class"))).toHaveLength(4);
  });

  it("proposes LIKELY_DIRECT_SUPPORT (never automatic EXACT) for a translation-variant paraphrase at the exact locator", () => {
    const passage = { text: "List quickly, Sisters, to the bard who cometh to you from far away with car and wagon. Bow lowly down; be easy to be traversed: stay, Rivers, with your floods below our axles.", locators: [parseLocator("3.33.9", "Rigveda")] };
    const result = reconcile({ claimText: "The speaker asks the rivers to lower themselves so the wagons can cross.", requested: parseLocator("RV 3.33.9"), identity: "same_work",
      passage, exclude: excludedStems(["Vishvamitra"], ["Rigveda"]), subjectName: "Vishvamitra", aliases: [] });
    expect(result.assessment.level).not.toBe("EXACT");
    expect(result.reasons).toContain("TRANSLATION_VARIANT");
    expect(result.proposals[0]).toMatchObject({ kind: "confirm_exact", deterministic: false });
  });
});

describe("C. compound claim with one supported proposition", () => {
  it("splits the claim and proposes only the supported proposition, verbatim", () => {
    const passage = chapter("Ada Example measured lattice damping at liquid helium temperature in 1931.");
    const claim = "Ada Example measured lattice damping at liquid helium temperature in 1931; she later founded the national cryogenics laboratory.";
    const result = reconcile({ claimText: claim, requested: parseLocator("p. 214"), identity: "same_source",
      passage: { text: passage.text, locators: [parseLocator("p. 214")] }, exclude, subjectName: "Ada Example", aliases: ["A. Example"] });
    expect(result.reasons).toEqual(expect.arrayContaining(["COMPOUND_CLAIM", "PARTIAL_PROPOSITION_SUPPORT"]));
    expect(result.proposals).toEqual([expect.objectContaining({ kind: "atomic_claim", deterministic: true,
      text: "Ada Example measured lattice damping at liquid helium temperature in 1931." })]);
  });
});

describe("D. interpretive claims stay below EXACT", () => {
  it("separates the factual core from its interpretation and keeps the interpretation out of the proposal", () => {
    const parts = atomicPropositions("The archive shows that Ada Example refused the prize, making her a symbol of scientific independence.");
    expect(parts).toEqual([{ text: "Ada Example refused the prize", kind: "factual" },
      { text: "The archive shows that Ada Example refused the prize, making her a symbol of scientific independence.", kind: "interpretive" }]);
    const passage = { text: "In the letter of 1932, Ada Example refused the prize offered by the academy.", locators: [parseLocator("p. 88")] };
    const result = reconcile({ claimText: "The archive shows that Ada Example refused the prize offered by the academy, making her a symbol of scientific independence.",
      requested: parseLocator("p. 88"), identity: "same_source", passage, exclude, subjectName: "Ada Example", aliases: [] });
    expect(result.reasons).toContain("INTERPRETIVE_CLAIM");
    expect(result.assessment.level).not.toBe("EXACT");
    expect(result.proposals.map((proposal) => proposal.text)).toEqual(["Ada Example refused the prize offered by the academy."]);
  });
});

describe("D2. epistemic guardrails and framed facts", () => {
  it("keeps the narrated fact and sets the guardrail sentence aside", () => {
    expect(atomicPropositions("The chronicle describes smoke rising from the tower; this is a literary image of siege, not an empirical record.")).toEqual([
      { text: "The chronicle describes smoke rising from the tower", kind: "factual" },
      { text: "this is a literary image of siege, not an empirical record.", kind: "interpretive" }]);
  });
  it("extracts the fact carried by a framing verb or a subordinate clause", () => {
    expect(atomicPropositions("Chapter 4 portrays generosity under hardship when Ada Example gives away her entire prize to the school.")[0])
      .toEqual({ text: "Ada Example gives away her entire prize to the school", kind: "factual" });
    expect(atomicPropositions("The letter shows that her resolve held even when Ada Example lost the laboratory funding.")[0])
      .toEqual({ text: "Ada Example lost the laboratory funding", kind: "factual" });
  });
  it("treats a purely normative claim as interpretive, not as unsupported", () => {
    const result = reconcile({ claimText: "Such accounts should be stored as institutional memory, not as independently verified events.",
      requested: parseLocator("p. 3"), identity: "same_source", passage: { text: "Minutes of the 1931 meeting.", locators: [parseLocator("p. 3")] },
      exclude, subjectName: "Ada Example", aliases: [] });
    expect(result.reasons).toContain("INTERPRETIVE_CLAIM");
    expect(result.reasons).not.toContain("ACTUAL_NON_SUPPORT");
    expect(result.proposals).toEqual([]);
  });
});

describe("E. scholarly attribution", () => {
  const passage = { text: "Professor Rao argues that the river hymn records a real migration of the Bharata tribe across the Punjab.", locators: [parseLocator("p. 12")] };
  it("allows EXACT for what a scholar argues", () => {
    expect(isAttributional("Professor Rao argues that the river hymn records a real migration of the Bharata tribe.")).toBe(true);
    const result = assessCitedPassage({ claimText: "Professor Rao argues that the river hymn records a real migration of the Bharata tribe.",
      requested: parseLocator("p. 12"), identity: "same_source", passage, exclude });
    expect(result.level).toBe("EXACT");
  });
  it("never turns the scholar's argument into an exact historical fact", () => {
    const result = reconcile({ claimText: "The river hymn historically records a real migration of the Bharata tribe across the Punjab.",
      requested: parseLocator("p. 12"), identity: "same_source", passage, exclude, subjectName: "Ada Example", aliases: [], passageKind: "scholarly" });
    expect(result.proposals.filter((proposal) => proposal.kind === "confirm_exact")).toEqual([]);
    expect(result.proposals.filter((proposal) => /historically/.test(proposal.text))).toEqual([]);
  });
});

describe("F/G. lineage and duplicate control", () => {
  const parent: ParentClaim = { id: "parent-1", personality_id: "p", claim_text: "Ada Example measured lattice damping in 1931; she later founded a laboratory.",
    certainty: "high", parameter_field_id: "field-1", claim_kind: "traditional_account", evidence_type: "direct_primary_text" };
  const item = { id: "rec-1", chunk_id: "chunk-9", locator_raw: "p. 214", reasons: ["COMPOUND_CLAIM"], deterministic: true,
    assessment: { identity: "same_source", locatorFit: "exact", interpretivePropositions: 0, factualPropositions: 2 } };

  it("F. records parent, passage, locator, reason, parameter, certainty, and reviewer on the child", () => {
    const plan = atomicChildPlan(parent, item, "Ada Example measured lattice damping in 1931.", { reviewer: "Reviewer A", reviewerKind: "human", at: "2026-10-05T00:00:00Z" });
    expect(plan.candidate).toMatchObject({ source_chunk_id: "chunk-9", parameter_field_id: "field-1", certainty: "high" });
    expect(plan.candidate.extraction_note).toContain("parent-1");
    expect(plan.claim).toMatchObject({ parent_claim_id: "parent-1", approval_origin: "human_manual", evidence_type: "direct_primary_text" });
    expect(plan.citation).toEqual({ page_or_section: "p. 214" });
    expect(plan.link.metadata).toMatchObject({ supportLevel: "EXACT", parentClaimId: "parent-1", reconciliationId: "rec-1", reviewer: "Reviewer A" });
    expect(plan.parentPossiblyRedundant).toBe(false);
    expect(atomicChildPlan(parent, item, "x y z w", { reviewer: "AI", reviewerKind: "ai_assisted", at: "t" }).claim)
      .toMatchObject({ approval_origin: "system_test_bulk", approval_metadata: expect.objectContaining({ ai_reviewed: true, testing_only: true }) });
  });

  it("F2. a factual core of an interpretive parent takes the source's non-interpretive evidence type", () => {
    expect(childEvidenceType("scholarly_interpretation", ["traditional_narrative", "traditional_narrative", "scholarly_interpretation", "uncertain"])).toBe("traditional_narrative");
    expect(childEvidenceType("direct_primary_text", ["traditional_narrative"])).toBe("direct_primary_text");
    expect(childEvidenceType("modern_spiritual_interpretation", [])).toBe("uncertain");
  });

  it("G. finds an equivalent existing claim, but never the broader parent", () => {
    const text = "Ada Example measured lattice damping in 1931.";
    expect(existingEquivalent(parent, text, [{ id: parent.id, claim_text: parent.claim_text, parameter_field_id: "field-1" }])).toBeNull();
    expect(existingEquivalent(parent, text, [{ id: "other", claim_text: "In 1931 Ada Example measured lattice damping.", parameter_field_id: "field-1" }])?.id).toBe("other");
    expect(nearDuplicate("Ada Example measured lattice damping in 1931.", parent.claim_text)).toBe(false);
  });
});

describe("H. personality independence", () => {
  it("reconciles a scientist's DOI/page claim with the same engine", () => {
    expect(standaloneClaim("she later founded the national cryogenics laboratory", "Ada Example", [])).toBeNull();
    expect(standaloneClaim("He measured the damping at 4 kelvin", "Ada Example", [])).toBe("Ada Example measured the damping at 4 kelvin.");
    const claim = "Ada Example published the damping measurements in volume 12; the results were widely praised.";
    const passage = { text: "Ada Example published the damping measurements in volume 12 of the journal.", locators: [parseLocator("https://doi.org/10.5555/fixture.1931.214"), parseLocator("p. 214")] };
    // A DOI names the whole article, not a passage: it is too broad for EXACT.
    const byDoi = reconcile({ claimText: claim, requested: parseLocator("doi:10.5555/fixture.1931.214"), identity: "same_source", passage, exclude, subjectName: "Ada Example", aliases: [] });
    expect(byDoi.reasons).toEqual(expect.arrayContaining(["COMPOUND_CLAIM", "LOCATOR_TOO_BROAD"]));
    expect(byDoi.proposals.filter((proposal) => proposal.deterministic)).toEqual([]);
    const byPage = reconcile({ claimText: claim, requested: parseLocator("p. 214"), identity: "same_source", passage, exclude, subjectName: "Ada Example", aliases: [] });
    expect(byPage.proposals[0]).toMatchObject({ kind: "atomic_claim", deterministic: true, text: "Ada Example published the damping measurements in volume 12." });
  });
});
