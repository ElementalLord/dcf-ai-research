import "server-only";

import { getPhase1People, getRelatedPeople, toDiscoveryPerson } from "@/lib/phase1/dataset";
import type { Phase1DiscoveryPerson, Phase1Personality } from "@/lib/phase1/types";
import type { Portrait } from "@/lib/portraits";
import { curatedEdits, publishedLiveProfiles } from "./live-people";
import { EXPLORE_GROUPS, type ExploreProfileSettings } from "./profile-settings";

export type ExploreCollection = {
  people: Phase1Personality[];
  discovery: Phase1DiscoveryPerson[];
  /** Explore settings keyed by slug: people added through Resources, and curated people edited there. */
  settings: Map<string, ExploreProfileSettings>;
};

/** Marks a curated person whose Explore group was changed in Resources, so it overrides the built-in group. */
export const EDITED_IN_RESOURCES = "edited_in_resources";

/** Applies presentation edits from Resources to a curated person. Reviewed statements are untouched. */
export function applyCuratedEdit(person: Phase1Personality, settings: ExploreProfileSettings, alternateNames: string[] | null): Phase1Personality {
  const group = EXPLORE_GROUPS.find((item) => item.id === settings.group)!;
  return {
    ...person,
    shortName: settings.shortName,
    alternateNames: alternateNames ?? person.alternateNames,
    era: { ...person.era, label: settings.era.label, short: settings.era.short, sortYear: settings.era.sortYear, period: settings.era.period },
    region: { ...person.region, label: settings.region.label, broad: settings.region.broad },
    phase1PresentationCategory: { id: group.id, name: group.name, description: "" },
    phase1PresentationCategoryStatus: EDITED_IN_RESOURCES,
  };
}

/** Everyone shown on Explore: the 25 curated Phase 1 profiles (with any Resources edits) plus people published from Resources. */
export async function getExploreCollection(): Promise<ExploreCollection> {
  const [live, edits] = await Promise.all([publishedLiveProfiles(), curatedEdits()]);
  const curated = getPhase1People().map((person) => {
    const edit = edits.get(person.id);
    return edit ? applyCuratedEdit(person, edit.settings, edit.alternateNames) : person;
  });
  const people = [...curated, ...live.map((profile) => profile.person)];
  const settings = new Map<string, ExploreProfileSettings>([
    ...curated.flatMap((person) => { const edit = edits.get(person.id); return edit ? [[person.slug, edit.settings] as const] : []; }),
    ...live.map((profile) => [profile.person.slug, profile.settings] as const),
  ]);
  return { people, discovery: people.map(toDiscoveryPerson), settings };
}

export async function getExplorePerson(slug: string) {
  const collection = await getExploreCollection();
  const person = collection.people.find((item) => item.slug === slug) ?? null;
  return person ? { person, settings: collection.settings.get(slug) ?? null, related: getRelatedPeople(person, 3, collection.people), collection } : null;
}

/** Wikipedia article titles set in Resources, keyed by slug. */
export function portraitTitles(settings: Map<string, ExploreProfileSettings>) {
  return Object.fromEntries([...settings].flatMap(([slug, value]) => value.wikipediaTitle ? [[slug, value.wikipediaTitle]] : []));
}

/** Photos uploaded or linked in Resources, keyed by slug. They replace the Wikipedia image. */
export function chosenPhotos(settings: Map<string, ExploreProfileSettings>): Record<string, Portrait> {
  return Object.fromEntries([...settings].flatMap(([slug, value]) => value.photo
    ? [[slug, { src: value.photo.url, author: value.photo.credit || "Dharma Civilization Foundation", license: "Used with permission", source: value.photo.url } satisfies Portrait]]
    : []));
}
