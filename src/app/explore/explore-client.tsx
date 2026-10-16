"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Search, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Phase1DiscoveryPerson, Phase1PresentationCategory } from "@/lib/phase1/types";
import { searchPersonalities } from "@/lib/phase1/search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const formatLens = (lens: string) => lens.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

type Props = {
  people: Phase1DiscoveryPerson[];
  categories: Phase1PresentationCategory[];
};

export function ExploreClient({ people, categories }: Props) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [role, setRole] = useState("all");
  const reduceMotion = useReducedMotion();

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
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try Vivekananda, Bose, Tata, or Ray"
            />
            <AnimatePresence>
              {query && (
                <motion.span className="explore-search-clear" initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .8 }}>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></Button>
                </motion.span>
              )}
            </AnimatePresence>
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
        <Button type="button" variant="ghost" aria-pressed={categoryId === "all"} onClick={() => setCategoryId("all")}>
          {categoryId === "all" && <motion.span className="category-active-glow" layoutId="active-category" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <span>All personalities</span><small>{people.length}</small>
        </Button>
        {categories.map((category) => (
          <Button key={category.id} type="button" variant="ghost" aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>
            {categoryId === category.id && <motion.span className="category-active-glow" layoutId="active-category" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span>{category.name}</span><small>5</small>
          </Button>
        ))}
      </div>

      <div className="results-summary" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p key={filtered.length} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={{ duration: .18 }}>
            <strong>{filtered.length}</strong> {filtered.length === 1 ? "personality" : "personalities"}
          </motion.p>
        </AnimatePresence>
        <AnimatePresence>
          {(query || categoryId !== "all" || role !== "all") && (
            <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}>
              <Button type="button" variant="ghost" size="sm" onClick={reset}><X size={15} aria-hidden="true" /> Clear filters</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait" initial={false}>
      {filtered.length ? (
        <motion.div className="personality-directory" key={`${categoryId}:${role}:${query ? "search" : "browse"}`} initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: .24 }}>
          {categories.map((category) => {
            const members = filtered.filter((person) => person.presentationCategory.id === category.id);
            if (!members.length) return null;
            return (
              <motion.section key={category.id} className="directory-group" aria-labelledby={`category-${category.id}`} layout>
                <header>
                  <div>
                    <p className="section-label">Phase 1 category</p>
                    <h2 id={`category-${category.id}`}>{category.name}</h2>
                  </div>
                  <p>{category.description}</p>
                </header>
                <div className="personality-list">
                  {members.map((person) => (
                    <motion.div key={person.id} layout initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, scale: .98 }} whileHover={reduceMotion ? undefined : { x: 5 }} transition={{ duration: .22 }}>
                      <Link href={`/explore/${person.slug}`} className="personality-entry">
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
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            );
          })}
        </motion.div>
      ) : (
        <motion.section className="explore-empty" key="empty" initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
          <Sparkles size={28} aria-hidden="true" />
          <h2>No personalities match these filters.</h2>
          <p>Try a shorter name, another category, or clear the role filter.</p>
          <Button type="button" onClick={reset}>Show all {people.length} personalities</Button>
        </motion.section>
      )}
      </AnimatePresence>
    </div>
  );
}
