import { describe, expect, it } from "vitest";
import { isUncertainClaim, profileSections } from "@/app/explore/explore-data";
import { getPhase1People } from "@/lib/phase1/dataset";
import type { Phase1Personality, Phase1Source, Phase1Statement } from "@/lib/phase1/types";

const source = { id: "s1", sourceStatus: "approved" } as Phase1Source;

function claim(claimId: string, evidenceType: string): Phase1Statement {
  return { claimId, text: claimId, reviewStatus: "approved", evidenceType, citations: [{ sourceId: "s1" }] } as Phase1Statement;
}

describe("profileSections", () => {
  it("lists an uncertain claim filed under several sections only once in the disputed section", () => {
    const shared = claim("shared", "uncertain");
    const person = {
      sources: [source],
      shortIntroduction: [shared, claim("intro", "scholarly_interpretation")],
      lifeAndContext: [shared],
      qualitiesValues: [],
      contributions: [],
      leadershipRelationalCharacteristics: [],
      challenges: [],
      contemporaryRelevance: [],
      contestedAspects: [claim("contested", "uncertain"), shared],
    } as unknown as Phase1Personality;

    const sections = profileSections(person);
    expect(sections.map((section) => section.key)).toEqual(["shortIntroduction", "lifeAndContext", "contestedAspects"]);
    const life = sections.find((section) => section.key === "lifeAndContext");
    expect(life?.claims).toEqual([]);
    expect(life?.note).toMatch(/Disputed or uncertain/);
    expect(sections.find((section) => section.key === "contestedAspects")?.claims.map((c) => c.claimId)).toEqual(["contested", "shared"]);
  });

  it("shows a limited-information note instead of hiding a section with no approved evidence", () => {
    const person = {
      sources: [source],
      limitedInformation: { challenges: "No approved source documents this." },
      shortIntroduction: [claim("intro", "scholarly_interpretation")],
      lifeAndContext: [], qualitiesValues: [], contributions: [], leadershipRelationalCharacteristics: [],
      challenges: [], contemporaryRelevance: [], contestedAspects: [],
    } as unknown as Phase1Personality;
    const sections = profileSections(person);
    expect(sections.map((section) => section.key)).toEqual(["shortIntroduction", "challenges"]);
    expect(sections[1].note).toBe("No approved source documents this.");
  });

  it("gives every published profile section either approved claims or an explanation", () => {
    for (const person of getPhase1People()) {
      const shown = new Map(profileSections(person).map((section) => [section.key, section]));
      for (const key of ["lifeAndContext", "qualitiesValues", "contributions", "challenges", "contemporaryRelevance", "contestedAspects"] as const) {
        const section = shown.get(key);
        expect(section, `${person.slug} / ${key}`).toBeDefined();
        expect(Boolean(section!.claims.length || section!.note), `${person.slug} / ${key}`).toBe(true);
      }
    }
  });

  it("treats the database default evidence type as unclassified unless certainty is low", () => {
    expect(isUncertainClaim({ evidenceType: "uncertain", certainty: "high" })).toBe(false);
    expect(isUncertainClaim({ evidenceType: "uncertain", certainty: "medium" })).toBe(false);
    expect(isUncertainClaim({ evidenceType: "uncertain", certainty: "low" })).toBe(true);
    expect(isUncertainClaim({ evidenceType: "scholarly_interpretation", certainty: "low" })).toBe(false);
  });

  it("does not file a well-supported profile under Disputed or uncertain", () => {
    for (const slug of ["ashoka", "j-r-d-tata", "rabindranath-tagore", "subhas-chandra-bose"]) {
      const person = getPhase1People().find((item) => item.slug === slug)!;
      const sections = new Map(profileSections(person).map((section) => [section.key, section.claims.length]));
      expect(sections.get("contributions"), slug).toBeGreaterThan(0);
      expect(sections.get("lifeAndContext"), slug).toBeGreaterThan(0);
    }
  });

  it("never repeats a claimId within a section for any published profile", () => {
    for (const person of getPhase1People()) {
      for (const section of profileSections(person)) {
        const ids = section.claims.map((c) => c.claimId);
        expect(new Set(ids).size, `${person.slug} / ${section.key}`).toBe(ids.length);
      }
    }
  });
});
