"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { Phase1Source, Phase1Statement, Phase1StudyFramework, RelatedPerson } from "@/lib/phase1/types";
import { Portrait, type PortraitData } from "@/components/portrait";
import { Arrow, CATEGORY_ICONS, Chakra, Chevron, Compass, Diya, Footsteps, Lotus, Manuscript, Mountain, Seeds, Shankha, Trishula } from "@/components/vedic-icons";
import { applyRoleLens, approvedStatements, exploreCategory, profileSections, type PublicProfilePerson } from "./explore-data";

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

function Claim({ statement, sources, allOpen, focus = false }: { statement: Phase1Statement; sources: Phase1Source[]; allOpen: boolean; focus?: boolean }) {
  const cited = [...new Set(statement.citations.map((citation) => citation.sourceId))]
    .map((id) => sources.find((source) => source.id === id))
    .filter((source): source is Phase1Source => Boolean(source));

  return <details className={focus ? "pf-claim is-focus" : "pf-claim"} open={allOpen ? true : undefined} key={`${statement.claimId}-${allOpen}`}>
    <summary><span className="pf-claim-text">{statement.text}</span><span className="pf-claim-count">{cited.length} {cited.length === 1 ? "source" : "sources"}<Chevron size={14} /></span></summary>
    <ul className="pf-evidence">{cited.map((source) => <li key={source.id}><SourceLink source={source} /><span>{sourceType(source)}</span></li>)}</ul>
  </details>;
}

