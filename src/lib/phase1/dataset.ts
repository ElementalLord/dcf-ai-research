import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  Phase1Dataset,
  Phase1DiscoveryPerson,
  Phase1Personality,
  RelatedPerson,
} from "./types";

let cachedDataset: Phase1Dataset | null = null;

export function personalitySlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getPhase1Dataset(): Phase1Dataset {
  if (cachedDataset) return cachedDataset;
  const filePath = path.join(process.cwd(), "data/exports/dcf-phase1-personalities.json");
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Phase1Dataset;
  if (parsed.personalities.length !== 25 || parsed.phase1Presentation.categories.length !== 5) {
    throw new Error("The approved Phase 1 export must contain 25 personalities and five presentation categories.");
  }
  cachedDataset = parsed;
  return parsed;
}

export function getPhase1People(): Phase1Personality[] {
  return getPhase1Dataset().personalities.map((person) => ({
    id: person.id,
    slug: personalitySlug(person.name),
    name: person.name,
    alternateNames: person.alternateNames,
    type: person.type,
    category: person.category,
    categories: person.categories,
    phase1PresentationCategory: person.phase1PresentationCategory,
    phase1PresentationCategoryStatus: person.phase1PresentationCategoryStatus,
    era: person.era,
    region: person.region,
    shortIntroduction: person.shortIntroduction,
    lifeAndContext: person.lifeAndContext,
    qualitiesValues: person.qualitiesValues,
    contributions: person.contributions,
    challenges: person.challenges,
    leadershipRelationalCharacteristics: person.leadershipRelationalCharacteristics,
    contestedAspects: person.contestedAspects,
    contemporaryRelevance: person.contemporaryRelevance,
    lenses: person.lenses,
    sources: person.sources,
    citations: person.citations,
    reviewStatus: person.reviewStatus,
  }));
}

export function toDiscoveryPerson(person: Phase1Personality): Phase1DiscoveryPerson {
  const introduction = person.shortIntroduction.map((statement) => statement.text).join(" ");
  const searchable = [
    person.name,
    ...person.alternateNames,
    person.phase1PresentationCategory.name,
    person.type,
    person.era,
    person.region,
    ...person.lenses,
    introduction,
    ...person.qualitiesValues.slice(0, 3).map((statement) => statement.text),
  ].filter(Boolean).join(" ").toLowerCase();
  return {
    id: person.id,
    slug: person.slug,
    name: person.name,
    alternateNames: person.alternateNames,
    presentationCategory: person.phase1PresentationCategory,
    detailedCategory: person.type,
    era: person.era,
    region: person.region,
    lenses: person.lenses,
    introduction,
    searchText: searchable,
  };
}

export function getDiscoveryPeople(): Phase1DiscoveryPerson[] {
  return getPhase1People().map(toDiscoveryPerson);
}

export function getPersonBySlug(slug: string): Phase1Personality | null {
  return getPhase1People().find((person) => person.slug === slug) || null;
}

export function getRelatedPeople(person: Phase1Personality, limit = 3): RelatedPerson[] {
  return getPhase1People()
    .filter((candidate) => candidate.id !== person.id)
    .map((candidate) => {
      const samePresentation = candidate.phase1PresentationCategory.id === person.phase1PresentationCategory.id;
      const sameDetailed = Boolean(candidate.type && candidate.type === person.type);
      const sharedLenses = candidate.lenses.filter((lens) => person.lenses.includes(lens));
      const score = Number(samePresentation) * 20 + Number(sameDetailed) * 8 + sharedLenses.length;
      const reason = sameDetailed
        ? `Also ${candidate.type}`
        : samePresentation
          ? `Also in ${person.phase1PresentationCategory.name}`
          : sharedLenses.length
            ? `Shares ${sharedLenses.slice(0, 2).map(formatLens).join(" and ")} lenses`
            : "Related Phase 1 personality";
      return { ...toDiscoveryPerson(candidate), score, reason };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function formatLens(lens: string) {
  return lens.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
