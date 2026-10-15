"use client";

import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Phase1DiscoveryPerson, Phase1PresentationCategory } from "@/lib/phase1/types";
import { searchPersonalities } from "@/lib/phase1/search";

const formatLens = (lens: string) => lens.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

type Props = {
  people: Phase1DiscoveryPerson[];
  categories: Phase1PresentationCategory[];
};

export function ExploreClient({ people, categories }: Props) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [role, setRole] = useState("all");

  const roles = useMemo(() => [...new Set(people.map((person) => person.detailedCategory).filter((value): value is string => Boolean(value)))].sort(), [people]);
  const filtered = useMemo(() => searchPersonalities(people, query).filter((person) => {
    const matchesCategory = categoryId === "all" || person.presentationCategory.id === categoryId;
    const matchesRole = role === "all" || person.detailedCategory === role;
    return matchesCategory && matchesRole;
  }), [categoryId, people, query, role]);

  const reset = () => {
    setQuery("");
    setCategoryId("all");
    setRole("all");
  };

  return (
    <div className="explore-browser">
      <section className="explore-controls" aria-label="Search and filter personalities">
        <label className="explore-search">
          <span>Search the collection</span>
          <span className="explore-search-field">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try Vivekananda, Bose, Tata, or Ray"
            />
          </span>
        </label>
        <label className="explore-role-filter">
          <span>Detailed role or type</span>
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="all">All roles</option>
            {roles.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </section>

      <div className="category-filter" aria-label="Filter by Phase 1 category">
        <button type="button" aria-pressed={categoryId === "all"} onClick={() => setCategoryId("all")}>
          <span>All personalities</span><small>25</small>
        </button>
        {categories.map((category) => (
          <button key={category.id} type="button" aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>
            <span>{category.name}</span><small>5</small>
          </button>
        ))}
      </div>

      <div className="results-summary" aria-live="polite">
        <p><strong>{filtered.length}</strong> {filtered.length === 1 ? "personality" : "personalities"}</p>
        {(query || categoryId !== "all" || role !== "all") && (
          <button type="button" onClick={reset}><X size={15} aria-hidden="true" /> Clear filters</button>
        )}
      </div>

      {filtered.length ? (
        <div className="personality-directory">
          {categories.map((category) => {
            const members = filtered.filter((person) => person.presentationCategory.id === category.id);
            if (!members.length) return null;
            return (
              <section key={category.id} className="directory-group" aria-labelledby={`category-${category.id}`}>
                <header>
                  <div>
                    <p className="section-label">Phase 1 category</p>
                    <h2 id={`category-${category.id}`}>{category.name}</h2>
                  </div>
                  <p>{category.description}</p>
                </header>
                <div className="personality-list">
                  {members.map((person) => (
                    <Link key={person.id} href={`/explore/${person.slug}`} className="personality-entry">
                      <div>
                        <h3>{person.name}</h3>
                        <p className="personality-role">{person.detailedCategory}</p>
                        <p className="personality-summary">{person.introduction}</p>
                        <div className="personality-lenses" aria-label="Relevant lenses">
                          {person.lenses.slice(0, 4).map((lens) => <span key={lens}>{formatLens(lens)}</span>)}
                        </div>
                      </div>
                      <ArrowUpRight size={20} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="explore-empty">
          <h2>No personalities match these filters.</h2>
          <p>Try a shorter name, another category, or clear the role filter.</p>
          <button type="button" onClick={reset}>Show all 25 personalities</button>
        </section>
      )}
    </div>
  );
}
