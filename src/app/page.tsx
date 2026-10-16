import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenText, MessageCircleMore, Search } from "lucide-react";
import { MysticBackdrop } from "@/components/mystic-backdrop";
import { ExploreConstellation } from "./explore/explore-constellation";
import "./track2.css";

export const metadata: Metadata = {
  title: "DCF Inspiring Personalities",
  description: "Explore 25 evidence-grounded profiles across the approved DCF Phase 1 collection.",
};

export default function HomePage() {
  return (
    <main className="home-page page-shell">
      <MysticBackdrop />
      <ExploreConstellation />

      <div className="page-kicker">DCF / INSPIRING PERSONALITIES</div>

      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-heading">
          <p className="section-label">Twenty-five lives. One living archive.</p>
          <h1 id="home-title">History is more than a story. <em>It&apos;s a conversation.</em></h1>
        </div>
        <div className="home-hero-copy">
          <p>Explore the people who shaped ideas, institutions, and culture—through profiles grounded in evidence and questions that take you deeper.</p>
          <div className="home-actions">
            <Link href="/explore" className="home-primary">Explore the collection <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link href="/ai" className="home-secondary">Ask DCF</Link>
          </div>
          <dl className="home-stats" aria-label="Collection at a glance">
            <div><dt>25</dt><dd>evidence-grounded profiles</dd></div>
            <div><dt>5</dt><dd>fields of inquiry</dd></div>
            <div><dt>1</dt><dd>connected research experience</dd></div>
          </dl>
        </div>
      </section>

      <section className="home-overview">
        <header>
          <p className="section-label">Choose your way in</p>
          <h2>Follow a curiosity.<br />Find the evidence.</h2>
          <p>Every path is designed to move naturally from discovery to understanding, without losing sight of the source.</p>
        </header>
        <div className="home-paths">
          <Link href="/explore" className="home-path-card">
            <span className="home-path-icon"><Search size={19} aria-hidden="true" /></span>
            <span className="home-path-number">01</span>
            <strong>Discover a person</strong>
            <span>Browse the collection by field, role, or name, then follow connections across lives.</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link href="/explore" className="home-path-card">
            <span className="home-path-icon"><BookOpenText size={19} aria-hidden="true" /></span>
            <span className="home-path-number">02</span>
            <strong>Read with context</strong>
            <span>Move through contributions, challenges, continuing relevance, and the sources behind each claim.</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link href="/ai" className="home-path-card">
            <span className="home-path-icon"><MessageCircleMore size={19} aria-hidden="true" /></span>
            <span className="home-path-number">03</span>
            <strong>Ask what comes next</strong>
            <span>Turn curiosity into a grounded conversation and inspect the citations as you go.</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="home-footer">
        <span>DCF Inspiring Personalities · Phase 1</span>
        <Link href="/resources">See the research foundation <ArrowRight size={15} aria-hidden="true" /></Link>
      </footer>
    </main>
  );
}
