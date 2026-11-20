"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Chakra, Footsteps, Manuscript, Seeds, Shankha } from "@/components/vedic-icons";
import SectionHelp from "./section-help";

export type ResourcesSection = "people" | "library" | "feedback" | "knowledge" | "diagnostics";

const sections: Array<{ id: ResourcesSection; href: string; label: string; purpose: string; title: string; description: string; Icon: typeof Manuscript }> = [
  { id: "people", href: "/resources/people", label: "People", purpose: "Add someone to Explore", title: "People", description: "Add or edit anyone on Explore, including the 25 curated profiles: photo, names, era, place, reading angles and starter sources. Publish when their sources and claims are approved.", Icon: Footsteps },
  { id: "library", href: "/resources", label: "Sources & claims", purpose: "What answers may rely on", title: "Sources and claims", description: "Check the books, texts and records behind each person, approve the statements answers may use, and choose which websites live research may read.", Icon: Manuscript },
  { id: "feedback", href: "/resources/feedback", label: "Feedback", purpose: "What readers said", title: "Feedback", description: "Star ratings and comments from people using Ask DCF. Start with low-rated answers.", Icon: Shankha },
  { id: "knowledge", href: "/resources/knowledge", label: "Knowledge engine", purpose: "Automatic research and spending", title: "Knowledge engine", description: "What live research has done, what it cost, what it harvested, and whether AI may add sources on its own.", Icon: Chakra },
  { id: "diagnostics", href: "/resources/diagnostics", label: "Extra diagnostics", purpose: "Logs and scores for troubleshooting", title: "Extra diagnostics", description: "Detailed tables for troubleshooting, not day-to-day work: readiness scores, the research run log, automatic verification decisions, cooldowns and machine-admitted sources.", Icon: Seeds },
];

/** One header and section switcher shared by every Resources page, so moving between them always works the same way. */
export default function ResourcesNav({ current, actions }: { current: ResourcesSection; actions?: ReactNode }) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const section = sections.find(item => item.id === current)!;

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw new Error("sign_out_failed");
      // A full reload clears the signed-in state; protected pages then send the visitor to sign in.
      window.location.reload();
    } catch {
      setError("Could not sign out. Try again.");
      setSigningOut(false);
    }
  }

  return <header className="resources-nav res-nav">
    <div className="res-nav-top">
      <p className="res-nav-eyebrow">Resources · board members only</p>
      <div className="res-nav-actions">
        {actions ?? <SectionHelp section={current} />}
        <button type="button" className="key res-nav-signout" onClick={signOut} disabled={signingOut}><LogOut size={16} aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}</button>
      </div>
    </div>
    <nav className="res-nav-sections" data-tour="nav" aria-label="Resources sections">
      {sections.map(item => <Link key={item.id} href={item.href} aria-current={item.id === current ? "page" : undefined}>
        <item.Icon size={20} /><span><strong>{item.label}</strong><small>{item.purpose}</small></span>
      </Link>)}
    </nav>
    <div className="res-nav-heading">
      <h1>{section.title}</h1>
      <p>{section.description}</p>
    </div>
    {error && <p className="resource-error" role="alert">{error}</p>}
  </header>;
}
