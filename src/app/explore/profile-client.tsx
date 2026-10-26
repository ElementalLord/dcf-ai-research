"use client";

import Link from "next/link";
import { useState } from "react";
import type { Phase1Source, Phase1Statement, RelatedPerson } from "@/lib/phase1/types";
import { approvedStatements, exploreCategory, PROFILE_SECTIONS, type PublicProfilePerson } from "./explore-data";

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

  return <details className="explore-claim" open={allOpen ? true : undefined} key={`${statement.claimId}-${allOpen}`}>
    <summary><span>{statement.text}</span><small>{cited.length} {cited.length === 1 ? "source" : "sources"}</small></summary>
    <div className="explore-evidence">{cited.map((source) => <div key={source.id}><SourceLink source={source} /><span>{sourceType(source)}</span></div>)}</div>
  </details>;
}

export function ProfileClient({ person, related }: { person: PublicProfilePerson; related: Array<Pick<RelatedPerson, "id" | "slug" | "name" | "detailedCategory" | "era">> }) {
  const [allOpen, setAllOpen] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const sources = person.sources.filter((source) => source.sourceStatus === "approved");
  const admittedIds = new Set(sources.map((source) => source.id));
  const uncertain = PROFILE_SECTIONS
    .filter((section) => section.key !== "contestedAspects")
    .flatMap((section) => person[section.key].filter((claim) => claim.reviewStatus === "approved" && claim.evidenceType === "uncertain" && claim.citations.some((citation) => admittedIds.has(citation.sourceId))));
  const sections = PROFILE_SECTIONS
    .map((section) => ({ ...section, claims: section.key === "contestedAspects" ? [...approvedStatements(person, section.key), ...uncertain] : approvedStatements(person, section.key) }))
    .filter((section) => section.claims.length);
  const claims = sections.reduce((total, section) => total + section.claims.length, 0);
  const lede = approvedStatements(person, "shortIntroduction").slice(0, 2).map((claim) => claim.text).join(" ");
  const category = exploreCategory(person.slug);
  const firstName = person.name.startsWith("A. P. J.") ? "Kalam" : person.name.split(" ")[0];
  const visibleSources = showAllSources ? sources : sources.slice(0, 8);
  const lensLabel = (lens: string) => lens.replaceAll("_", " ");

  return <main className="explore-shell explore-profile">
    <nav className="explore-crumb" aria-label="Breadcrumb"><Link href="/explore">Explore</Link><span aria-hidden="true">/</span><Link href={`/explore?category=${category.id}`}>{category.name}</Link></nav>
    <header className="explore-profile-hero">
      <div>
        <h1>{person.name}</h1>
        {person.type && <p className="explore-facts">{[person.era, person.region, person.type].filter(Boolean).join(" · ")}</p>}
        <p className="explore-lede">{lede || `Explore the collected sources for ${person.name}. Biographical claims are being reviewed before publication.`}</p>
      </div>
      <aside className="explore-trust" aria-label="Evidence summary">
        <strong>{sources.length} {sources.length === 1 ? "source" : "sources"}</strong>
        <p>{claims} approved profile {claims === 1 ? "claim" : "claims"}{claims ? ", linked to supporting sources." : ". Source records are available below."}</p>
        <Link href="/ai">Ask about {firstName}</Link>
      </aside>
    </header>
    <div className="explore-profile-layout">
      <nav className="explore-toc" aria-label="On this page">
        <h2>On this page</h2>
        <a href="#angles" aria-current={current === "angles" ? "location" : undefined} onClick={() => setCurrent("angles")}>Explore by angle<span>{person.angles.length}</span></a>
        {sections.map((section) => <a key={section.key} href={`#${section.key}`} aria-current={current === section.key ? "location" : undefined} onClick={() => setCurrent(section.key)}>{section.title}<span>{section.claims.length}</span></a>)}
        <a href="#sources" aria-current={current === "sources" ? "location" : undefined} onClick={() => setCurrent("sources")}>Sources<span>{sources.length}</span></a>
        {related.length > 0 && <a href="#related" aria-current={current === "related" ? "location" : undefined} onClick={() => setCurrent("related")}>Related people</a>}
      </nav>
      <div className="explore-profile-main">
        <section id="angles" className="explore-angles">
          <h2>Explore by angle</h2>
          <p>Questions for reading the source collection. These are starting points, not approved claims.</p>
          <div className="explore-angle-grid">{person.angles.map((angle) => <article key={angle.title} className="explore-angle"><span>{lensLabel(angle.lens)}</span><h3>{angle.title}</h3><p>{angle.question}</p></article>)}</div>
        </section>
        <div className="explore-profile-tools"><span>{claims} approved profile {claims === 1 ? "claim" : "claims"}</span>{claims > 0 && <button type="button" onClick={() => setAllOpen(!allOpen)}>{allOpen ? "Hide all evidence" : "Show all evidence"}</button>}</div>
        {sections.length ? sections.map((section) => <section id={section.key} key={section.key} className={`explore-topic ${section.key === "contestedAspects" ? "explore-disputed" : ""}`}><h2>{section.title}</h2>{section.claims.map((claim) => <Claim key={`${claim.claimId}-${allOpen}`} statement={claim} sources={sources} allOpen={allOpen} />)}</section>) : <section className="explore-review-note"><h2>Claims in review</h2><p>The sources below are available to read. This profile has no published claims yet; Ask may use newer verified knowledge.</p></section>}
        <section id="sources" className="explore-source-section">
          <div className="explore-source-heading"><div><h2>Sources</h2><p>{sources.length} source {sources.length === 1 ? "record" : "records"} in this collection. Source inclusion does not mean every claim has been approved.</p></div></div>
          {sources.length ? <>
            <ol className="explore-source-list">{visibleSources.map((source) => <li id={`source-${source.id}`} key={source.id}><SourceLink source={source} /><span>{[sourceType(source), source.author || source.publisherOrInstitution, source.publicationYear].filter(Boolean).join(" · ")}</span></li>)}</ol>
            {sources.length > 8 && <button className="explore-show-sources" type="button" aria-expanded={showAllSources} onClick={() => setShowAllSources(!showAllSources)}>{showAllSources ? "Show fewer sources" : `Show all ${sources.length} sources`}</button>}
          </> : <p>No source records are available yet.</p>}
        </section>
        {related.length > 0 && <section id="related" className="explore-related"><h2>Related people</h2><div>{related.map((candidate) => <Link href={`/explore/${candidate.slug}`} key={candidate.id}><strong>{candidate.name}</strong><small>{candidate.detailedCategory}{candidate.era ? ` · ${candidate.era}` : ""}</small></Link>)}</div></section>}
      </div>
    </div>
  </main>;
}
