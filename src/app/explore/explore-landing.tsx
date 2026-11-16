import Link from "next/link";
import { getDiscoveryPeople, getPhase1People } from "@/lib/phase1/dataset";
import { getPortraits } from "@/lib/portraits";
import { Arrow, Lotus, Manuscript } from "@/components/vedic-icons";
import { ExploreClient } from "./explore-client";
import { EXPLORE_CATEGORIES, PROFILE_SECTIONS, approvedStatements, toExplorePerson } from "./explore-data";

const SOURCE_TYPES: Record<string, string> = { primary_text: "Original text", institutional: "Institutional record", scholarly_book: "Scholarly book", scholarly_article: "Scholarly article" };

/** The front page of the site: the collection, its numbers, and a worked example of the evidence behind it. */
export async function ExploreLanding({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  const requestedCategory = (await searchParams).category;
  const initialCategory = typeof requestedCategory === "string" && EXPLORE_CATEGORIES.some((category) => category.id === requestedCategory) ? requestedCategory : "all";
  const people = getPhase1People();
  const discovery = getDiscoveryPeople();
  const byId = new Map(people.map((person) => [person.id, person]));
  const portraits = await getPortraits(discovery.map((person) => person.slug));
  const sourceIds = new Set(people.flatMap((person) => person.sources.filter((source) => source.sourceStatus === "approved").map((source) => source.id)));
  const claimCount = people.reduce((total, person) => total + PROFILE_SECTIONS.reduce((sum, section) => sum + approvedStatements(person, section.key).length, 0), 0);

  // A real reviewed claim and its sources, shown as a worked example of how evidence links up.
  const sample = people.find((person) => person.slug === "swami-vivekananda") ?? people[0];
  const sampleClaim = PROFILE_SECTIONS.flatMap((section) => approvedStatements(sample, section.key)).find((claim) => claim.citations.length > 0);
  const sampleSources = sampleClaim ? [...new Set(sampleClaim.citations.map((citation) => citation.sourceId))]
    .map((id) => sample.sources.find((source) => source.id === id)).filter((source) => source !== undefined).slice(0, 3) : [];

  return (
    <main className="explore-shell xp">
      <header className="xp-hero">
        <p className="xp-eyebrow"><span lang="sa" className="xp-deva">प्रेरणा</span><span aria-hidden="true">·</span>Dharma Civilization Foundation</p>
        <h1 className="xp-title">Inspiring <em>Personalities</em></h1>
        <p className="xp-lede">The sages, scientists, rulers, reformers and artists who shaped Indian civilization, with the evidence behind every claim.</p>
        <div className="xp-hero-row">
          <dl className="xp-stats">
            <div><dt>Lives</dt><dd>{people.length}</dd></div>
            <div><dt>Reviewed claims</dt><dd>{claimCount}</dd></div>
            <div><dt>Approved sources</dt><dd>{sourceIds.size}</dd></div>
          </dl>
          <Link href="/ai" className="key key-hot key-lg"><Lotus size={18} />Ask the guide<Arrow size={16} /></Link>
        </div>
      </header>

      <section aria-labelledby="collection-title" className="xp-collection">
        <h2 id="collection-title" className="xp-section-title">Explore the collection</h2>
        <ExploreClient
          people={discovery.map((person) => toExplorePerson(person, byId.get(person.id)!))}
          categories={EXPLORE_CATEGORIES}
          initialCategory={initialCategory}
          portraits={portraits}
        />
      </section>

      {sampleClaim && <section className="xp-evidence" aria-labelledby="evidence-title">
        <div>
          <p className="xp-eyebrow"><Manuscript size={16} />How it works</p>
          <h2 id="evidence-title" className="xp-section-title">Every claim links to a source.</h2>
          <p className="xp-muted">Each statement on a profile has been reviewed and is tied to the texts, books and institutional records it comes from.</p>
        </div>
        <figure className="xp-claim">
          <figcaption>Claim · {sample.name}</figcaption>
          <blockquote>{sampleClaim.text}</blockquote>
          <ul>{sampleSources.map((source) => <li key={source.id}><span>{SOURCE_TYPES[source.sourceType] ?? "Source record"}</span>{source.title}</li>)}</ul>
        </figure>
      </section>}

      <footer className="xp-footer">
        <span>Inspiring Personalities · Dharma Civilization Foundation</span>
        <span>Portraits from Wikimedia Commons; credits on each profile.</span>
      </footer>
    </main>
  );
}
