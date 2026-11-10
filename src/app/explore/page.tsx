import type { Metadata } from "next";
import { ExploreClient } from "./explore-client";
import { EXPLORE_CATEGORIES, toExplorePerson } from "./explore-data";
import { getDiscoveryPeople, getPhase1People } from "@/lib/phase1/dataset";

export const metadata: Metadata = {
  title: "Meet the people | DCF",
  description: "Search the collection of sourced historical profiles.",
};

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  const requestedCategory = (await searchParams).category;
  const initialCategory = typeof requestedCategory === "string" && EXPLORE_CATEGORIES.some((category) => category.id === requestedCategory) ? requestedCategory : "all";
  const people = getPhase1People();
  const discovery = getDiscoveryPeople();
  const byId = new Map(people.map((person) => [person.id, person]));
  return (
    <main className="page explore-shell">
      <header className="explore-intro">
        <h1>Meet the people</h1>
        <p>{people.length} people from India&rsquo;s history. Type a name or tap a group, then pick a person to read their story.</p>
      </header>
      <ExploreClient people={discovery.map((person) => toExplorePerson(person, byId.get(person.id)!))} categories={EXPLORE_CATEGORIES} initialCategory={initialCategory} />
    </main>
  );
}
