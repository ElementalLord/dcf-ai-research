"use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Phase1PresentationCategory } from "@/lib/phase1/types";
import { searchPersonalities } from "@/lib/phase1/search";
import type { ExplorePerson } from "./explore-data";

type Props = { people: ExplorePerson[]; categories: Phase1PresentationCategory[]; initialCategory: string };
type View = "grid" | "az";
const VIEWS: Array<{ id: View; label: string }> = [{ id: "grid", label: "With short stories" }, { id: "az", label: "Names A to Z" }];

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
  const count = `${filtered.length} ${filtered.length === 1 ? "person" : "people"}`;
  const href = (person: ExplorePerson) => `/explore/${person.slug}`;
  const sorted = view === "az" ? [...filtered].sort((a, b) => a.name.localeCompare(b.name)) : filtered;

  const row = (person: ExplorePerson) => <li key={person.id}><Link href={href(person)}>
    <span className="link-list-main">
      <strong>{person.name}</strong>
      <span>{[person.detailedCategory, person.dateLabel].filter(Boolean).join(" · ")}</span>
      {view === "grid" && person.summary && <span className="person-summary">{person.summary}</span>}
    </span>
    <span className="link-list-side"><ArrowRight size={22} aria-hidden="true" /></span>
  </Link></li>;

  return <div className="explore-browser">
    <label className="search-box"><span className="sr-only">Search for a person</span><Search size={22} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a name, like Ashoka" /></label>

    <div className="choice-row" role="group" aria-label="Group">
      <span className="choice-label">Group:</span>
      <button type="button" aria-pressed={categoryId === "all"} onClick={() => setCategoryId("all")}>Everyone</button>
      {categories.map((category) => <button key={category.id} type="button" aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}
    </div>

    <div className="choice-row" role="group" aria-label="Order">
      <span className="choice-label">Show:</span>
      {VIEWS.map((item) => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}
      <label className="role-filter">Role <select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">Any role</option>{roles.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>

    <p className="result-count" aria-live="polite">{count}</p>

    {filtered.length === 0
      ? <section className="empty-state"><h2>No one matches {query ? `“${query}”` : "this choice"}.</h2><button type="button" className="button button-secondary" onClick={reset}>Show everyone</button></section>
      : <ul className="link-list">{sorted.map(row)}</ul>}
  </div>;
}
