import "server-only";

import { getPhase1People, getRelatedPeople, toDiscoveryPerson } from "@/lib/phase1/dataset";
import type { Phase1DiscoveryPerson, Phase1Personality } from "@/lib/phase1/types";
import { publishedLiveProfiles } from "./live-people";
import type { ExploreProfileSettings } from "./profile-settings";

export type ExploreCollection = {
  people: Phase1Personality[];
  discovery: Phase1DiscoveryPerson[];
  /** Explore settings for people added through Resources, keyed by slug. Curated people have none. */
  settings: Map<string, ExploreProfileSettings>;
};

/** Everyone shown on Explore: the 25 curated Phase 1 profiles plus people published from Resources. */
export async function getExploreCollection(): Promise<ExploreCollection> {
  const live = await publishedLiveProfiles();
  const people = [...getPhase1People(), ...live.map((profile) => profile.person)];
  return {
    people,
    discovery: people.map(toDiscoveryPerson),
    settings: new Map(live.map((profile) => [profile.person.slug, profile.settings])),
  };
}

export async function getExplorePerson(slug: string) {
  const collection = await getExploreCollection();
  const person = collection.people.find((item) => item.slug === slug) ?? null;
  return person ? { person, settings: collection.settings.get(slug) ?? null, related: getRelatedPeople(person, 3, collection.people), collection } : null;
}

/** Wikipedia article titles for portraits of published people added through Resources. */
export function portraitTitles(settings: Map<string, ExploreProfileSettings>) {
  return Object.fromEntries([...settings].flatMap(([slug, value]) => value.wikipediaTitle ? [[slug, value.wikipediaTitle]] : []));
}
