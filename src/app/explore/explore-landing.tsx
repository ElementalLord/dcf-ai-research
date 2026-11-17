import { getDiscoveryPeople, getPhase1People } from "@/lib/phase1/dataset";
import { getPortraits } from "@/lib/portraits";
import { ExploreClient } from "./explore-client";
import { EXPLORE_CATEGORIES, toExplorePerson } from "./explore-data";
import { ParticleHero, type HeroFigure } from "./particle-hero";
import { DcfMark } from "@/components/dcf-logo";

/** Faces the opening animation draws, in order, with each name in Devanagari for when a portrait cannot be read. */
const HERO_FIGURES: Array<{ slug: string; deva: string }> = [
  { slug: "swami-vivekananda", deva: "विवेकानन्द" },
  { slug: "a-p-j-abdul-kalam", deva: "कलाम" },
  { slug: "rabindranath-tagore", deva: "रवीन्द्रनाथ" },
  { slug: "c-v-raman", deva: "रमन" },
  { slug: "bhagat-singh", deva: "भगत सिंह" },
  { slug: "rani-lakshmibai-of-jhansi", deva: "लक्ष्मीबाई" },
  { slug: "srinivasa-ramanujan", deva: "रामानुजन" },
  { slug: "chhatrapati-shivaji-maharaj", deva: "शिवाजी" },
];

/** The front page of the site: an opening animation of familiar faces, then the collection itself. */
export async function ExploreLanding({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  const requestedCategory = (await searchParams).category;
  const initialCategory = typeof requestedCategory === "string" && EXPLORE_CATEGORIES.some((category) => category.id === requestedCategory) ? requestedCategory : "all";
  const people = getPhase1People();
  const discovery = getDiscoveryPeople();
  const byId = new Map(people.map((person) => [person.id, person]));
  const portraits = await getPortraits(discovery.map((person) => person.slug));
  const figures: HeroFigure[] = HERO_FIGURES.flatMap(({ slug, deva }) => {
    const person = discovery.find((item) => item.slug === slug);
    return person ? [{ slug, deva, name: person.name, role: person.detailedCategory ?? "", portrait: portraits[slug] ?? null }] : [];
  });

  return (
    <main className="explore-shell xp">
      <ParticleHero figures={figures} />

      <section aria-labelledby="collection-title" className="xp-collection">
        <h2 id="collection-title" className="xp-section-title">Explore the collection</h2>
        <ExploreClient
          people={discovery.map((person) => toExplorePerson(person, byId.get(person.id)!))}
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
