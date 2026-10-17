import type { Metadata } from "next";
import { ExploreClient } from "./explore-client";
import { EXPLORE_CATEGORIES, toExplorePerson } from "./explore-data";
import { getDiscoveryPeople, getPhase1People } from "@/lib/phase1/dataset";

export const metadata: Metadata = {
  title: "Explore the collection | DCF",
  description: "Search the collection of sourced historical profiles.",
};

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  const requestedCategory = (await searchParams).category;
  const initialCategory = typeof requestedCategory === "string" && EXPLORE_CATEGORIES.some((category) => category.id === requestedCategory) ? requestedCategory : "all";
  const people = getPhase1People();
  const discovery = getDiscoveryPeople();
  const byId = new Map(people.map((person) => [person.id, person]));
  return (
    <main className="explore-shell explore-page">
      <header className="explore-intro">
        <h1>Explore the collection</h1>
        <p>{people.length} people, with the sources behind approved claims. Search by name, role, or idea, or browse the collection.</p>
      </header>
      <ExploreClient people={discovery.map((person) => toExplorePerson(person, byId.get(person.id)!))} categories={EXPLORE_CATEGORIES} initialCategory={initialCategory} />
    </main>
  );
}
