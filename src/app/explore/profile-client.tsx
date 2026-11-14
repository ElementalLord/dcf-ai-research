"use client";

import Link from "next/link";
import { useState } from "react";
import type { Phase1Source, Phase1Statement, Phase1StudyFramework, RelatedPerson } from "@/lib/phase1/types";
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

  return <details className="explore-claim" open={allOpen ? true : undefined} key={`${statement.claimId}-${allOpen}`}>
    <summary><span>{statement.text}</span><small>{cited.length} {cited.length === 1 ? "source" : "sources"}</small></summary>
    <div className="explore-evidence">{cited.map((source) => <div key={source.id}><SourceLink source={source} /><span>{sourceType(source)}</span></div>)}</div>
  </details>;
}

const FRAMEWORK_HEADINGS: Record<string, string> = { rishi: "Studied as a rishi", ruler: "Studied as a ruler" };

function StudyFramework({ framework, sources, allOpen }: { framework: Phase1StudyFramework; sources: Phase1Source[]; allOpen: boolean }) {
  const documented = framework.parameters.filter((parameter) => parameter.status === "documented").length;
  return <section id="framework" className="explore-framework">
    <h2>{FRAMEWORK_HEADINGS[framework.id] ?? framework.title}</h2>
    <p>The {framework.parameters.length} parameters from DCF&apos;s {framework.title.replace(/^Parameters/, "parameters")} document. {documented} of {framework.parameters.length} are documented by approved sources; the rest are marked as limited rather than filled in.</p>
    <ol className="explore-parameters">{framework.parameters.map((parameter) => <li key={parameter.code} className={parameter.status === "limited" ? "is-limited" : undefined}>
      <details open={allOpen ? true : undefined} key={`${parameter.code}-${allOpen}`}>
        <summary><span>{parameter.name}</span><small>{parameter.status === "limited" ? "Limited information" : `${parameter.claimCount} approved ${parameter.claimCount === 1 ? "claim" : "claims"}`}</small></summary>
        {parameter.note && <p className="explore-limited">{parameter.note}</p>}
        {parameter.fields.filter((field) => field.statements.length).map((field) => <div className="explore-parameter-field" key={field.code}>
          <h3>{field.label}{field.claimCount > field.statements.length && <small> · showing {field.statements.length} of {field.claimCount}</small>}</h3>
          {field.statements.map((claim) => <Claim key={`${claim.claimId}-${allOpen}`} statement={claim} sources={sources} allOpen={allOpen} />)}
        </div>)}
      </details>
    </li>)}</ol>
  </section>;
}

export function ProfileClient({ person, related }: { person: PublicProfilePerson; related: Array<Pick<RelatedPerson, "id" | "slug" | "name" | "detailedCategory" | "eraShort">> }) {
  const [allOpen, setAllOpen] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const sources = person.sources.filter((source) => source.sourceStatus === "approved");
  const sections = profileSections(person);
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
        <dl className="explore-facts">
          <div><dt>Era</dt><dd>{person.era.label}</dd></div>
          <div><dt>Region</dt><dd>{person.region.label}</dd></div>
          {person.type && <div><dt>Role</dt><dd>{person.type}</dd></div>}
        </dl>
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
        {sections.map((section) => <a key={section.key} href={`#${section.key}`} aria-current={current === section.key ? "location" : undefined} onClick={() => setCurrent(section.key)}>{section.title}<span>{section.claims.length || "–"}</span></a>)}
        {person.studyFramework && <a href="#framework" aria-current={current === "framework" ? "location" : undefined} onClick={() => setCurrent("framework")}>{FRAMEWORK_HEADINGS[person.studyFramework.id] ?? person.studyFramework.title}<span>{person.studyFramework.parameters.length}</span></a>}
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
        {sections.length ? sections.map((section) => <section id={section.key} key={section.key} className={`explore-topic ${section.key === "contestedAspects" ? "explore-disputed" : ""}`}><h2>{section.title}</h2>{section.note && <p className="explore-limited"><strong>Limited information.</strong> {section.note}</p>}{section.claims.map((claim) => <Claim key={`${claim.claimId}-${allOpen}`} statement={claim} sources={sources} allOpen={allOpen} />)}</section>) : <section className="explore-review-note"><h2>Claims in review</h2><p>The sources below are available to read. This profile has no published claims yet; Ask may use newer verified knowledge.</p></section>}
        {person.studyFramework && <StudyFramework framework={person.studyFramework} sources={sources} allOpen={allOpen} />}
        <section id="sources" className="explore-source-section">
          <div className="explore-source-heading"><div><h2>Sources</h2><p>{sources.length} source {sources.length === 1 ? "record" : "records"} in this collection. Source inclusion does not mean every claim has been approved.</p></div></div>
          {sources.length ? <>
            <ol className="explore-source-list">{visibleSources.map((source) => <li id={`source-${source.id}`} key={source.id}><SourceLink source={source} /><span>{[sourceType(source), source.author || source.publisherOrInstitution, source.publicationYear].filter(Boolean).join(" · ")}</span></li>)}</ol>
            {sources.length > 8 && <button className="explore-show-sources" type="button" aria-expanded={showAllSources} onClick={() => setShowAllSources(!showAllSources)}>{showAllSources ? "Show fewer sources" : `Show all ${sources.length} sources`}</button>}
          </> : <p>No source records are available yet.</p>}
        </section>
        {related.length > 0 && <section id="related" className="explore-related"><h2>Related people</h2><div>{related.map((candidate) => <Link href={`/explore/${candidate.slug}`} key={candidate.id}><strong>{candidate.name}</strong><small>{candidate.detailedCategory} · {candidate.eraShort}</small></Link>)}</div></section>}
      </div>
    </div>
  </main>;
}