const LENS_EVENT = "dcf-lens-change";
const readLensFromUrl = () => new URLSearchParams(window.location.search).get("lens");
function subscribeToLens(onChange: () => void) {
  window.addEventListener(LENS_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => { window.removeEventListener(LENS_EVENT, onChange); window.removeEventListener("popstate", onChange); };
}

const FRAMEWORK_HEADINGS: Record<string, string> = { rishi: "Studied as a rishi", ruler: "Studied as a ruler" };
const SECTION_ICONS: Record<string, typeof Lotus> = {
  shortIntroduction: Lotus, lifeAndContext: Footsteps, qualitiesValues: Diya, contributions: Seeds,
  leadershipRelationalCharacteristics: Trishula, challenges: Mountain, contemporaryRelevance: Shankha, contestedAspects: Compass,
};

function StudyFramework({ framework, sources, allOpen }: { framework: Phase1StudyFramework; sources: Phase1Source[]; allOpen: boolean }) {
  const documented = framework.parameters.filter((parameter) => parameter.status === "documented").length;
  return <section id="framework" className="pf-section pf-framework">
    <h2><Chakra size={20} />{FRAMEWORK_HEADINGS[framework.id] ?? framework.title}</h2>
    <p className="pf-intro">The {framework.parameters.length} parameters from DCF&apos;s {framework.title.replace(/^Parameters/, "parameters")} document. {documented} of {framework.parameters.length} are documented by approved sources; the rest are marked as limited rather than filled in.</p>
    <ol className="pf-parameters">{framework.parameters.map((parameter) => <li key={parameter.code} className={parameter.status === "limited" ? "is-limited" : undefined}>
      <details open={allOpen ? true : undefined} key={`${parameter.code}-${allOpen}`}>
        <summary><span>{parameter.name}</span><small>{parameter.status === "limited" ? "Limited information" : `${parameter.claimCount} approved ${parameter.claimCount === 1 ? "claim" : "claims"}`}</small><Chevron size={15} /></summary>
        {parameter.note && <p className="pf-limited">{parameter.note}</p>}
        {parameter.fields.filter((field) => field.statements.length).map((field) => <div className="pf-parameter-field" key={field.code}>
          <h3>{field.label}{field.claimCount > field.statements.length && <small> · showing {field.statements.length} of {field.claimCount}</small>}</h3>
          {field.statements.map((claim) => <Claim key={`${claim.claimId}-${allOpen}`} statement={claim} sources={sources} allOpen={allOpen} />)}
        </div>)}
      </details>
    </li>)}</ol>
  </section>;
}

export function ProfileClient({ person, related, portrait = null, relatedPortraits = {} }: { person: PublicProfilePerson; related: Array<Pick<RelatedPerson, "id" | "slug" | "name" | "detailedCategory" | "eraShort">>; portrait?: PortraitData | null; relatedPortraits?: Record<string, PortraitData> }) {
  const [allOpen, setAllOpen] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const sources = person.sources.filter((source) => source.sourceStatus === "approved");
  // The chosen lens lives in the URL (/explore/rabindranath-tagore?lens=educator) so it can be shared.
  const lensId = useSyncExternalStore(subscribeToLens, readLensFromUrl, () => null);
  const chooseLens = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("lens", id); else url.searchParams.delete("lens");
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(LENS_EVENT));
  };
  const lens = person.roleLenses.find((item) => item.id === lensId) ?? null;
  const focusIds = new Set(lens?.focusClaimIds ?? []);
  const sections = applyRoleLens(profileSections(person), lens);
  const claims = sections.reduce((total, section) => total + section.claims.length, 0);
  const lede = approvedStatements(person, "shortIntroduction").slice(0, 2).map((claim) => claim.text).join(" ");
  const category = exploreCategory(person.slug);
  const firstName = person.shortName;
  const visibleSources = showAllSources ? sources : sources.slice(0, 8);
  const lensLabel = (lens: string) => lens.replaceAll("_", " ");

  const CategoryIcon = CATEGORY_ICONS[category.id] ?? Lotus;
  const tocLinks = [
    { id: "angles", label: "Ways in", count: person.angles.length },
    ...sections.map((section) => ({ id: section.key, label: section.title, count: section.claims.length })),
    ...(person.studyFramework ? [{ id: "framework", label: FRAMEWORK_HEADINGS[person.studyFramework.id] ?? person.studyFramework.title, count: person.studyFramework.parameters.length }] : []),
    { id: "sources", label: "Sources", count: sources.length },
    ...(related.length ? [{ id: "related", label: "Related lives", count: related.length }] : []),
  ];

  return <main className={`explore-shell pf cat-${category.id}`}>
    <nav className="pf-crumb" aria-label="Breadcrumb"><Link href="/explore">All lives</Link><span aria-hidden="true">/</span><Link href={`/explore?category=${category.id}`}>{category.name}</Link></nav>
    <header className="pf-hero">
      <figure className="pf-portrait">
        <Portrait name={person.name} portrait={portrait} category={category.id} size={208} className="pf-portrait-img" />
        {portrait && <figcaption>Portrait: <a href={portrait.source} target="_blank" rel="noopener noreferrer">{portrait.author}</a>, {portrait.license}, via Wikimedia Commons</figcaption>}
      </figure>
      <div className="pf-hero-copy">
        <p className="pf-field"><CategoryIcon size={16} />{category.name}</p>
        <h1>{person.name}</h1>
        <dl className="pf-facts">
          <div><dt>Era</dt><dd>{person.era.label}</dd></div>
          <div><dt>Region</dt><dd>{person.region.label}</dd></div>
          {person.type && <div><dt>Role</dt><dd>{person.type}</dd></div>}
        </dl>
        <p className="pf-lede">{lede || `Explore the collected sources for ${person.name}. Biographical claims are being reviewed before publication.`}</p>
        <div className="pf-hero-actions">
          <Link href={`/ai?person=${person.slug}`} className="key key-hot">Ask Sutradhar about {firstName}<Arrow size={16} /></Link>
          <p className="pf-evidence-summary"><strong>{sources.length}</strong> {sources.length === 1 ? "source" : "sources"}<span aria-hidden="true">·</span><strong>{claims}</strong> approved {claims === 1 ? "claim" : "claims"}</p>
        </div>
      </div>
    </header>

    {person.roleLenses.length > 0 && <section className="pf-lens" aria-labelledby="lens-heading">
      <h2 id="lens-heading">View {firstName} as</h2>
      <div role="group" aria-label="Lens" className="pf-lens-options">
        <button type="button" aria-pressed={!lens} onClick={() => chooseLens(null)}>Whole profile</button>
        {person.roleLenses.map((item) => <button type="button" key={item.id} aria-pressed={lens?.id === item.id} onClick={() => chooseLens(item.id)}>{item.label}</button>)}
      </div>
      {lens && <div className="pf-lens-focus" aria-live="polite">
        <p>The same approved facts, refocused: {lens.claimCount} {lens.claimCount === 1 ? "claim is" : "claims are"} about {firstName}&apos;s role as {lens.label.toLowerCase()}. They come first below, and the most relevant sections move up. Nothing is added or removed.</p>
        <h3>Key evidence for this role</h3>
        {lens.focusStatements.map((claim) => <Claim key={`lens-${claim.claimId}-${allOpen}`} statement={claim} sources={sources} allOpen={allOpen} focus />)}
      </div>}
    </section>}

    <div className="pf-layout">
      <nav className="pf-toc" aria-label="On this page">
        <p>On this page</p>
        {tocLinks.map((link) => <a key={link.id} href={`#${link.id}`} aria-current={current === link.id ? "location" : undefined} onClick={() => setCurrent(link.id)}>{link.label}<span>{link.count || "–"}</span></a>)}
      </nav>
      <div className="pf-main">
        <section id="angles" className="pf-section">
          <h2><Compass size={20} />Ways in</h2>
          <p className="pf-intro">Questions for reading the sources. They are starting points, not approved claims.</p>
          <div className="pf-angles">{person.angles.map((angle) => <article key={angle.title} className="pf-angle"><span>{lensLabel(angle.lens)}</span><h3>{angle.title}</h3><p>{angle.question}</p></article>)}</div>
        </section>
        <div className="pf-tools"><span>{claims} approved {claims === 1 ? "claim" : "claims"}; open one to see its sources.</span>{claims > 0 && <button type="button" className="key" onClick={() => setAllOpen(!allOpen)}>{allOpen ? "Hide all evidence" : "Show all evidence"}</button>}</div>
        {sections.length ? sections.map((section) => {
          const Icon = SECTION_ICONS[section.key] ?? Lotus;
          return <section id={section.key} key={section.key} className={`pf-section${section.key === "contestedAspects" ? " pf-disputed" : ""}`}>
            <h2><Icon size={20} />{section.title}</h2>
            {section.note && <p className="pf-limited"><strong>Limited information.</strong> {section.note}</p>}
            {section.claims.length > 0 && <div className="pf-claims">{section.claims.map((claim) => <Claim key={`${claim.claimId}-${allOpen}`} statement={claim} sources={sources} allOpen={allOpen} focus={focusIds.has(claim.claimId)} />)}</div>}
          </section>;
        }) : <section className="pf-section"><h2><Manuscript size={20} />Claims in review</h2><p className="pf-intro">The sources below are available to read. This profile has no published claims yet; Ask may use newer verified knowledge.</p></section>}
        {person.studyFramework && <StudyFramework framework={person.studyFramework} sources={sources} allOpen={allOpen} />}
        <section id="sources" className="pf-section">
          <h2><Manuscript size={20} />Sources</h2>
          <p className="pf-intro">{sources.length} source {sources.length === 1 ? "record" : "records"} in this collection. Including a source does not mean every claim from it is approved.</p>
          {sources.length ? <>
            <ol className="pf-sources">{visibleSources.map((source) => <li id={`source-${source.id}`} key={source.id}><SourceLink source={source} /><span>{[sourceType(source), source.author || source.publisherOrInstitution, source.publicationYear].filter(Boolean).join(" · ")}</span></li>)}</ol>
            {sources.length > 8 && <button className="key" type="button" aria-expanded={showAllSources} onClick={() => setShowAllSources(!showAllSources)}>{showAllSources ? "Show fewer sources" : `Show all ${sources.length} sources`}</button>}
          </> : <p className="pf-intro">No source records are available yet.</p>}
        </section>
        {related.length > 0 && <section id="related" className="pf-section">
          <h2><Footsteps size={20} />Related lives</h2>
          <div className="pf-related">{related.map((candidate) => { const field = exploreCategory(candidate.slug).id; return <Link href={`/explore/${candidate.slug}`} key={candidate.id} className={`pf-related-card cat-${field}`}>
            <Portrait name={candidate.name} portrait={relatedPortraits[candidate.slug]} category={field} size={52} />
            <span><strong>{candidate.name}</strong><small>{candidate.detailedCategory} · {candidate.eraShort}</small></span><Arrow size={16} />
          </Link>; })}</div>
        </section>}
      </div>
    </div>
  </main>;
}
