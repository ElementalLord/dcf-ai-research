"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import type { Phase1PresentationCategory } from "@/lib/phase1/types";
import { searchPersonalities } from "@/lib/phase1/search";
import { KeySelect } from "@/components/key-select";
import { Portrait, type PortraitData } from "@/components/portrait";
import { Arrow, CATEGORY_ICONS, Close, ListLines, Manuscript, Search } from "@/components/vedic-icons";
import { ERA_PERIODS, type ExplorePerson } from "./explore-data";
import { ExploreTimeline } from "./explore-timeline";

type Props = { people: ExplorePerson[]; categories: Phase1PresentationCategory[]; initialCategory: string; portraits: Record<string, PortraitData> };
type View = "list" | "time";
const ease = [0.23, 1, 0.32, 1] as const;

export function ExploreClient({ people, categories, initialCategory, portraits }: Props) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [role, setRole] = useState("all");
  const [period, setPeriod] = useState("all");
  const [region, setRegion] = useState("all");
  const [view, setView] = useState<View>("list");
  const searchInput = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();
  const roles = useMemo(() => [...new Set(people.map((person) => person.detailedCategory).filter((value): value is string => Boolean(value)))].sort(), [people]);
  const periods = useMemo(() => ERA_PERIODS.filter((item) => people.some((person) => person.period === item)), [people]);
  const regions = useMemo(() => [...new Set(people.flatMap((person) => person.regions))].sort(), [people]);
  const searched = useMemo(() => searchPersonalities(people, query) as ExplorePerson[], [people, query]);
  const facetMatches = searched.filter((person) => (role === "all" || person.detailedCategory === role)
    && (period === "all" || person.period === period)
    && (region === "all" || person.regions.includes(region)));
  const filtered = facetMatches.filter((person) => categoryId === "all" || person.presentationCategory.id === categoryId);
  const sorted = query ? filtered : [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const reset = () => { setQuery(""); setCategoryId("all"); setRole("all"); setPeriod("all"); setRegion("all"); };
  const sourceCount = (person: ExplorePerson) => `${person.sourceCount} ${person.sourceCount === 1 ? "source" : "sources"}`;

  // "/" jumps to search, as on many reading sites.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || target?.closest("input, textarea, [contenteditable]")) return;
      event.preventDefault();
      searchInput.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <div className="xp-browser">
    <div className="xp-search">
      <Search size={21} />
      <label className="sr-only" htmlFor="explore-search">Search the collection</label>
      <input ref={searchInput} id="explore-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, roles, places, ideas" autoComplete="off" />
      {query ? <button type="button" className="key key-round" onClick={() => { setQuery(""); searchInput.current?.focus(); }} aria-label="Clear search"><Close size={16} /></button> : <kbd aria-hidden="true">/</kbd>}
    </div>

    <div className="xp-cats" role="group" aria-label="Field">
      <button type="button" className="key key-cat" aria-pressed={categoryId === "all"} onClick={() => setCategoryId("all")}>All <small>{facetMatches.length}</small></button>
      {categories.map((category) => {
        const Icon = CATEGORY_ICONS[category.id] ?? Manuscript;
        return <button key={category.id} type="button" className={`key key-cat cat-${category.id}`} aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>
          <Icon size={17} />{category.name}<small>{facetMatches.filter((person) => person.presentationCategory.id === category.id).length}</small>
        </button>;
      })}
    </div>

    <div className="xp-toolbar">
      <p aria-live="polite" className="xp-count"><strong>{filtered.length}</strong> {filtered.length === 1 ? "person" : "people"}</p>
      <div className="xp-filters">
        <KeySelect label="Role" value={role} onChange={setRole} options={[{ value: "all", label: "All roles" }, ...roles.map((item) => ({ value: item, label: item }))]} />
        <KeySelect label="Era" value={period} onChange={setPeriod} options={[{ value: "all", label: "All eras" }, ...periods.map((item) => ({ value: item, label: item }))]} />
        <KeySelect label="Region" value={region} onChange={setRegion} options={[{ value: "all", label: "All regions" }, ...regions.map((item) => ({ value: item, label: item }))]} />
      </div>
      <LayoutGroup id="explore-view">
        <div className="xp-views" role="group" aria-label="View">
          {(["list", "time"] as const).map((item) => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)}>
            {view === item && <motion.span layoutId="xp-view-pill" className="xp-view-pill" transition={{ duration: reduce ? 0 : 0.28, ease }} />}
            <span className="xp-view-label">{item === "list" ? <ListLines size={16} /> : <Manuscript size={16} />}{item === "list" ? "List" : "Timeline"}</span>
          </button>)}
        </div>
      </LayoutGroup>
    </div>

    {filtered.length === 0
      ? <section className="xp-empty"><h3>No one matches {query ? `“${query}”` : "these filters"}.</h3><button type="button" className="key key-hot" onClick={reset}>Clear search and filters</button></section>
      : view === "list"
        ? <ol className="xp-list">
          <AnimatePresence initial={!reduce} mode="popLayout">
            {sorted.map((person, index) => {
              const Icon = CATEGORY_ICONS[person.presentationCategory.id] ?? Manuscript;
              return <motion.li key={person.id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.35, ease, delay: reduce ? 0 : Math.min(index, 12) * 0.03 }}>
                <Link className={`xp-row cat-${person.presentationCategory.id}`} href={`/explore/${person.slug}`}>
                  <Portrait name={person.name} portrait={portraits[person.slug]} category={person.presentationCategory.id} size={64} />
                  <span className="xp-row-main">
                    <span className="xp-row-name">{person.name}</span>
                    <span className="xp-row-meta"><Icon size={15} />{person.detailedCategory}<span aria-hidden="true">·</span>{person.eraShort}</span>
                    {person.summary && <span className="xp-row-summary">{person.summary}</span>}
                  </span>
                  <span className="xp-row-side"><span className="xp-row-sources">{sourceCount(person)}</span><span className="xp-row-go"><Arrow size={18} /></span></span>
                </Link>
              </motion.li>;
            })}
          </AnimatePresence>
        </ol>
        : <ExploreTimeline people={filtered} portraits={portraits} />}
  </div>;
}
