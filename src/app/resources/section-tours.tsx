"use client";

import { useState } from "react";
import { GuidedTour, TourButton, type TourStep } from "@/components/guided-tour";
import type { ResourcesSection } from "./resources-nav";

/**
 * Guided tours for the Resources sections other than Sources & claims (which has its own, in resources-client.tsx).
 * Each step points at a control on the page; a step whose control is not there (an empty list, say) shows its
 * card in the middle of the screen instead, so the tour still makes sense on a quiet day.
 */
const welcome = (name: string, what: string): TourStep => ({ area: "Welcome", title: `A walk through ${name}`, body: <><p>{what}</p><p>Nothing is clicked or changed during the tour. Use <b>Next</b> and <b>Back</b>, or the arrow keys, and press Esc to stop at any time.</p></> });
const sections: TourStep = { area: "Getting around", target: "[data-tour='nav']", title: "The five Resources sections", body: <p>These cards switch between <b>People</b>, <b>Sources &amp; claims</b>, <b>Feedback</b>, the <b>Knowledge engine</b> and <b>Extra diagnostics</b>. Each one has its own tour and its own “How to use”.</p> };
const finish = (next: string): TourStep => ({ area: "All done", target: ".resource-help-trigger:not(.tour-trigger)", title: "Need a reminder later?", body: <p><b>How to use</b> lists the steps for this section in writing, and <b>Take the tour</b> runs this walkthrough again. {next}</p> });

