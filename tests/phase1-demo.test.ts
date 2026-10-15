import { describe, expect, it } from "vitest";
import { getDiscoveryPeople, getPersonBySlug, getPhase1Dataset, getPhase1People, getRelatedPeople } from "@/lib/phase1/dataset";
import { searchPersonalities } from "@/lib/phase1/search";

describe("Phase 1 public demo corpus", () => {
  it("contains exactly five approved presentation categories with five unique people each", () => {
    const dataset = getPhase1Dataset();
    expect(dataset.phase1Presentation.status).toBe("approved_per_track2_handoff");
    expect(dataset.phase1Presentation.categories).toHaveLength(5);
    expect(dataset.phase1Presentation.categories.every((category) => category.personalityIds.length === 5)).toBe(true);
    expect(new Set(dataset.phase1Presentation.categories.flatMap((category) => category.personalityIds)).size).toBe(25);
  });

  it("exposes 25 unique, resolvable public profile routes", () => {
    const people = getPhase1People();
    expect(people).toHaveLength(25);
    expect(new Set(people.map((person) => person.id)).size).toBe(25);
    expect(new Set(people.map((person) => person.slug)).size).toBe(25);
    for (const person of people) expect(getPersonBySlug(person.slug)?.id).toBe(person.id);
  });

  it.each([
    ["vivekananda", ["Swami Vivekananda"]],
    ["raman", ["C. V. Raman", "Srinivasa Ramanujan"]],
    ["bose", ["Jagadish Chandra Bose", "Subhas Chandra Bose"]],
    ["tata", ["J. R. D. Tata", "Jamsetji Tata"]],
    ["ray", ["Satyajit Ray"]],
    ["ashoka", ["Ashoka"]],
  ])("matches the partial name query %s", (query, expected) => {
    const results = searchPersonalities(getDiscoveryPeople(), query).map((person) => person.name);
    expect(results).toEqual(expected);
  });

  it("keeps every displayed statement connected to an approved source", () => {
    for (const person of getPhase1People()) {
      const sourceMap = new Map(person.sources.map((source) => [source.id, source]));
      const statements = [
        ...person.shortIntroduction,
        ...person.lifeAndContext,
        ...person.qualitiesValues,
        ...person.contributions,
        ...person.challenges,
        ...person.leadershipRelationalCharacteristics,
        ...person.contestedAspects,
        ...person.contemporaryRelevance,
      ];
      expect(statements.length).toBeGreaterThanOrEqual(8);
      for (const statement of statements) {
        expect(statement.citations.length).toBeGreaterThan(0);
        for (const citation of statement.citations) expect(sourceMap.get(citation.sourceId)?.sourceStatus).toBe("approved");
      }
    }
  });

  it("returns explainable, non-random related personalities", () => {
    for (const person of getPhase1People()) {
      const related = getRelatedPeople(person);
      expect(related).toHaveLength(3);
      expect(related.every((candidate) => candidate.id !== person.id && candidate.reason.length > 0)).toBe(true);
      expect(related.every((candidate) => candidate.presentationCategory.id === person.phase1PresentationCategory.id)).toBe(true);
    }
  });
});
