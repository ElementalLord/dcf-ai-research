import { describe, expect, it } from "vitest";
import { profileSections } from "@/app/explore/explore-data";
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
    expect(sections.map((section) => section.key)).toEqual(["shortIntroduction", "contestedAspects"]);
    expect(sections.find((section) => section.key === "contestedAspects")?.claims.map((c) => c.claimId)).toEqual(["contested", "shared"]);
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
