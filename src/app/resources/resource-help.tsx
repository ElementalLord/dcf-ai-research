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
        { label: "Create candidate", explanation: "Save the new source for review.", kind: "action" },
        { label: "Find a source", explanation: "Search titles, authors, publishers, types, and citations.", kind: "field" },
        { label: "Current", explanation: "Show sources that are candidates or approved.", kind: "selected" },
        { label: "Rejected", explanation: "Show sources that were rejected, including their review notes." },
        { label: "Filters", explanation: "Open status, source type, and sort controls." },
        { label: "Status", explanation: "In Filters, show all current sources, candidates, or approved sources.", kind: "field" },
        { label: "Source type", explanation: "In Filters, narrow the list to one source type.", kind: "field" },
        { label: "Sort by", explanation: "In Filters, order by title, linked claim count, or recent update.", kind: "field" },
        { label: "Clear filters", explanation: "Reset the search, status, type, and sort choices." },
      ] },
      { title: "Work with a source", controls: [
        { label: "Open / source title", explanation: "Open the source record, linked claims, and passages.", kind: "action" },
        { label: "Back to sources", explanation: "Close the source drawer and return to the list." },
        { label: "↗", explanation: "Open the original source page in a new tab." },
        { label: "Edit source", explanation: "Change its title, URL, type, and publication details." },
        { label: "Save source", explanation: "Save the changes made while editing a source.", kind: "action" },
        { label: "Cancel edit", explanation: "Leave editing without saving those changes." },
        { label: "Approve", explanation: "Approve a candidate source for research use.", kind: "selected" },
        { label: "Reject", explanation: "Move the source to Rejected after recording a reviewer.", kind: "danger" },
        { label: "Return to review", explanation: "Move an approved or rejected source back to candidate status." },
        { label: "Remove candidate", explanation: "Remove an unlinked candidate source." },
        { label: "Publication details", explanation: "Expand author, publisher, citation, type, and textual layer." },
        { label: "Review and access notes", explanation: "Expand the review note and rights or access note." },
        { label: "Linked claims", explanation: "Expand the claims connected to this source; select one to open it." },
        { label: "Passages", explanation: "Expand the text passages saved for this source." },
        { label: "Add passage", explanation: "Add source text and its page or section in the Passages section." },
        { label: "Confirm decision", explanation: "Save an approval, rejection, or return to review with a reviewer name." },
      ] },
      { title: "List controls", controls: [
        { label: "Previous", explanation: "Go to the preceding page when more than 25 sources are listed." },
        { label: "Next", explanation: "Go to the following page when more than 25 sources are listed." },
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
        { label: "Create draft", explanation: "Save the claim and its supporting excerpt for review.", kind: "action" },
        { label: "Cancel", explanation: "Close Add claim without saving the draft." },
        { label: "Find a claim", explanation: "Search claim text, research fields, and linked source titles.", kind: "field" },
        { label: "Current", explanation: "Show drafts, claims needing review, and approved claims.", kind: "selected" },
        { label: "Rejected", explanation: "Show rejected claims and their review history." },
        { label: "Filters", explanation: "Narrow the current list by review status." },
        { label: "Status", explanation: "In Filters, show drafts, claims needing review, or approved claims.", kind: "field" },
        { label: "Clear filters", explanation: "Reset the search and status choice." },
      ] },
      { title: "Review a claim", controls: [
        { label: "Open / claim text", explanation: "Read the claim, supporting evidence, and review history.", kind: "action" },
        { label: "Back to claims", explanation: "Close the claim drawer and return to the list." },
        { label: "View source record", explanation: "Open the source linked to a supporting excerpt." },
        { label: "Edit claim", explanation: "Change a reviewable claim's text, certainty, or notes." },
        { label: "Save claim", explanation: "Save the edits made to a claim.", kind: "action" },
        { label: "Cancel edit", explanation: "Leave claim editing without saving those changes." },
        { label: "Claim classification", explanation: "Expand field, certainty, kind, evidence type, and knowledge type." },
        { label: "Review history", explanation: "Expand earlier decisions, reviewers, dates, and notes." },
        { label: "Approve", explanation: "Approve the claim after checking its evidence.", kind: "selected" },
        { label: "Reject", explanation: "Move the claim to Rejected and record a reviewer.", kind: "danger" },
        { label: "Return to review", explanation: "Move an approved or rejected claim back to review." },
        { label: "Remove draft", explanation: "Remove a draft claim." },
        { label: "Confirm decision", explanation: "Save a review decision with the reviewer name and optional note." },
        { label: "Previous", explanation: "Go to the preceding page when more than 25 claims are listed." },
        { label: "Next", explanation: "Go to the following page when more than 25 claims are listed." },
      ] },
    ],
  },
  websites: {
    name: "Web search",
    groups: [
      { title: "Live search", controls: [
        { label: "Live search", explanation: "Open domain discovery rules and recently found websites.", kind: "selected" },
        { label: "Search mode", explanation: "Choose broad credible search or restrict discovery to allowed domains.", kind: "field" },
        { label: "Add domain", explanation: "Create an allowed, blocked, or paused domain rule.", kind: "action" },
        { label: "Domain rules", explanation: "Show the saved rules that control website discovery." },
        { label: "Recently found", explanation: "Show new domains found during live research." },
        { label: "Find a website", explanation: "Search saved domain rules by name, domain, category, or notes.", kind: "field" },
        { label: "Edit", explanation: "Change a domain's name, status, category, or notes; the dialog also has Remove rule." },
        { label: "Save rule", explanation: "Save a new or edited domain rule.", kind: "action" },
        { label: "Cancel", explanation: "Close the domain rule form without saving." },
        { label: "Remove rule", explanation: "Delete the open domain rule." },
        { label: "Allow", explanation: "Prepare an allowed rule for a recently found domain.", kind: "selected" },
        { label: "Block", explanation: "Prepare a blocked rule for a recently found domain.", kind: "danger" },
        { label: "Ignore", explanation: "Dismiss a recently found domain from the discovery list." },
        { label: "Show more rules", explanation: "Reveal the next set of saved domain rules." },
        { label: "Show more discoveries", explanation: "Reveal more recently found domains." },
      ] },
      { title: "Page access", controls: [
        { label: "Page access", explanation: "Open page, section, and whole website permissions." },
        { label: "Add website", explanation: "Create a permission rule and choose how broadly it applies.", kind: "action" },
        { label: "Current", explanation: "Show page rules that are available for review or use.", kind: "selected" },
        { label: "Rejected", explanation: "Show page rules marked Rejected." },
        { label: "Find a page or site", explanation: "Search page addresses, names, and domains.", kind: "field" },
        { label: "Site row", explanation: "Expand a domain to see the rules for its pages and sections." },
        { label: "Search", explanation: "Toggle whether live search can discover this page or site." },
        { label: "Read", explanation: "Toggle whether live research can fetch its page text." },
        { label: "Import", explanation: "Toggle whether its text can be imported into the library." },
        { label: "Evidence", explanation: "Set a page rule to Review, Approved, or Rejected." },
        { label: "Edit", explanation: "Change scope, permissions, evidence use, active state, or notes." },
        { label: "This page", explanation: "Apply a new access rule only to the entered URL." },
        { label: "This section", explanation: "Apply a new rule to the entered path and pages below it." },
        { label: "Whole website", explanation: "Apply a new rule across the site's domain." },
        { label: "Active", explanation: "Pause or resume a page access rule." },
        { label: "Save access", explanation: "Save the page permission choices.", kind: "action" },
        { label: "Cancel", explanation: "Close the page access form without saving." },
        { label: "Show more sites", explanation: "Reveal more domains in the page access list." },
      ] },
    ],
  },
};

