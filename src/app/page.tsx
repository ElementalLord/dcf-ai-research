import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { getDiscoveryPeople, getPhase1People } from "@/lib/phase1/dataset";
import { EXPLORE_CATEGORIES, PROFILE_SECTIONS, approvedStatements, exploreCategory } from "./explore/explore-data";

export const metadata: Metadata = {
  title: "DCF Inspiring Personalities",
  description: "Explore 25 evidence-grounded profiles across the approved DCF Phase 1 collection.",
};

const PATHS = [
  { href: "/explore", title: "Explore", body: "Search and browse every person by field, role or era." },
  { href: "/ai", title: "Ask", body: "Ask a question and get an answer that cites its sources." },
  { href: "/resources", title: "Sources", body: "See the reviewed sources and claims behind each profile." },
];

export default function HomePage() {
  const people = getPhase1People();
  const discovery = getDiscoveryPeople();
  const sourceIds = new Set(people.flatMap((person) => person.sources.filter((source) => source.sourceStatus === "approved").map((source) => source.id)));
  const claimCount = people.reduce((total, person) => total + PROFILE_SECTIONS.reduce((sum, section) => sum + approvedStatements(person, section.key).length, 0), 0);
  const fields = EXPLORE_CATEGORIES.map((category) => ({ ...category, members: discovery.filter((person) => exploreCategory(person.slug).id === category.id) }));
  const featured = fields.map((field) => field.members[0]).filter(Boolean);
  const sample = people.find((person) => person.slug === "swami-vivekananda") ?? people[0];

  return (
    <main className="landing">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <h1 id="landing-title">Inspiring Personalities</h1>
          <p className="landing-tagline">{people.length} lives, with the evidence behind every claim.</p>
          <p className="landing-lede">Profiles of the sages, scientists, rulers, reformers and artists who shaped Indian civilization, built from reviewed sources you can open and check.</p>
          <div className="landing-actions">
            <Link href="/explore" className="brand-button">Explore the collection <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link href="/ai" className="brand-button brand-button-quiet">Ask DCF</Link>
          </div>
        </div>
        <div className="landing-featured">
          <h2>In the collection</h2>
          <ul>
            {featured.map((person) => <li key={person.id}><Link href={`/explore/${person.slug}`}>
              <span className={`brand-dot dot-${exploreCategory(person.slug).id}`} aria-hidden="true" />
              <span><strong>{person.name}</strong><small>{person.detailedCategory || exploreCategory(person.slug).name}</small></span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link></li>)}
          </ul>
          <Link className="landing-text-link" href="/explore">See all {people.length} people <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      </section>

      <nav className="landing-paths" aria-label="Ways in">
        {PATHS.map((path) => <Link key={path.href} href={path.href}>
          <span className="landing-path-title">{path.title}<ArrowRight size={22} aria-hidden="true" /></span>
          <span>{path.body}</span>
        </Link>)}
      </nav>

      <section className="landing-evidence" aria-labelledby="evidence-title">
        <div>
          <h2 id="evidence-title">Every claim links to a source</h2>
          <p>Each statement on a profile has been reviewed and is tied to the texts, books and institutional records it comes from. Open any claim to see exactly where it came from.</p>
          {sample && <Link className="landing-text-link" href={`/explore/${sample.slug}`}>Read the {sample.name} profile <ArrowRight size={15} aria-hidden="true" /></Link>}
        </div>
        <dl>
          <div><dt>{people.length}</dt><dd>People</dd></div>
          <div><dt>{claimCount}</dt><dd>Reviewed claims</dd></div>
          <div><dt>{sourceIds.size}</dt><dd>Approved sources</dd></div>
          <div><dt>{EXPLORE_CATEGORIES.length}</dt><dd>Fields</dd></div>
        </dl>
      </section>

      <section className="landing-fields" aria-labelledby="fields-title">
        <h2 id="fields-title">Browse by field</h2>
        <ul>
          {fields.map((field) => <li key={field.id}><Link href={`/explore?category=${field.id}`}>
            <span className="landing-field-name"><span className={`brand-dot dot-${field.id}`} aria-hidden="true" />{field.name}</span>
            <span className="landing-field-people">{field.members.slice(0, 3).map((person) => person.name).join(", ")}{field.members.length > 3 ? ` and ${field.members.length - 3} more` : ""}</span>
            <span className="landing-field-count">{field.members.length}</span>
          </Link></li>)}
        </ul>
      </section>

      <footer className="landing-footer">
        <div>
          <strong>DCF Inspiring Personalities</strong>
          <span>Dharma Civilization Foundation</span>
        </div>
        <nav aria-label="Footer">
          <Link href="/explore">Explore</Link>
          <Link href="/ai">Ask</Link>
          <Link href="/resources">Sources <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </nav>
      </footer>
    </main>
  );
}