const TOURS: Record<Exclude<ResourcesSection, "library">, TourStep[]> = {
  people: [
    welcome("People", "This is where people are added to Explore, edited, and published once their evidence is ready."),
    sections,
    { area: "People", target: ".people-toolbar", title: "Find someone, or add someone new", body: <p>Search by name to jump to a person. <b>Add a person</b> opens a form for the name, Explore group, research category, era, region, an optional Wikipedia portrait, reading angles and starter sources. It saves as you go, so you can stop and come back.</p> },
    { area: "People", target: "#people-added", title: "People added in Resources", body: <p>Everyone the board has added. Each card shows their group, era, research category and source count, and a short note on what&apos;s still missing before they can be published.</p> },
    { area: "People", target: ".people-row .people-status, .people-row", title: "Status at a glance", body: <p>The badge says where each person stands: <b>On Explore</b> when they&apos;re live, otherwise a draft or what&apos;s blocking them. Hover a disabled <b>Publish</b> button to see exactly what&apos;s missing.</p> },
    { area: "People", target: ".people-row .people-actions", title: "What you can do with a person", body: <><p><b>Edit</b> changes their details, photo and reading angles. <b>Sources &amp; claims</b> opens their evidence, where sources and claims are approved.</p><p><b>Publish</b> puts them on Explore once at least one source and claim are approved; <b>Unpublish</b> hides them again without deleting anything. <b>View</b> opens their live profile.</p></> },
    { area: "People", target: "#people-curated", title: "The curated collection", body: <p>The original 25 profiles. Their short name, other names, era, place, photo and reading angles can be edited; their reviewed text stays as it was exported. An <b>Edited</b> tag marks the ones that have been changed.</p> },
    finish("Next stop: Sources & claims, where a new person’s evidence is approved."),
  ],
  feedback: [
    welcome("Feedback", "Every star rating and comment readers leave under an Ask DCF answer lands here. It's the best guide to what to fix next."),
    sections,
    { area: "Summary", target: ".feedback-summary", title: "How answers are being rated", body: <p>The total number of rated answers, the average rating, and how the ratings spread from one to five stars. A growing pile at one and two stars is the signal to dig in.</p> },
    { area: "Review", target: ".feedback-review-heading", title: "Start with the low ratings", body: <p><b>Low-rated responses</b> shows only answers rated one or two stars. Those are the ones most worth fixing.</p> },
    { area: "Review", target: ".feedback-filters", title: "Narrow it down", body: <p>Filter by rating, person, tag, date, or by where the evidence came from (live search versus the library), then choose <b>Apply filters</b>. <b>Clear</b> resets them.</p> },
    { area: "Review", target: ".feedback-list .feedback-entry, .feedback-empty", title: "Open a response", body: <p>Each row expands to show the question, the answer that was given, the reader&apos;s comment and tags, and which sources the answer cited.</p> },
    { area: "Act on it", title: "Fix the cause, not the answer", body: <p>Feedback is read-only. To fix what a reader flagged, go to <b>Sources &amp; claims</b>: add or approve a source, correct or reject a claim, or change which websites research may read. Future answers improve from there.</p> },
    finish(""),
  ],
  knowledge: [
    welcome("the Knowledge engine", "Live research runs on its own when the library can't answer a question. This page shows what it did, what it cost, and how much it's allowed to do."),
    sections,
    { area: "Activity", target: "[aria-labelledby='knowledge-summary']", title: "What research has been doing", body: <p>How many questions were asked, how many were answered from the library versus live research, and what was added. A high library share means the corpus is doing its job.</p> },
    { area: "Costs", target: "[aria-labelledby='knowledge-costs']", title: "Research costs", body: <p>Estimated spending today and this month, and the cost per item admitted. These are estimates; the AI provider&apos;s billing page has the real figures.</p> },
    { area: "Limits", target: ".knowledge-control-grid", title: "Set the limits", body: <p>The most one question may spend, the daily and monthly allowances, how many paid calls a question may make, and how many research jobs may run at once. Nothing changes until you choose <b>Save policy</b>.</p> },
    { area: "Limits", target: ".knowledge-ai-switch", title: "May AI add material on its own?", body: <p>Off by default. Off means AI may search and suggest, but only reviewed material enters the database. On lets it record sources and publish facts that pass its checks without a reviewer, so turn it on only with the Mentor&apos;s approval.</p> },
    { area: "Limits", target: ".knowledge-pause-controls", title: "Pause new research", body: <p>Stops new live research straight away without touching any other setting. Answers keep coming from the library.</p> },
    { area: "Harvest", target: "[aria-labelledby='knowledge-harvest']", title: "Source harvest", body: <p>Works that live answers have read. Switch the view to see what isn&apos;t in the library yet, what&apos;s used repeatedly, what&apos;s trusted, and what was rejected. Each row can be <b>added as a candidate</b>, <b>rejected</b> or <b>restored</b>.</p> },
    finish("For the full run log and every automatic decision, see Extra diagnostics."),
  ],
  diagnostics: [
    welcome("Extra diagnostics", "Detailed tables for troubleshooting. Nothing here needs checking day to day; come here when an answer or a profile looks wrong and you want to know why."),
    sections,
    { area: "Tables", target: "[data-tour='readiness']", title: "Profile readiness", body: <p>How much evidence each person has: <b>Strong</b>, <b>Usable</b>, <b>Thin</b> or <b>Needs attention</b>. Retrieval asks whether Ask can find evidence; Publication asks whether a person reviewed it. Main gaps says what&apos;s missing.</p> },
    { area: "Tables", target: "[data-tour='runs']", title: "Research run log", body: <p>The last 30 questions: whether each was answered from the library or by live research, how many searches it used, and what it cost. Select a heading to open or close any table.</p> },
    { area: "Tables", target: "[data-tour='decisions']", title: "Verification decisions", body: <p>Every automatic decision with its reason, including facts that were held back. Filter by outcome to see, say, only what was rejected.</p> },
    { area: "Tables", target: "[data-tour='cooldowns']", title: "Reuse and cooldowns", body: <p>Topics that recently failed to find enough evidence wait before they&apos;re searched again, so the same paid search isn&apos;t repeated.</p> },
    { area: "Tables", target: "[data-tour='machine']", title: "Machine-admitted sources", body: <p>Sources that automatic research added without a reviewer. Worth an occasional look; anything doubtful can be rejected in Sources &amp; claims.</p> },
    finish(""),
  ],
};

/** “Take the tour” for one Resources section; renders nothing for Sources & claims, which brings its own. */
export default function SectionTour({ section }: { section: ResourcesSection }) {
  const [open, setOpen] = useState(false);
  if (section === "library") return null;
  return <>
    <TourButton onStart={() => setOpen(true)} />
    {open && <GuidedTour steps={TOURS[section]} onClose={() => setOpen(false)} />}
  </>;
}
