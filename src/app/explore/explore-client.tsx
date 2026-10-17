"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Phase1PresentationCategory } from "@/lib/phase1/types";
import { searchPersonalities } from "@/lib/phase1/search";
import type { ExplorePerson } from "./explore-data";

type Props = { people: ExplorePerson[]; categories: Phase1PresentationCategory[]; initialCategory: string };
type View = "grid" | "az" | "time";
const ERAS = ["Ancient and Vedic", "Early medieval", "Medieval to early modern", "Born in the 1800s", "Born in the 1900s"];

export function ExploreClient({ people, categories, initialCategory }: Props) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [role, setRole] = useState("all");
  const [view, setView] = useState<View>("grid");
  const roles = useMemo(() => [...new Set(people.map((person) => person.detailedCategory).filter((value): value is string => Boolean(value)))].sort(), [people]);
  const searched = useMemo(() => searchPersonalities(people, query) as ExplorePerson[], [people, query]);
  const roleMatches = searched.filter((person) => role === "all" || person.detailedCategory === role);
  const filtered = roleMatches.filter((person) => categoryId === "all" || person.presentationCategory.id === categoryId);
  const reset = () => { setQuery(""); setCategoryId("all"); setRole("all"); };
  const count = (people: ExplorePerson[]) => `${people.length} ${people.length === 1 ? "person" : "people"}`;
  const sourceCount = (person: ExplorePerson) => `${person.sourceCount} ${person.sourceCount === 1 ? "source" : "sources"}`;
  const dot = (person: ExplorePerson) => <span className={`explore-dot dot-${person.presentationCategory.id}`} aria-hidden="true" />;
  const href = (person: ExplorePerson) => `/explore/${person.slug}`;
  return <div className="explore-browser">
    <label className="explore-search"><span className="sr-only">Search the collection</span><Search size={20} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, roles, ideas" /></label>
    <div className="explore-categories" role="group" aria-label="Category">
      <button type="button" aria-pressed={categoryId === "all"} onClick={() => setCategoryId("all")}>All <small>{roleMatches.length}</small></button>
      {categories.map((category) => <button key={category.id} type="button" aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}><span className={`explore-dot dot-${category.id}`} aria-hidden="true" />{category.name} <small>{roleMatches.filter((person) => person.presentationCategory.id === category.id).length}</small></button>)}
    </div>
    <div className="explore-toolbar"><p aria-live="polite">{count(filtered)}</p><label>Role <select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All roles</option>{roles.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><div className="explore-view" role="group" aria-label="View">{(["grid", "az", "time"] as const).map((item) => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)}>{item === "grid" ? "Grid" : item === "az" ? "A–Z" : "Timeline"}</button>)}</div></div>
    {filtered.length === 0 ? <section className="explore-empty"><h2>No one matches {query ? `“${query}”` : "these filters"}.</h2><button type="button" onClick={reset}>Clear search and filters</button></section> : view === "grid" ? <div className="explore-grid">{filtered.map((person) => <Link className="explore-card" href={href(person)} key={person.id}><span className="explore-card-date">{dot(person)}{person.dateLabel || person.presentationCategory.name}</span><h2>{person.name}</h2><span className="explore-card-role">{person.detailedCategory}</span><p>{person.summary || "Browse the source records while biographical claims are reviewed."}</p><span className="explore-card-sources">{sourceCount(person)}</span></Link>)}</div> : view === "az" ? <div className="explore-list">{[...filtered].sort((a, b) => a.name.localeCompare(b.name)).map((person) => <Link className="explore-row" href={href(person)} key={person.id}><strong>{person.name}</strong><span>{dot(person)}{person.detailedCategory}</span><span>{person.dateLabel || "Dates pending"}</span><span>{sourceCount(person)}</span></Link>)}</div> : <div className="explore-timeline">{[...ERAS, "Dates pending"].map((era) => { const members = filtered.filter((person) => person.sortYear === null ? era === "Dates pending" : era === "Ancient and Vedic" ? person.sortYear < 500 : era === "Early medieval" ? person.sortYear < 1300 : era === "Medieval to early modern" ? person.sortYear < 1800 : era === "Born in the 1800s" ? person.sortYear < 1900 : era === "Born in the 1900s"); return members.length ? <section className="explore-era" key={era}><h2>{era}</h2><div className="explore-rail">{members.map((person) => <Link className="explore-event" href={href(person)} key={person.id}>{dot(person)}<span>{person.dateLabel || "Date pending"}</span><span><strong>{person.name}</strong><small>{person.detailedCategory}</small></span></Link>)}</div></section> : null; })}</div>}
  </div>;
}
