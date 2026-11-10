"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";

export type ResourcesSection = "library" | "feedback" | "readiness" | "knowledge";

const sections: Array<{ id: ResourcesSection; href: string; label: string; title: string; description: string }> = [
  { id: "library", href: "/resources", label: "Sources & claims", title: "Sources and claims", description: "Review sources and claims, and manage which websites research may search." },
  { id: "feedback", href: "/resources/feedback", label: "Feedback", title: "Feedback", description: "Ratings and comments from people using Ask DCF." },
  { id: "readiness", href: "/resources/readiness", label: "Readiness", title: "Readiness", description: "How ready each person's profile is. Retrieval readiness is kept separate from human-verified publication readiness." },
  { id: "knowledge", href: "/resources/knowledge", label: "Knowledge engine", title: "Knowledge engine", description: "Question-triggered research, admission and spending." },
];

/** One header and section menu shared by every Resources page, so moving between them always works the same way. */
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

  return <header className="resources-nav">
    <div className="resources-nav-top">
      <div>
        <p className="resources-nav-eyebrow">Resources</p>
        <h1>{section.title}</h1>
        <p className="resources-nav-description">{section.description}</p>
      </div>
      <div className="resources-nav-actions">
        {actions}
        <button type="button" className="resources-nav-signout" onClick={signOut} disabled={signingOut}><LogOut size={16} aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}</button>
      </div>
    </div>
    {error && <p className="resource-error" role="alert">{error}</p>}
    <nav className="resources-nav-tabs" aria-label="Resources sections">
      {sections.map(item => <Link key={item.id} href={item.href} aria-current={item.id === current ? "page" : undefined}>{item.label}</Link>)}
    </nav>
  </header>;
}
