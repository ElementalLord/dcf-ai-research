import { getDiscoveryPeople, getPhase1People } from "@/lib/phase1/dataset";
import { getPortraits } from "@/lib/portraits";
import { ExploreClient } from "./explore-client";
import { EXPLORE_CATEGORIES, toExplorePerson } from "./explore-data";
import { ParticleHero } from "./particle-hero";
import { DcfMark } from "@/components/dcf-logo";

/** The front page of the site: an opening animation of sacred symbols, then the collection itself. */
export async function ExploreLanding({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  const requestedCategory = (await searchParams).category;
  const initialCategory = typeof requestedCategory === "string" && EXPLORE_CATEGORIES.some((category) => category.id === requestedCategory) ? requestedCategory : "all";
  const people = getPhase1People();
  const discovery = getDiscoveryPeople();
  const byId = new Map(people.map((person) => [person.id, person]));
  const portraits = await getPortraits(discovery.map((person) => person.slug));
  const explorePeople = discovery.map((person) => toExplorePerson(person, byId.get(person.id)!));
  // A source shared by several people counts once.
  const approvedSources = new Set(discovery.flatMap((person) => byId.get(person.id)!.sources
    .filter((source) => source.sourceStatus === "approved").map((source) => source.url || source.id)));
  const stats = { lives: explorePeople.length, fields: EXPLORE_CATEGORIES.length, sources: approvedSources.size };

  return (
    <main className="explore-shell xp">
      <ParticleHero stats={stats} />

      <section aria-labelledby="collection-title" className="xp-collection">
        <header className="xp-section-head">
          <p className="xp-section-eyebrow">Lives and evidence</p>
          <h2 id="collection-title" className="xp-section-title">Explore the collection</h2>
          <p className="xp-section-lede">Search by name, role, place or idea, or browse one field at a time.</p>
        </header>
        <ExploreClient
          people={explorePeople}
          categories={EXPLORE_CATEGORIES}
          initialCategory={initialCategory}
          portraits={portraits}
        />
      </section>

      <footer className="xp-footer">
        <span className="xp-footer-brand"><DcfMark size={30} />Inspiring Personalities · Dharma Civilization Foundation</span>
        <span>Portraits from Wikimedia Commons; credits on each profile.</span>
      </footer>
    </main>
  );
}
