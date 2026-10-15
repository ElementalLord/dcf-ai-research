import type { Phase1DiscoveryPerson } from "./types";

const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

export function personalitySearchScore(person: Phase1DiscoveryPerson, rawQuery: string) {
  const query = normalize(rawQuery);
  if (!query) return 1;
  const names = [person.name, ...person.alternateNames].map(normalize);
  if (names.some((name) => name === query)) return 100;
  if (names.some((name) => name.split(" ").includes(query))) return 90;
  if (names.some((name) => name.startsWith(query))) return 80;
  if (names.some((name) => name.split(" ").some((word) => word.startsWith(query)))) return 70;
  if (names.some((name) => name.includes(query))) return 60;
  return person.searchText.includes(query) ? 10 : 0;
}

export function searchPersonalities(people: Phase1DiscoveryPerson[], query: string) {
  if (!query.trim()) return people;
  const scored = people.map((person) => ({ person, score: personalitySearchScore(person, query) }));
  const hasNameMatch = scored.some((result) => result.score >= 60);
  return scored
    .filter((result) => result.score >= (hasNameMatch ? 60 : 1))
    .sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name))
    .map((result) => result.person);
}
