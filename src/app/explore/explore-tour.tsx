"use client";

import { useState } from "react";
import { GuidedTour, TourButton, type TourStep } from "@/components/guided-tour";

/** A guided walk around the front page: the opening symbols, then how to search and browse the collection. */
const STEPS: TourStep[] = [
  { area: "Welcome", title: "A short walk around Inspiring Personalities", body: <><p>The lives of people who shaped Indian civilization, each one backed by the evidence behind every claim. This tour shows you how to find your way around.</p><p>Use <b>Next</b> and <b>Back</b>, or the arrow keys, and press Esc to stop at any time.</p></> },
  { area: "The opening", target: ".ph-canvas", title: "Sacred symbols, drawn in light", body: <p>Thousands of particles gather into a sacred symbol, hold it, then drift into the next. Move your pointer across them to stir them, or click to skip to the next symbol.</p> },
  { area: "The opening", target: ".ph-figure", title: "What you're looking at", body: <p>The caption names the symbol the particles are forming, in Sanskrit and English, with a line on what it means. It changes with every symbol.</p> },
  { area: "The collection", target: ".xp-search", title: "Search for anyone", body: <p>Type a name, a role such as <b>astronomer</b> or <b>poet</b>, a place, or a time. Press <kbd>/</kbd> from anywhere on the page to jump straight here.</p> },
  { area: "The collection", target: ".xp-cats", title: "Browse by field", body: <p>Sages, spiritual teachers, scientists, rulers, reformers, artists and more. The number on each is how many people it holds.</p> },
  { area: "The collection", target: ".xp-filters", title: "Narrow by role, era or region", body: <p>Combine filters to find, say, scientists from the classical era in South India. The count on the left updates as you go.</p> },
  { area: "The collection", target: ".xp-views", title: "List or timeline", body: <p>The list is easiest for browsing. The timeline lays everyone out across the centuries, so you can see who lived alongside whom.</p> },
  { area: "A life", target: ".xp-list > li", title: "Open a profile", body: <p>Each profile tells the life through several reading angles, and every claim carries the sources it rests on, so you can always see where a statement comes from. The number on the right of each row is how many sources stand behind them.</p> },
  { area: "Ask", target: ".site-nav a[href='/ai']", title: "Ask the guide", body: <p>Have a question about someone? <b>Ask</b> answers from the same reviewed sources and shows its citations, so you can check every answer.</p> },
  { area: "All done", title: "Enjoy exploring", body: <p>That&apos;s everything. You can run this tour again any time from the button under the symbol caption.</p> },
];

export function ExploreTour() {
  const [open, setOpen] = useState(false);
  return <>
    <TourButton className="ph-tour" label="Take a tour of the site" onStart={() => setOpen(true)} />
    {open && <GuidedTour steps={STEPS} onClose={() => setOpen(false)} />}
  </>;
}
