"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ExternalLink, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MysticBackdrop } from "@/components/mystic-backdrop";
import type { Phase1Personality, Phase1Source, Phase1Statement, RelatedPerson } from "@/lib/phase1/types";
import { ExploreConstellation } from "./explore-constellation";

type SectionKey = "lifeAndContext" | "qualitiesValues" | "contributions" | "leadershipRelationalCharacteristics" | "challenges" | "contestedAspects" | "contemporaryRelevance";

const SECTIONS: Array<{ key: SectionKey; title: string; description: string }> = [
  { key: "lifeAndContext", title: "Life & Context", description: "Formation, vocation, and historical setting" },
  { key: "qualitiesValues", title: "Core Qualities & Values", description: "Evidenced principles, practices, and dispositions" },
  { key: "contributions", title: "Key Contributions", description: "Principal work, ideas, institutions, and public action" },
  { key: "leadershipRelationalCharacteristics", title: "Leadership & Relationships", description: "Collaboration, mentorship, lineage, and leadership" },
  { key: "challenges", title: "Challenges", description: "Obstacles, limits, conflict, and persistence" },
  { key: "contestedAspects", title: "Balanced View & Complexities", description: "Approved contested material and interpretive limits" },
  { key: "contemporaryRelevance", title: "Contemporary Relevance", description: "Continuing influence, memory, and relevance" },
];

const LENS_KEYWORDS: Record<string, string[]> = {
  agricultural: ["agricultur", "dairy", "farmer", "rural", "milk"],
  administrative: ["administr", "govern", "revenue", "policy", "official"],
  architectural: ["architect", "temple", "building", "monument", "construct"],
  artistic: ["art", "film", "music", "perform", "creative", "style"],
  cultural: ["cultur", "tradition", "language", "memory", "heritage"],
  economic: ["econom", "trade", "industry", "revenue", "livelihood"],
  educational: ["educat", "school", "student", "teach", "learn", "mentor"],
  environmental: ["environment", "nature", "river", "forest", "water"],
  gender: ["women", "woman", "gender", "female"],
  historical: ["histor", "century", "period", "chronolog", "dated"],
  institutional: ["institution", "founded", "established", "organization", "university"],
  international: ["international", "world", "global", "abroad", "overseas"],
  leadership: ["leader", "leadership", "management", "mobiliz", "responsib"],
  literary: ["liter", "poem", "text", "writ", "book", "hymn"],
  maritime: ["sea", "naval", "maritime", "port", "fleet"],
  military: ["military", "army", "battle", "campaign", "war", "fort"],
  national: ["nation", "india", "independen", "self-reli", "development"],
  philosophical: ["philosoph", "ethic", "truth", "idea", "metaphys", "vedanta"],
  political: ["politic", "state", "king", "colonial", "sovereign", "government"],
  rural_development: ["rural", "village", "farmer", "livelihood", "cooperative"],
  scientific: ["scien", "research", "discover", "experiment", "mathemat", "laboratory"],
  social: ["social", "society", "reform", "service", "equality", "community"],
  spiritual: ["spiritual", "relig", "divine", "devotion", "tapas", "practice"],
  technological: ["technolog", "engineer", "technical", "equipment", "process"],
  textual: ["text", "verse", "veda", "hymn", "recension", "attribut"],
};

const LENS_SECTION_ORDER: Record<string, SectionKey[]> = {
  artistic: ["contributions", "qualitiesValues", "lifeAndContext", "contemporaryRelevance"],
  cultural: ["contributions", "lifeAndContext", "contemporaryRelevance", "qualitiesValues"],
  educational: ["contributions", "leadershipRelationalCharacteristics", "qualitiesValues", "contemporaryRelevance"],
  historical: ["lifeAndContext", "contestedAspects", "contributions", "challenges"],
  institutional: ["contributions", "leadershipRelationalCharacteristics", "lifeAndContext", "contemporaryRelevance"],
  leadership: ["leadershipRelationalCharacteristics", "qualitiesValues", "contributions", "challenges"],
  literary: ["contributions", "lifeAndContext", "qualitiesValues", "contemporaryRelevance"],
  military: ["contributions", "lifeAndContext", "challenges", "leadershipRelationalCharacteristics"],
  philosophical: ["qualitiesValues", "contributions", "lifeAndContext", "contestedAspects"],
  political: ["lifeAndContext", "contributions", "leadershipRelationalCharacteristics", "challenges"],
  scientific: ["contributions", "lifeAndContext", "challenges", "contemporaryRelevance"],
  social: ["contributions", "qualitiesValues", "lifeAndContext", "contemporaryRelevance"],
  spiritual: ["qualitiesValues", "lifeAndContext", "contributions", "leadershipRelationalCharacteristics"],
  textual: ["contributions", "lifeAndContext", "contestedAspects", "qualitiesValues"],
};

const formatLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const sourceType = (value: string) => formatLabel(value).replace("Primary Text", "Primary text");

function sourceNumbers(person: Phase1Personality) {
  const ids = [...new Set(SECTIONS.flatMap((section) => person[section.key].flatMap((statement) => statement.citations.map((citation) => citation.sourceId))))];
  return new Map(ids.map((id, index) => [id, index + 1]));
}

function Statement({ statement, numbers }: { statement: Phase1Statement; numbers: Map<string, number> }) {
  return (
    <div className="profile-statement">
      <p>{statement.text}</p>
      <span className="statement-citations" aria-label="Sources">
        {[...new Set(statement.citations.map((citation) => citation.sourceId))].map((sourceId) => (
          <a key={sourceId} href={`#source-${sourceId}`} aria-label={`View source ${numbers.get(sourceId)}`}>[{numbers.get(sourceId)}]</a>
        ))}
      </span>
    </div>
  );
}

function sourceEvidence(source: Phase1Source, person: Phase1Personality) {
  return SECTIONS.flatMap((section) => person[section.key]).flatMap((statement) => statement.citations
    .filter((citation) => citation.sourceId === source.id)
    .map((citation) => ({ claimId: statement.claimId, locator: citation.locator, excerpt: citation.evidenceExcerpt })))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.locator === item.locator && candidate.excerpt === item.excerpt) === index);
}

