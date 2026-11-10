import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDiscoveryPeople, getPhase1People } from "@/lib/phase1/dataset";
import { EXPLORE_CATEGORIES, exploreCategory } from "./explore/explore-data";

export const metadata: Metadata = {
  title: "DCF Inspiring Personalities",
  description: "Explore 25 evidence-grounded profiles across the approved DCF Phase 1 collection.",
};

const STEPS = [
  { title: "Pick a person", body: "Choose someone from the list of people." },
  { title: "Read their story", body: "Each fact is short and easy to read." },
  { title: "See where it came from", body: "Tap a fact to see the book or record it comes from." },
];

export default function HomePage() {
  const people = getPhase1People();
  const discovery = getDiscoveryPeople();
  const groups = EXPLORE_CATEGORIES.map((category) => ({ ...category, members: discovery.filter((person) => exploreCategory(person.slug).id === category.id) }));

  return (
    <main className="page home">
      <section className="home-hero" aria-labelledby="home-title">
        <h1 id="home-title">Meet the people who shaped India</h1>
        <p className="lede">True stories about {people.length} sages, scientists, rulers, saints and artists. Every fact shows where it came from.</p>
        <div className="button-row">
          <Link href="/explore" className="button">Meet the people <ArrowRight size={20} aria-hidden="true" /></Link>
          <Link href="/ai" className="button button-secondary">Ask a question</Link>
        </div>
      </section>

      <section className="home-section" aria-labelledby="groups-title">
        <h2 id="groups-title">Pick a group</h2>
        <ul className="link-list">
          {groups.map((group) => <li key={group.id}><Link href={`/explore?category=${group.id}`}>
            <span className="link-list-main">
              <strong>{group.name}</strong>
              <span>{group.members.slice(0, 3).map((person) => person.name).join(", ")}{group.members.length > 3 ? ` and ${group.members.length - 3} more` : ""}</span>
            </span>
            <span className="link-list-side">{group.members.length} people <ArrowRight size={20} aria-hidden="true" /></span>
          </Link></li>)}
        </ul>
      </section>

      <section className="home-section" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol className="steps">
          {STEPS.map((step) => <li key={step.title}><strong>{step.title}</strong><span>{step.body}</span></li>)}
        </ol>
      </section>

      <footer className="site-footer">
        <p><strong>DCF Inspiring Personalities</strong> · Dharma Civilization Foundation</p>
        <nav aria-label="Footer">
          <Link href="/explore">People</Link>
          <Link href="/ai">Ask a question</Link>
          <Link href="/resources">Sources</Link>
        </nav>
      </footer>
    </main>
  );
}
