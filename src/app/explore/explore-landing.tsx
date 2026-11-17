import { getExploreCollection, portraitTitles } from "@/lib/explore/collection";
import { getPortraits } from "@/lib/portraits";
import { ExploreClient } from "./explore-client";
import { EXPLORE_CATEGORIES, toExplorePerson } from "./explore-data";
import { ParticleHero } from "./particle-hero";
import { DcfMark } from "@/components/dcf-logo";

/** The front page of the site: an opening animation of sacred symbols, then the collection itself. */
export async function ExploreLanding({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  const requestedCategory = (await searchParams).category;
  const initialCategory = typeof requestedCategory === "string" && EXPLORE_CATEGORIES.some((category) => category.id === requestedCategory) ? requestedCategory : "all";
  // The 25 curated profiles plus anyone published from Resources → People.
  const { people, discovery, settings } = await getExploreCollection();
  const byId = new Map(people.map((person) => [person.id, person]));
  const portraits = await getPortraits(discovery.map((person) => person.slug), portraitTitles(settings));

  return (
    <main className="explore-shell xp">
      <ParticleHero />

      <section aria-labelledby="collection-title" className="xp-collection">
        <h2 id="collection-title" className="xp-section-title">Explore the collection</h2>
        <ExploreClient
          people={discovery.map((person) => toExplorePerson(person, byId.get(person.id)!, settings.get(person.slug) ?? null))}
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
