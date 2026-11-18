import type { Phase1DiscoveryPerson, Phase1Personality, Phase1PresentationCategory, Phase1RoleLens, Phase1Statement } from "@/lib/phase1/types";
import { ERA_PERIODS as PERIODS, type ExploreProfileSettings } from "@/lib/explore/profile-settings";
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

/**
 * The Explore group for a person. A group chosen in Resources (for an added person, or a curated
 * one that was edited) wins; otherwise curated people use the fixed map. The export's own long
 * category ids are not Explore groups, so they fall through to the map.
 */
export function exploreCategory(slug: string, groupId?: string | null) {
  const chosen = EXPLORE_CATEGORIES.some((category) => category.id === groupId) ? groupId : null;
  const id = chosen ?? CATEGORY_BY_SLUG[slug];
  return EXPLORE_CATEGORIES.find((category) => category.id === id) ?? EXPLORE_CATEGORIES[0];
}

/** Explore group of a dataset person: its curated mapping, or the group chosen when it was added in Resources. */
export function groupOf(person: Pick<Phase1Personality, "slug" | "phase1PresentationCategory">) {
  return exploreCategory(person.slug, person.phase1PresentationCategory?.id);
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

export type PublicProfilePerson = Pick<Phase1Personality, "slug" | "name" | "shortName" | "type" | "era" | "region" | "sources" | "limitedInformation" | "studyFramework" | "roleLenses" | (typeof PROFILE_SECTIONS)[number]["key"]> & { angles: ProfileAngle[]; group: string };

export function publicProfilePerson(person: Phase1Personality, settings: ExploreProfileSettings | null = null): PublicProfilePerson {
  const sources = person.sources.filter((source) => source.sourceStatus === "approved");
  const sourceIds = new Set(sources.map((source) => source.id));
  const publicClaims = (claims: Phase1Statement[]) => claims
    .filter((claim) => claim.reviewStatus === "approved" && claim.citations.some((citation) => sourceIds.has(citation.sourceId)))
    .map((claim) => ({ ...claim, citations: claim.citations.filter((citation) => sourceIds.has(citation.sourceId)) }));
  return {
    slug: person.slug,
    name: person.name,
    shortName: person.shortName,
    type: person.type,
    era: person.era,
    region: person.region,
    limitedInformation: person.limitedInformation,
    studyFramework: person.studyFramework && {
      ...person.studyFramework,
      parameters: person.studyFramework.parameters.map((parameter) => ({
        ...parameter,
        fields: parameter.fields.map((field) => ({ ...field, statements: publicClaims(field.statements) })),
      })),
    },
    roleLenses: person.roleLenses.map((lens) => ({ ...lens, focusStatements: publicClaims(lens.focusStatements) })),
    angles: settings?.angles ?? profileAngles(person.slug),
    group: groupOf(person).id,
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

/**
 * True when a claim should be read as uncertain. The database stores "uncertain" as the default
 * evidence type for claims that were never classified, so the type alone does not mean doubt:
 * most such claims carry a high or medium certainty rating from review. Only claims whose
 * certainty is also below medium are treated as uncertain.
 */
export function isUncertainClaim(claim: Pick<Phase1Statement, "evidenceType" | "certainty">) {
  return claim.evidenceType === "uncertain" && claim.certainty !== "high" && claim.certainty !== "medium";
}

export function approvedStatements(person: Pick<Phase1Personality, "sources" | (typeof PROFILE_SECTIONS)[number]["key"]>, key: (typeof PROFILE_SECTIONS)[number]["key"]): Phase1Statement[] {
  return person[key].filter((claim) => claim.reviewStatus === "approved" && claim.citations.some((citation) => person.sources.some((source) => source.id === citation.sourceId && source.sourceStatus === "approved")) && (key === "contestedAspects" || !isUncertainClaim(claim)));
}

function uniqueByClaimId(claims: Phase1Statement[]): Phase1Statement[] {
  const seen = new Set<string>();
  return claims.filter((claim) => !seen.has(claim.claimId) && Boolean(seen.add(claim.claimId)));
}

export type ProfileSection = (typeof PROFILE_SECTIONS)[number] & { claims: Phase1Statement[]; note: string | null };

const MOVED_TO_UNCERTAIN = "The approved statements on this topic are qualified as uncertain, so they are shown under Disputed or uncertain.";

// Approved claims that are uncertain (see isUncertainClaim) are shown under "Disputed or uncertain" instead of their own
// section. Sections without approved evidence keep the dataset's limited-information note, so a
// reader sees that the gap is known rather than that the section is missing.
export function profileSections(person: Pick<Phase1Personality, "sources" | "limitedInformation" | (typeof PROFILE_SECTIONS)[number]["key"]>): ProfileSection[] {
  const admittedIds = new Set(person.sources.filter((source) => source.sourceStatus === "approved").map((source) => source.id));
  const uncertain = PROFILE_SECTIONS
    .filter((section) => section.key !== "contestedAspects")
    .flatMap((section) => person[section.key].filter((claim) => claim.reviewStatus === "approved" && isUncertainClaim(claim) && claim.citations.some((citation) => admittedIds.has(citation.sourceId))));
  return PROFILE_SECTIONS
    .map((section) => {
      const claims = uniqueByClaimId(section.key === "contestedAspects" ? [...approvedStatements(person, section.key), ...uncertain] : approvedStatements(person, section.key));
      const limited = section.key === "shortIntroduction" ? undefined : person.limitedInformation?.[section.key];
      const note = claims.length ? null : limited ?? (person[section.key].length ? MOVED_TO_UNCERTAIN : null);
      return { ...section, claims, note };
    })
    .filter((section) => section.claims.length || section.note);
}

/**
 * Applies a role lens to already-built profile sections. Sections are reordered by how many of the
 * lens's claims they hold, and those claims move to the top of each section. The set of statements
 * is unchanged: a lens shifts attention, never facts.
 */
export function applyRoleLens(sections: ProfileSection[], lens: Pick<Phase1RoleLens, "focusClaimIds" | "sectionOrder"> | null): Array<ProfileSection & { focusCount: number }> {
  if (!lens) return sections.map((section) => ({ ...section, focusCount: 0 }));
  const focus = new Set(lens.focusClaimIds);
  const position = (key: string) => key === "shortIntroduction" ? -1 : (lens.sectionOrder as string[]).indexOf(key);
  return [...sections]
    .sort((a, b) => position(a.key) - position(b.key))
    .map((section) => {
      const claims = [...section.claims.filter((claim) => focus.has(claim.claimId)), ...section.claims.filter((claim) => !focus.has(claim.claimId))];
      return { ...section, claims, focusCount: claims.filter((claim) => focus.has(claim.claimId)).length };
    });
}

export type ExplorePerson = Phase1DiscoveryPerson & { summary: string | null; sourceCount: number; angles: ProfileAngle[] };

/** Timeline groups, in order. Each person's group comes from the curated era in the dataset. */
export const ERA_PERIODS: string[] = [...PERIODS];

export function toExplorePerson(discovery: Phase1DiscoveryPerson, person: Phase1Personality, settings: ExploreProfileSettings | null = null): ExplorePerson {
  const summary = approvedStatements(person, "shortIntroduction")[0]?.text ?? null;
  const angles = settings?.angles ?? profileAngles(person.slug);
  const group = groupOf(person);
  return {
    ...discovery,
    presentationCategory: group,
    introduction: summary ?? "",
    summary,
    angles,
    sourceCount: person.sources.filter((source) => source.sourceStatus === "approved").length,
    searchText: [discovery.name, ...discovery.alternateNames, person.type, group.name, summary, person.era.label, person.era.period, person.region.label, ...person.region.broad, ...angles.map((angle) => angle.title)].filter(Boolean).join(" ").toLowerCase(),
  };
}

/** Two-letter initials for a person, used as a visual mark where no portrait exists. */
export function monogram(name: string) {
  const words = name.replace(/\./g, " ").split(/\s+/).filter((word) => word && !["of", "the"].includes(word.toLowerCase()));
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}
