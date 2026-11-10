import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { getDiscoveryPeople, getPhase1People } from "@/lib/phase1/dataset";
import { EXPLORE_CATEGORIES, PROFILE_SECTIONS, approvedStatements, exploreCategory, monogram } from "./explore/explore-data";
import "./home.css";

export const metadata: Metadata = {
  title: "DCF Inspiring Personalities",
  description: "Explore 25 evidence-grounded profiles across the approved DCF Phase 1 collection.",
};

const SOURCE_TYPES: Record<string, string> = { primary_text: "Original text", institutional: "Institutional record", scholarly_book: "Scholarly book", scholarly_article: "Scholarly article" };

export default function HomePage() {
  const people = getPhase1People();
  const discovery = getDiscoveryPeople();
  const sourceIds = new Set(people.flatMap((person) => person.sources.filter((source) => source.sourceStatus === "approved").map((source) => source.id)));
  const claimCount = people.reduce((total, person) => total + PROFILE_SECTIONS.reduce((sum, section) => sum + approvedStatements(person, section.key).length, 0), 0);
  const fields = EXPLORE_CATEGORIES.map((category) => ({ ...category, members: discovery.filter((person) => exploreCategory(person.slug).id === category.id) }));

  // A real reviewed claim and its sources, shown as a worked example of how evidence links up.
  const sample = people.find((person) => person.slug === "swami-vivekananda") ?? people[0];
  const sampleClaim = PROFILE_SECTIONS.flatMap((section) => approvedStatements(sample, section.key)).find((claim) => claim.citations.length > 0);
  const sampleSources = sampleClaim ? [...new Set(sampleClaim.citations.map((citation) => citation.sourceId))]
    .map((id) => sample.sources.find((source) => source.id === id)).filter((source) => source !== undefined).slice(0, 3) : [];
  const sampleCategory = exploreCategory(sample.slug);

  const marquee = [...discovery, ...discovery];

  return (
    <main className="home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-glow" aria-hidden="true" />
        <p className="home-eyebrow"><span className="home-pulse" aria-hidden="true" />Dharma Civilization Foundation · {people.length} lives</p>
        <h1 id="home-title" className="home-title"><span>Inspiring</span><span className="home-title-outline">Personalities</span></h1>
        <div className="home-hero-foot">
          <p className="home-lede">The sages, scientists, rulers, reformers and artists who shaped Indian civilization, with the evidence behind every claim.</p>
          <div className="home-actions">
            <Link href="/explore" className="home-button">Explore the collection <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link href="/ai" className="home-button home-button-ghost">Ask DCF</Link>
          </div>
        </div>
      </section>

      <div className="home-marquee" aria-label="People in the collection">
        <div className="home-marquee-track">
          {marquee.map((person, index) => <Link key={`${person.id}-${index}`} href={`/explore/${person.slug}`} tabIndex={index < discovery.length ? 0 : -1} aria-hidden={index >= discovery.length ? true : undefined}>
            <span className={`home-dot cat-${exploreCategory(person.slug).id}`} aria-hidden="true" />{person.name}
          </Link>)}
        </div>
      </div>

      <section className="home-bento" aria-label="Start here">
        <Link href={`/explore/${sample.slug}`} className={`bento bento-feature cat-${sampleCategory.id}`}>
          <span className="bento-label">Featured profile</span>
          <span className="bento-monogram" aria-hidden="true">{monogram(sample.name)}</span>
          <span className="bento-feature-copy">
            <strong>{sample.name}</strong>
            <span>{sample.category?.name || sampleCategory.name}</span>
          </span>
          <span className="bento-cta">Read the profile <ArrowUpRight size={18} aria-hidden="true" /></span>
        </Link>

        <Link href="/ai" className="bento bento-ask">
          <span className="bento-label">Ask DCF</span>
          <span className="bento-chat" aria-hidden="true">
            <span className="bento-bubble bento-bubble-you">What did C. V. Raman discover?</span>
            <span className="bento-bubble bento-bubble-dcf">An answer in plain words, with every fact linked to its source <i>1</i> <i>2</i></span>
          </span>
          <span className="bento-cta">Ask a question <ArrowUpRight size={18} aria-hidden="true" /></span>
        </Link>

        <div className="bento bento-stat"><strong>{people.length}</strong><span>People</span></div>
        <div className="bento bento-stat"><strong>{claimCount}</strong><span>Reviewed claims</span></div>
        <div className="bento bento-stat"><strong>{sourceIds.size}</strong><span>Approved sources</span></div>

        <Link href="/explore" className="bento bento-explore">
          <span className="bento-label">Explore</span>
          <span className="bento-stack" aria-hidden="true">{discovery.slice(0, 6).map((person) => <span key={person.id} className={`cat-${exploreCategory(person.slug).id}`}>{monogram(person.name)}</span>)}</span>
          <strong>Search and browse every person by field, role or era.</strong>
          <span className="bento-cta">Open Explore <ArrowUpRight size={18} aria-hidden="true" /></span>
        </Link>
      </section>

      <section className="home-index" aria-labelledby="fields-title">
        <div className="home-section-head">
          <p className="home-eyebrow">Browse by field</p>
          <h2 id="fields-title">Five fields. Twenty-five lives.</h2>
        </div>
        <ol>
          {fields.map((field, index) => <li key={field.id} className={`cat-${field.id}`}><Link href={`/explore?category=${field.id}`}>
            <span className="home-index-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="home-index-name">{field.name}</span>
            <span className="home-index-people">{field.members.slice(0, 3).map((person) => person.name).join(", ")}{field.members.length > 3 ? ` +${field.members.length - 3}` : ""}</span>
            <span className="home-index-count">{field.members.length}<ArrowRight size={20} aria-hidden="true" /></span>
          </Link></li>)}
        </ol>
      </section>

      {sampleClaim && <section className="home-evidence" aria-labelledby="evidence-title">
        <div className="home-section-head">
          <p className="home-eyebrow">How it works</p>
          <h2 id="evidence-title">Every claim links to a source.</h2>
          <p>Each statement on a profile has been reviewed and is tied to the texts, books and institutional records it comes from.</p>
        </div>
        <div className="home-evidence-demo">
          <div className="home-claim">
            <span className="bento-label">Claim · {sample.name}</span>
            <p>{sampleClaim.text}</p>
          </div>
          <ul className="home-claim-sources">
            {sampleSources.map((source) => <li key={source.id}><span>{SOURCE_TYPES[source.sourceType] ?? "Source record"}</span><strong>{source.title}</strong></li>)}
          </ul>
        </div>
      </section>}

      <footer className="home-footer">
        <p className="home-footer-mark" aria-hidden="true">DCF</p>
        <div className="home-footer-row">
          <span>Inspiring Personalities · Dharma Civilization Foundation</span>
          <nav aria-label="Footer">
            <Link href="/explore">Explore</Link>
            <Link href="/ai">Ask</Link>
            <Link href="/resources">Sources</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