export function ProfileClient({ person, related }: { person: Phase1Personality; related: RelatedPerson[] }) {
  const [lens, setLens] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const readingProgress = useSpring(scrollYProgress, { stiffness: 110, damping: 24, restDelta: .001 });
  const numbers = useMemo(() => sourceNumbers(person), [person]);
  const citedSources = useMemo(() => person.sources.filter((source) => numbers.has(source.id)).sort((a, b) => (numbers.get(a.id) || 0) - (numbers.get(b.id) || 0)), [numbers, person.sources]);
  const orderedSections = useMemo(() => {
    if (!lens) return SECTIONS;
    const preferred = LENS_SECTION_ORDER[lens] || [];
    return [...SECTIONS].sort((a, b) => {
      const aRank = preferred.indexOf(a.key);
      const bRank = preferred.indexOf(b.key);
      return (aRank < 0 ? 99 : aRank) - (bRank < 0 ? 99 : bRank);
    });
  }, [lens]);
  const lensStatements = useMemo(() => {
    if (!lens) return [];
    const keywords = LENS_KEYWORDS[lens] || lens.split("_");
    const all = orderedSections.flatMap((section) => person[section.key]);
    const matching = all.filter((statement) => {
      const text = `${statement.text} ${statement.framework?.parameterName || ""} ${statement.framework?.fieldLabel || ""}`.toLowerCase();
      return keywords.some((keyword) => text.includes(keyword));
    });
    const pool = matching.length ? matching : all;
    return pool.filter((statement, index) => pool.findIndex((candidate) => candidate.claimId === statement.claimId) === index).slice(0, 4);
  }, [lens, orderedSections, person]);

  return (
    <main className="profile-page page-shell">
      <MysticBackdrop />
      <ExploreConstellation />
      <motion.div className="profile-reading-progress" style={{ scaleX: reduceMotion ? scrollYProgress : readingProgress }} />
      <motion.div initial={reduceMotion ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
        <Link href="/explore" className="back-link"><ArrowLeft size={16} aria-hidden="true" /> Explore all personalities</Link>
      </motion.div>
      <motion.header className="profile-hero" initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
        <div className="profile-title-block">
          <p className="section-label">{person.phase1PresentationCategory.name}</p>
          <h1>{person.name}</h1>
          <p className="profile-role">{person.type}</p>
        </div>
        <div className="profile-introduction">
          {person.shortIntroduction.map((statement) => <Statement key={statement.claimId} statement={statement} numbers={numbers} />)}
        </div>
      </motion.header>

      <motion.section className="lens-selector" aria-labelledby="lens-title" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4, delay: .08 }}>
        <div>
          <p className="section-label">Ways to explore</p>
          <h2 id="lens-title">Choose a lens</h2>
          <p>A lens brings the most relevant evidence forward and changes the reading order.</p>
        </div>
        <div className="lens-options">
          <Button type="button" variant="ghost" aria-pressed={lens === null} onClick={() => setLens(null)}>
            {lens === null && <motion.span className="lens-active-glow" layoutId="active-profile-lens" />}
            <span>Full profile</span>
          </Button>
          {person.lenses.map((item) => (
            <Button key={item} type="button" variant="ghost" aria-pressed={lens === item} onClick={() => setLens(item)}>
              {lens === item && <motion.span className="lens-active-glow" layoutId="active-profile-lens" />}
              <span>{formatLabel(item)}</span>
            </Button>
          ))}
        </div>
      </motion.section>

      <AnimatePresence mode="wait">
        {lens && (
          <motion.section className="lens-focus" key={lens} aria-live="polite" initial={reduceMotion ? false : { opacity: 0, height: 0, y: -10 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, height: 0, y: -8 }} transition={{ duration: .28 }}>
            <Sparkles size={24} aria-hidden="true" />
            <p className="section-label">{formatLabel(lens)} lens</p>
            <h2>Evidence brought into focus</h2>
            <div>{lensStatements.map((statement) => <Statement key={statement.claimId} statement={statement} numbers={numbers} />)}</div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="profile-layout">
        <motion.article className="profile-reading" key={lens || "full-profile"} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
          {orderedSections.map((section) => {
            const statements = person[section.key];
            if (!statements.length) return null;
            return (
              <motion.section key={section.key} id={section.key} className="profile-section" layout>
                <header><p>{section.description}</p><h2>{section.title}</h2></header>
                <div>{statements.map((statement) => <Statement key={statement.claimId} statement={statement} numbers={numbers} />)}</div>
              </motion.section>
            );
          })}
        </motion.article>

        <aside className="profile-aside" aria-label="Profile guide">
          <div>
            <p className="section-label">In this profile</p>
            <nav>{orderedSections.filter((section) => person[section.key].length).map((section) => <a key={section.key} href={`#${section.key}`}>{section.title}</a>)}</nav>
          </div>
          <div>
            <p className="section-label">Research classification</p>
            <p>{person.type}</p>
            <p>{person.lenses.length} relevant lenses</p>
            <p>{citedSources.length} cited sources</p>
          </div>
          <motion.div whileHover={reduceMotion ? undefined : { y: -2 }}>
            <Link href="/ai" className="profile-ask-link">Ask a deeper question <ArrowRight size={15} aria-hidden="true" /></Link>
          </motion.div>
        </aside>
      </div>

      <section className="profile-sources" id="sources" aria-labelledby="sources-title">
        <header>
          <div><p className="section-label">Research transparency</p><h2 id="sources-title">Sources</h2></div>
          <p>Open a source to inspect its publisher, type, citation location, and supporting excerpt.</p>
        </header>
        <div className="profile-source-list">
          {citedSources.map((source) => {
            const evidence = sourceEvidence(source, person);
            return (
              <details key={source.id} id={`source-${source.id}`}>
                <summary>
                  <span className="source-number">{numbers.get(source.id)}</span>
                  <span><strong>{source.title}</strong><small>{source.publisherOrInstitution || source.author || "Source record"} · {sourceType(source.sourceType)}</small></span>
                  <span className="source-open-label">Details <ChevronDown size={14} aria-hidden="true" /></span>
                </summary>
                <div className="source-detail">
                  <dl>
                    <div><dt>Author</dt><dd>{source.author || "Not recorded"}</dd></div>
                    <div><dt>Publisher</dt><dd>{source.publisherOrInstitution || "Not recorded"}</dd></div>
                    <div><dt>Type</dt><dd>{sourceType(source.sourceType)}</dd></div>
                    {source.publicationYear && <div><dt>Year</dt><dd>{source.publicationYear}</dd></div>}
                  </dl>
                  {evidence.map((item, index) => (
                    <div className="source-evidence" key={`${item.claimId}-${index}`}>
                      {item.locator && <p><strong>Location:</strong> {item.locator}</p>}
                      {item.excerpt && <blockquote>{item.excerpt}</blockquote>}
                    </div>
                  ))}
                  {source.url && <a href={source.url} target="_blank" rel="noreferrer">Open original source <ExternalLink size={14} aria-hidden="true" /></a>}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className="related-people" aria-labelledby="related-title">
        <header><p className="section-label">Continue exploring</p><h2 id="related-title">Related personalities</h2></header>
        <div>
          {related.map((candidate) => (
            <motion.div key={candidate.id} whileHover={reduceMotion ? undefined : { y: -4 }} transition={{ duration: .18 }}>
              <Link href={`/explore/${candidate.slug}`}>
                <BookOpen size={18} aria-hidden="true" />
                <span><strong>{candidate.name}</strong><small>{candidate.reason}</small></span>
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </main>
  );
}
