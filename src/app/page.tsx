import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import "./track2.css";

export const metadata: Metadata = {
  title: "DCF Inspiring Personalities",
  description: "Explore 25 evidence-grounded profiles across the approved DCF Phase 1 collection.",
};

export default function HomePage() {
  return (
    <main className="home-page page-shell">
      <section className="home-hero">
        <div>
          <p className="section-label">DCF Inspiring Personalities · Phase 1</p>
          <h1>Meet the people.<br /><em>Follow the evidence.</em></h1>
        </div>
        <div className="home-hero-copy">
          <p>Discover 25 evidence-grounded profiles across philosophy, social change, science, public leadership, culture, and institution building.</p>
          <div className="home-actions">
            <Link href="/explore" className="home-primary">Explore the collection <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link href="/ai" className="home-secondary">Ask a deeper question</Link>
          </div>
        </div>
      </section>
      <section className="home-overview">
        <div><p className="section-label">How to use the collection</p><h2>Start with a person, then choose how you want to understand them.</h2></div>
        <div className="home-steps">
          <article><span>01</span><div><h3>Browse or search</h3><p>Explore five public categories or find any personality by name.</p></div></article>
          <article><span>02</span><div><h3>Read the profile</h3><p>Move through context, qualities, contributions, challenges, and continuing relevance.</p></div></article>
          <article><span>03</span><div><h3>Change the lens</h3><p>Bring scientific, cultural, spiritual, political, or other relevant evidence into focus.</p></div></article>
          <article><span>04</span><div><h3>Inspect and continue</h3><p>Open sources or follow a clear connection to another personality.</p></div></article>
        </div>
      </section>
    </main>
  );
}
