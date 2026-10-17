"use client";

import { BookOpenText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Area = "sources" | "claims" | "websites";
type Control = { label: string; explanation: string; kind?: "action" | "selected" | "field" | "danger" };
type Group = { title: string; controls: Control[] };

const guides: Record<Area, { name: string; groups: Group[] }> = {
  sources: {
    name: "Sources",
    groups: [
      { title: "Find sources", controls: [
        { label: "Person", explanation: "Choose whose source library appears in the list.", kind: "field" },
        { label: "Add source", explanation: "Create a candidate source. A title is required; publication details can be added later.", kind: "action" },
        { label: "More details", explanation: "In Add source, reveal author, publisher, citation, textual layer, and rights fields." },
        { label: "Create candidate", explanation: "Review a confirmation, then save the new source for review.", kind: "action" },
        { label: "Find a source", explanation: "Search titles, authors, publishers, types, citations, and URLs.", kind: "field" },
        { label: "Status", explanation: "Show current sources or select not admitted, admitted, or rejected archive records.", kind: "field" },
        { label: "Source type", explanation: "Narrow the list to one source type.", kind: "field" },
        { label: "Sort by", explanation: "Order by title, linked claim count, or recent update.", kind: "field" },
        { label: "Clear", explanation: "Reset the search and filters." },
      ] },
      { title: "Work with a source", controls: [
        { label: "Source row", explanation: "Open the source record, linked claims, and passages.", kind: "action" },
        { label: "Back to sources", explanation: "Close the source drawer and return to the list." },
        { label: "Edit source", explanation: "Change its title, URL, type, and publication details." },
        { label: "Save source", explanation: "Review a confirmation, then save changes to the source.", kind: "action" },
        { label: "Cancel edit", explanation: "Leave editing without saving those changes." },
        { label: "Approve", explanation: "Approve a candidate source for research use.", kind: "selected" },
        { label: "Reject", explanation: "Move the source to Rejected after recording a reviewer.", kind: "danger" },
        { label: "Return to review", explanation: "Move an approved or rejected source back to candidate status." },
        { label: "Remove candidate", explanation: "Remove an unlinked candidate source." },
        { label: "Publication details", explanation: "Expand author, publisher, citation, type, textual layer, and authority. Authority describes the publisher: authoritative, credible secondary, or general web. It is separate from how certain a claim is." },
        { label: "Review and access notes", explanation: "Expand the review note and rights or access note." },
        { label: "Linked claims", explanation: "Expand the claims connected to this source; select one to open it." },
        { label: "Passages", explanation: "Expand the text passages saved for this source." },
        { label: "Add passage", explanation: "Enter source text and its location, then confirm before saving it." },
        { label: "Confirm decision", explanation: "Save an approval, rejection, or return to review with a reviewer name." },
      ] },
      { title: "List controls", controls: [
        { label: "Previous", explanation: "Go to the preceding page when more than 24 sources are listed." },
        { label: "Next", explanation: "Go to the following page when more than 24 sources are listed." },
      ] },
    ],
  },
  claims: {
    name: "Claims",
    groups: [
      { title: "Find claims", controls: [
        { label: "Person", explanation: "Choose whose claims appear in the list.", kind: "field" },
        { label: "Add claim", explanation: "Create a draft with claim text, a research field, a source, and an exact supporting excerpt.", kind: "action" },
        { label: "Research field", explanation: "Choose the topic that the new claim belongs to.", kind: "field" },
        { label: "Find existing", explanation: "In Add claim, link a source already in this person's library." },
        { label: "Enter new source", explanation: "In Add claim, create a source while saving the claim." },
        { label: "Classification and certainty", explanation: "Expand optional claim kind, certainty, and research notes." },
        { label: "Create draft", explanation: "Confirm, then save the claim and supporting excerpt for review.", kind: "action" },
        { label: "Cancel", explanation: "Close Add claim without saving the draft." },
        { label: "Find a claim", explanation: "Search claim text, research fields, and linked source titles.", kind: "field" },
        { label: "Status", explanation: "Show current claims or select draft, needs review, approved, or rejected records.", kind: "field" },
        { label: "Clear", explanation: "Reset the claim search and status filter." },
      ] },
      { title: "Review a claim", controls: [
        { label: "Claim row", explanation: "Read the claim, supporting evidence, and review history.", kind: "action" },
        { label: "Back to claims", explanation: "Close the claim drawer and return to the list." },
        { label: "View source record", explanation: "Open the source linked to a supporting excerpt." },
        { label: "Edit claim", explanation: "Change a reviewable claim's text, certainty, or notes." },
        { label: "Save claim", explanation: "Review a confirmation, then save edits to the claim.", kind: "action" },
        { label: "Cancel edit", explanation: "Leave claim editing without saving those changes." },
        { label: "Claim classification", explanation: "Expand field, certainty, kind, evidence type, and knowledge type." },
        { label: "Where this came from", explanation: "Expand who approved the claim, when it was added and updated, and how authoritative its sources are." },
        { label: "Review history", explanation: "Expand earlier decisions, reviewers, dates, and notes." },
        { label: "Approve", explanation: "Approve the claim after checking its evidence.", kind: "selected" },
        { label: "Reject", explanation: "Move the claim to Rejected and record a reviewer.", kind: "danger" },
        { label: "Return to review", explanation: "Move an approved or rejected claim back to review." },
        { label: "Remove draft", explanation: "Remove a draft claim." },
        { label: "Confirm decision", explanation: "Save a review decision with the reviewer name and optional note." },
        { label: "Previous", explanation: "Go to the preceding page when more than 24 claims are listed." },
        { label: "Next", explanation: "Go to the following page when more than 24 claims are listed." },
      ] },
    ],
  },
  websites: {
    name: "Web search",
    groups: [
      { title: "Live search", controls: [
        { label: "Website discovery", explanation: "Manage where live research searches. Add domain is the action on this heading row." },
        { label: "Search mode", explanation: "Choose Credible Web, Approved Sources Only, or Credible Web with rules. Confirm before the new mode is saved.", kind: "field" },
        { label: "Add domain", explanation: "Open a form to allow, trust, block, or pause a domain.", kind: "action" },
        { label: "Domain rules", explanation: "Show saved domain rules. The number beside the tab is the rule count." },
        { label: "Recently found", explanation: "Show websites discovered during research, strongest publishers first. The number beside the tab is the discovery count." },
        { label: "Kind of publisher", explanation: "For an allowed website, choose what it is, such as a university press or museum. This sets the authority label readers see on its citations.", kind: "field" },
        { label: "Find a website", explanation: "Filter the list currently selected above by name or domain.", kind: "field" },
        { label: "Status", explanation: "On Domain rules only, filter by all, allowed, blocked, or paused.", kind: "field" },
        { label: "Edit", explanation: "Change a domain's name, status, category, or notes; the dialog also has Remove rule." },
        { label: "Save rule", explanation: "Review a confirmation, then save a new or edited domain rule.", kind: "action" },
        { label: "Cancel", explanation: "Close the domain rule form without saving." },
        { label: "Remove rule", explanation: "Confirm before deleting the open domain rule." },
        { label: "Ignore", explanation: "Confirm before removing a discovery from Recently found." },
        { label: "Review", explanation: "Open a recently found website. Save a rule to allow, trust, or block it, or choose Ignore to remove it from this list." },
        { label: "Show more rules", explanation: "Reveal the next set of saved domain rules." },
        { label: "Show more discoveries", explanation: "Reveal more recently found domains." },
      ] },
      { title: "Page access", controls: [
        { label: "Page access permissions", explanation: "Expand this section below Website discovery to manage page, section, and whole website permissions." },
        { label: "Add website", explanation: "Create a permission rule and choose how broadly it applies.", kind: "action" },
        { label: "Current", explanation: "Show page rules that are available for review or use.", kind: "selected" },
        { label: "Rejected", explanation: "Show page rules marked Rejected." },
        { label: "Find a page or site", explanation: "Search page addresses, names, and domains.", kind: "field" },
        { label: "Site row", explanation: "Expand a domain to see its page and section rules. Select a rule name or Edit to open its form." },
        { label: "Search", explanation: "Confirm whether live search can discover this page or site." },
        { label: "Read", explanation: "Confirm whether live research can fetch its page text." },
        { label: "Import", explanation: "Confirm whether its text can be imported into the library." },
        { label: "Evidence", explanation: "Choose Review, Approved, or Rejected for use as research evidence, then confirm." },
        { label: "Edit", explanation: "Change scope, permissions, evidence use, active state, or notes." },
        { label: "This page", explanation: "Apply a new access rule only to the entered URL." },
        { label: "This section", explanation: "Apply a new rule to the entered path and pages below it." },
        { label: "Whole website", explanation: "Apply a new rule across the site's domain." },
        { label: "Active", explanation: "Pause or resume a page access rule." },
        { label: "Save access", explanation: "Review a confirmation, then save the page permission choices.", kind: "action" },
        { label: "Cancel", explanation: "Close the page access form without saving." },
        { label: "Show more sites", explanation: "Reveal more domains in the page access list." },
      ] },
    ],
  },
};

export default function ResourceHelp({ area }: { area: Area }) {
  const guide = guides[area];
  const sectionId = (title: string) => `resource-guide-${area}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const sections = ["Move between areas", ...guide.groups.map(group => group.title), "Account"];
  return <Dialog>
    <DialogTrigger className="resource-help-trigger" data-area={area} aria-label={`How to use ${guide.name}`}>
      <BookOpenText size={18} aria-hidden="true" />
      <span>How to use</span>
    </DialogTrigger>
    <DialogContent className="resource-help-dialog" aria-label={`How to use ${guide.name}`}>
      <DialogHeader className="resource-help-dialog-header">
        <span className="resource-help-dialog-icon"><BookOpenText size={22} aria-hidden="true" /></span>
        <div><span className="resource-help-eyebrow">Resources guide</span><DialogTitle>How to use {guide.name}</DialogTitle><DialogDescription>Follow the controls shown on this page. Changes ask for confirmation before they are saved to the research database.</DialogDescription></div>
      </DialogHeader>
      <div className="resource-help-content" key={area}>
        <nav className="resource-help-nav" aria-label={`${guide.name} guide sections`}>{sections.map(title => <button key={title} type="button" onClick={() => document.getElementById(sectionId(title))?.scrollIntoView({ block: "start" })}>{title}</button>)}</nav>
        <section id={sectionId("Move between areas")} className="resource-help-group"><h3>Move between areas</h3><dl><div><dt><span className="resource-help-control">Sources</span></dt><dd>Browse and manage source records.</dd></div><div><dt><span className="resource-help-control">Claims</span></dt><dd>Review claims and their evidence.</dd></div><div><dt><span className="resource-help-control">Web search</span></dt><dd>Manage discovery rules and page access.</dd></div></dl></section>
        {guide.groups.map(group => <section id={sectionId(group.title)} key={group.title} className="resource-help-group"><h3>{group.title}</h3><dl>{group.controls.map(control => <div key={control.label}><dt><span className={`resource-help-control resource-help-control-${control.kind || "plain"}`}>{control.label}</span></dt><dd>{control.explanation}</dd></div>)}</dl></section>)}
        <section id={sectionId("Account")} className="resource-help-group"><h3>Account</h3><dl><div><dt><span className="resource-help-control">Sign out</span></dt><dd>End the Resources session on this browser.</dd></div></dl></section>
      </div>
    </DialogContent>
  </Dialog>;
}