export default function ResourceHelp({ area }: { area: Area }) {
  const guide = guides[area];
  return <Dialog>
    <DialogTrigger className="resource-help-trigger" data-area={area} aria-label={`How to use ${guide.name}`}>
      <BookOpenText size={18} aria-hidden="true" />
      <span>How to use <strong>{guide.name}</strong></span>
    </DialogTrigger>
    <DialogContent className="resource-help-dialog" aria-label={`How to use ${guide.name}`}>
      <DialogHeader className="resource-help-dialog-header">
        <span className="resource-help-dialog-icon"><BookOpenText size={22} aria-hidden="true" /></span>
        <div><span className="resource-help-eyebrow">BUTTON GUIDE</span><DialogTitle>How to use {guide.name}</DialogTitle><DialogDescription>Find what each button does and when to use it.</DialogDescription></div>
      </DialogHeader>
      <div className="resource-help-content" key={area}>{guide.groups.map(group => <section key={group.title} className="resource-help-group"><h3>{group.title}</h3><dl>{group.controls.map(control => <div key={control.label}><dt><span className={`resource-help-control resource-help-control-${control.kind || "plain"}`}>{control.label}</span></dt><dd>{control.explanation}</dd></div>)}</dl></section>)}<section className="resource-help-group"><h3>Account</h3><dl><div><dt><span className="resource-help-control">Sign out</span></dt><dd>End the Resources session on this browser.</dd></div></dl></section></div>
    </DialogContent>
  </Dialog>;
}
