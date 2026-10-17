import type { Phase1DiscoveryPerson, Phase1Personality, Phase1PresentationCategory, Phase1Statement } from "@/lib/phase1/types";
import { profileAngles, type ProfileAngle } from "./profile-angles";

export const EXPLORE_CATEGORIES: Phase1PresentationCategory[] = [
  { id: "sages", name: "Sages and philosophical traditions", description: "" },
  { id: "spiritual", name: "Spiritual teachers and reformers", description: "" },
  { id: "scientists", name: "Scientists and institution builders", description: "" },
  { id: "rulers", name: "Rulers and freedom fighters", description: "" },
  { id: "cultural", name: "Cultural figures", description: "" },
];

const CATEGORY_BY_SLUG: Record<string, string> = {
  "adi-shankaracharya": "sages", agastya: "sages", vasistha: "sages", vishvamitra: "sages", yajnavalkya: "sages",
  "guru-nanak": "spiritual", "ramakrishna-paramahamsa": "spiritual", "savitribai-phule": "spiritual", "swami-vivekananda": "spiritual",
  "a-p-j-abdul-kalam": "scientists", "c-v-raman": "scientists", "jagadish-chandra-bose": "scientists", "srinivasa-ramanujan": "scientists", "verghese-kurien": "scientists", "j-r-d-tata": "scientists", "jamsetji-tata": "scientists",
  ashoka: "rulers", "chhatrapati-shivaji-maharaj": "rulers", "rani-lakshmibai-of-jhansi": "rulers", "rajaraja-chola-i": "rulers", "bhagat-singh": "rulers", "subhas-chandra-bose": "rulers",
  "m-s-subbulakshmi": "cultural", "rabindranath-tagore": "cultural", "satyajit-ray": "cultural",
};

export function exploreCategory(slug: string) {
  return EXPLORE_CATEGORIES.find((category) => category.id === CATEGORY_BY_SLUG[slug]) ?? EXPLORE_CATEGORIES[0];
}

export const PROFILE_SECTIONS = [
  { key: "shortIntroduction", title: "Overview" },
  { key: "lifeAndContext", title: "Life and context" },
  { key: "qualitiesValues", title: "Qualities and values" },
  { key: "contributions", title: "Contributions" },
  { key: "leadershipRelationalCharacteristics", title: "Leadership and relationships" },
  { key: "challenges", title: "Challenges" },
  { key: "contemporaryRelevance", title: "Recognition and legacy" },
  { key: "contestedAspects", title: "Disputed or uncertain" },
] as const;

export type PublicProfilePerson = Pick<Phase1Personality, "slug" | "name" | "type" | "era" | "region" | "sources" | (typeof PROFILE_SECTIONS)[number]["key"]> & { angles: ProfileAngle[] };

export function publicProfilePerson(person: Phase1Personality): PublicProfilePerson {
  const sources = person.sources.filter((source) => source.sourceStatus === "approved");
  const sourceIds = new Set(sources.map((source) => source.id));
  const publicClaims = (claims: Phase1Statement[]) => claims
    .filter((claim) => claim.reviewStatus === "approved" && claim.citations.some((citation) => sourceIds.has(citation.sourceId)))
    .map((claim) => ({ ...claim, citations: claim.citations.filter((citation) => sourceIds.has(citation.sourceId)) }));
  return {
    slug: person.slug,
    name: person.name,
    type: person.type,
    era: person.era,
    region: person.region,
    angles: profileAngles(person.slug),
    sources,
    shortIntroduction: publicClaims(person.shortIntroduction),
    lifeAndContext: publicClaims(person.lifeAndContext),
    qualitiesValues: publicClaims(person.qualitiesValues),
    contributions: publicClaims(person.contributions),
    leadershipRelationalCharacteristics: publicClaims(person.leadershipRelationalCharacteristics),
    challenges: publicClaims(person.challenges),
    contemporaryRelevance: publicClaims(person.contemporaryRelevance),
    contestedAspects: publicClaims(person.contestedAspects),
  };
}

export function approvedStatements(person: Pick<Phase1Personality, "sources" | (typeof PROFILE_SECTIONS)[number]["key"]>, key: (typeof PROFILE_SECTIONS)[number]["key"]): Phase1Statement[] {
  return person[key].filter((claim) => claim.reviewStatus === "approved" && claim.citations.some((citation) => person.sources.some((source) => source.id === citation.sourceId && source.sourceStatus === "approved")) && (key === "contestedAspects" || claim.evidenceType !== "uncertain"));
}

export type ExplorePerson = Phase1DiscoveryPerson & { summary: string | null; sourceCount: number; dateLabel: string | null; sortYear: number | null; angles: ProfileAngle[] };

export function toExplorePerson(discovery: Phase1DiscoveryPerson, person: Phase1Personality): ExplorePerson {
  const summary = approvedStatements(person, "shortIntroduction")[0]?.text ?? null;
  const angles = profileAngles(person.slug);
  // The export has no structured date field. Era is used only when the export supplies one.
  return {
    ...discovery,
    presentationCategory: exploreCategory(person.slug),
    introduction: summary ?? "",
    summary,
    angles,
    sourceCount: person.sources.filter((source) => source.sourceStatus === "approved").length,
    dateLabel: person.era,
    sortYear: null,
    searchText: [discovery.name, ...discovery.alternateNames, person.type, exploreCategory(person.slug).name, summary, person.era, ...angles.map((angle) => angle.title)].filter(Boolean).join(" ").toLowerCase(),
  };
}
