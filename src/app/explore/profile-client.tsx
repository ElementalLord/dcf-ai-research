"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import type { Phase1Source, Phase1Statement, RelatedPerson } from "@/lib/phase1/types";
import { approvedStatements, exploreCategory, profileSections, type PublicProfilePerson } from "./explore-data";

function sourceType(source: Phase1Source) {
  const names: Record<string, string> = {
    primary_text: "Original text",
    institutional: "Institutional record",
    scholarly_book: "Scholarly book",
    scholarly_article: "Scholarly article",
  };
  return names[source.sourceType] ?? "Source record";
}

function SourceLink({ source }: { source: Phase1Source }) {
  return <a href={source.url || `#source-${source.id}`} target={source.url ? "_blank" : undefined} rel={source.url ? "noopener noreferrer" : undefined}>{source.title}</a>;
}

function Claim({ statement, sources, allOpen }: { statement: Phase1Statement; sources: Phase1Source[]; allOpen: boolean }) {
  const cited = [...new Set(statement.citations.map((citation) => citation.sourceId))]
    .map((id) => sources.find((source) => source.id === id))
    .filter((source): source is Phase1Source => Boolean(source));

  return <li><details className="fact" open={allOpen ? true : undefined}>
    <summary><span className="fact-text">{statement.text}</span><span className="fact-toggle">Where is this from? ({cited.length})</span></summary>
    <ul className="fact-sources">{cited.map((source) => <li key={source.id}><SourceLink source={source} /> <span>{sourceType(source)}</span></li>)}</ul>
  </details></li>;
}

export function ProfileClient({ person, related }: { person: PublicProfilePerson; related: Array<Pick<RelatedPerson, "id" | "slug" | "name" | "detailedCategory" | "era">> }) {
  const [allOpen, setAllOpen] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const sources = person.sources.filter((source) => source.sourceStatus === "approved");
  const sections = profileSections(person);
  const claims = sections.reduce((total, section) => total + section.claims.length, 0);
  const lede = approvedStatements(person, "shortIntroduction").slice(0, 2).map((claim) => claim.text).join(" ");
  const category = exploreCategory(person.slug);
  const visibleSources = showAllSources ? sources : sources.slice(0, 8);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return <main className="page explore-shell profile">
    <nav className="back-link" aria-label="Breadcrumb"><Link href="/explore"><ArrowLeft size={18} aria-hidden="true" /> All people</Link><span aria-hidden="true">/</span><Link href={`/explore?category=${category.id}`}>{category.name}</Link></nav>
    <header className="profile-header">
      <h1>{person.name}</h1>
      {person.type && <p className="profile-facts">{[person.era, person.region, person.type].filter(Boolean).join(" · ")}</p>}
      <p className="lede">{lede || (claims ? `Read the checked facts about ${person.name} below. Tap any fact to see where it came from.` : `We are still checking the facts about ${person.name}. You can already read the sources below.`)}</p>
      <p className="profile-count">{plural(claims, "checked fact", "checked facts")} · {plural(sources.length, "source", "sources")}</p>
      <div className="button-row"><Link className="button" href="/ai">Ask about {person.name} <ArrowRight size={20} aria-hidden="true" /></Link></div>
    </header>

    <nav className="jump-links" aria-label="On this page">
      <span>Jump to:</span>
      {sections.map((section) => <a key={section.key} href={`#${section.key}`}>{section.title}</a>)}
      {person.angles.length > 0 && <a href="#angles">Questions</a>}
      <a href="#sources">Sources</a>
      {related.length > 0 && <a href="#related">Related people</a>}
    </nav>

    {claims > 0 && <div className="profile-tools"><button type="button" className="text-button" onClick={() => setAllOpen(!allOpen)}>{allOpen ? "Hide where facts came from" : "Show where every fact came from"}</button></div>}
    {sections.length ? sections.map((section) => <section id={section.key} key={section.key} className={`profile-section ${section.key === "contestedAspects" ? "is-disputed" : ""}`}>
      <h2>{section.title}</h2>
      {section.key === "contestedAspects" && <p className="section-note">People do not all agree about these.</p>}
      <ul className="fact-list">{section.claims.map((claim) => <Claim key={`${claim.claimId}-${allOpen}`} statement={claim} sources={sources} allOpen={allOpen} />)}</ul>
    </section>) : <section className="profile-section"><h2>Facts are being checked</h2><p>This page has no checked facts yet. The sources below are ready to read.</p></section>}

    {person.angles.length > 0 && <section id="angles" className="profile-section">
      <h2>Questions to think about</h2>
      <p className="section-note">Ideas to explore. These are questions, not checked facts.</p>
      <ul className="question-list">{person.angles.map((angle) => <li key={angle.title}><strong>{angle.title}</strong> {angle.question}</li>)}</ul>
    </section>}

    <section id="sources" className="profile-section">
      <h2>Sources</h2>
      <p className="section-note">Books, texts and records we used. Being listed here does not mean every fact is checked yet.</p>
      {sources.length ? <>
        <ol className="source-list">{visibleSources.map((source) => <li id={`source-${source.id}`} key={source.id}><SourceLink source={source} /><span>{[sourceType(source), source.author || source.publisherOrInstitution, source.publicationYear].filter(Boolean).join(" · ")}</span></li>)}</ol>
        {sources.length > 8 && <button className="button button-secondary" type="button" aria-expanded={showAllSources} onClick={() => setShowAllSources(!showAllSources)}>{showAllSources ? "Show fewer sources" : `Show all ${sources.length} sources`}</button>}
      </> : <p>No sources yet.</p>}
    </section>

    {related.length > 0 && <section id="related" className="profile-section">
      <h2>You might also like</h2>
      <ul className="link-list">{related.map((candidate) => <li key={candidate.id}><Link href={`/explore/${candidate.slug}`}>
        <span className="link-list-main"><strong>{candidate.name}</strong><span>{candidate.detailedCategory}{candidate.era ? ` · ${candidate.era}` : ""}</span></span>
        <span className="link-list-side"><ArrowRight size={22} aria-hidden="true" /></span>
      </Link></li>)}</ul>
    </section>}
  </main>;
}
