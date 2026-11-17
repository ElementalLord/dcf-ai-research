"use client";

import { BookOpenText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ResourcesSection } from "./resources-nav";

type Step = { title: string; text: string };
const guides: Record<Exclude<ResourcesSection, "library">, { name: string; intro: string; steps: Step[] }> = {
  people: {
    name: "People",
    intro: "Adding a person takes three steps. Each step is saved, so you can stop and come back.",
    steps: [
      { title: "1. Add the person", text: "Choose “Add a person”. Enter the name, the Explore group, the research category (it decides which research fields claims can use), the era and the region. A Wikipedia article title gives the profile a portrait. Reading angles are pre-filled for the group; edit or remove them." },
      { title: "2. Add sources and claims", text: "Choose “Add sources & claims”. In Sources & claims, add at least one source and approve it, then add claims that cite it and approve them. Only approved claims with an approved source appear on Explore." },
      { title: "3. Publish", text: "When the checklist on the person's card is complete, choose “Publish to Explore”. The profile appears on Explore and the home page straight away, and in Ask. Later approvals show up within five minutes." },
      { title: "Unpublish or edit", text: "“Unpublish” hides the profile again without deleting anything. “Edit details” changes the group, era, region, portrait or angles; changes appear immediately." },
      { title: "The 25 curated profiles", text: "The original Phase 1 profiles are listed separately and are managed through the Phase 1 export, so they cannot be changed here." },
    ],
  },
  feedback: {
    name: "Feedback",
    intro: "Every star rating and comment readers leave under an Ask DCF answer lands here.",
    steps: [
      { title: "Read the summary", text: "The cards at the top show how many answers were rated and how the ratings spread from one to five stars." },
      { title: "Start with low ratings", text: "Choose “Low-rated answers” to see answers rated one or two stars; those are the ones most worth fixing." },
      { title: "Filter", text: "Narrow by rating, person, tag, date, or evidence (answers that used live search versus the library), then choose Apply filters. Clear resets them." },
      { title: "Open a response", text: "Select a row to read the question, the answer, the reader's comment and tags, and which sources the answer cited." },
      { title: "Act on it", text: "Fix the underlying problem in Sources & claims: add or approve a source, correct a claim, or adjust which websites research may read." },
    ],
  },
  readiness: {
    name: "Readiness",
    intro: "A table of how complete each person's profile is, so you know where work is needed.",
    steps: [
      { title: "Read the four states", text: "Strong, Usable, Thin and Needs attention summarise every person. The counts at the top show how many people are in each." },
      { title: "Two kinds of ready", text: "Retrieval readiness asks whether Ask can find enough evidence. Publication readiness asks whether a person has reviewed it. A profile can be strong for one and thin for the other." },
      { title: "Compare the measures", text: "Scroll the table sideways to compare sources and domains, primary sources, passages, reviewed claims, evidence quality and evaluation results." },
      { title: "Use Main gaps", text: "The last column says what is missing for each person. Open Sources & claims for that person to close the gap." },
    ],
  },
  knowledge: {
    name: "Knowledge engine",
    intro: "What live research does on its own, what it costs, and how much it is allowed to do.",
    steps: [
      { title: "Check activity", text: "Activity shows recent research runs; Research costs shows estimated spending. Confirm real spending in the provider's billing." },
      { title: "Set the limits", text: "Under Budget and publication controls, set the per-request ceiling, daily and monthly allowances, the most paid calls per question, and how many research jobs may run at once. Save policy applies them to new research." },
      { title: "Decide whether AI may add material", text: "“AI can add sources and facts” is off by default. Off means AI may search and suggest, but only reviewed material enters the database. Turn it on only with the Mentor's approval." },
      { title: "Pause if needed", text: "“Pause new research” stops new live research without changing any other setting." },
      { title: "Review the harvest", text: "Source harvest lists works that live answers read. Switch the view (not yet in Library, used repeatedly, trusted, in Library, rejected) and choose Add as candidate, Reject or Restore." },
      { title: "Audit decisions", text: "Verification decisions lists every automatic decision with its reason, including facts that were held back. Filter by outcome." },
      { title: "Reuse and cooldowns", text: "Research reuse shows questions that were answered from stored research instead of paying again, and topics cooling down before they are searched again." },
    ],
  },
};

/** “How to use” for the Feedback, Readiness and Knowledge engine pages. Sources & claims has its own, larger guide. */
export default function SectionHelp({ section }: { section: ResourcesSection }) {
  if (section === "library") return null;
  const guide = guides[section];
  return <Dialog>
    <DialogTrigger className="key resource-help-trigger" aria-label={`How to use ${guide.name}`}><BookOpenText size={17} aria-hidden="true" /><span>How to use</span></DialogTrigger>
    <DialogContent className="resource-help-dialog section-help-dialog" aria-label={`How to use ${guide.name}`}>
      <DialogHeader className="resource-help-dialog-header">
        <span className="resource-help-dialog-icon"><BookOpenText size={22} aria-hidden="true" /></span>
        <div><span className="resource-help-eyebrow">Resources guide</span><DialogTitle>How to use {guide.name}</DialogTitle><DialogDescription>{guide.intro}</DialogDescription></div>
      </DialogHeader>
      <ol className="section-help-steps">{guide.steps.map((step) => <li key={step.title}><strong>{step.title}</strong><p>{step.text}</p></li>)}</ol>
    </DialogContent>
  </Dialog>;
}
