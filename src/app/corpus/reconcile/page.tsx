"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Personality = { id: string; canonical_name: string };
type Item = {
  id: string; locator_raw: string | null; current_level: string; reasons: string[]; proposal_kind: string; proposed_text: string | null; deterministic: boolean;
  priority: number; status: string; review_note: string | null; reviewer: string | null;
  assessment: { identity?: string; locatorFit?: string; supportRatio?: number; matchedTerms?: string[]; proposalBasis?: string | null; parameterCode?: string | null;
    proposalSupport?: { lexical: string[]; equivalent: string[]; ratio: number } | null };
  claims: { claim_text: string; certainty: string | null; evidence_type: string | null } | null;
  source_chunks: { chunk_text: string; page_or_section: string | null; sources: { title: string; url: string | null } | null } | null;
};
type BuildSummary = { claimsInQueue: number; items: number; reasons: Record<string, number>; compoundClaims: number; interpretiveClaims: number;
  proposals: Record<string, number>; nearGoodParameters: string[] };

const ACTIONS: Array<[string, string]> = [["approve_atomic", "Approve atomic claim"], ["confirm_exact", "Confirm EXACT support"], ["keep_original", "Keep original only"],
  ["mark_interpretive", "Mark interpretive"], ["reject", "Reject proposal"], ["mark_non_supporting", "Mark passage non-supporting"]];

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Reconciliation request failed.");
  return data;
}

export default function ReconcilePage() {
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [personalityId, setPersonalityId] = useState("");
  const [status, setStatus] = useState("proposed");
  const [reviewer, setReviewer] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<BuildSummary | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { api("/api/corpus/onboard").then((data) => { setPersonalities(data.personalities || []); setPersonalityId(data.personalities?.[0]?.id || ""); }).catch((error) => setMessage(error.message)); }, []);
  async function act(label: string, work: () => Promise<void>) {
    setBusy(label); setMessage("");
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : `${label} failed.`); } finally { setBusy(""); }
  }
  const load = (nextStatus = status) => act("Loading", async () => setItems((await api(`/api/corpus/reconciliation?personalityId=${personalityId}&status=${nextStatus}&limit=150`)).items || []));
  const build = () => act("Building queue", async () => {
    setSummary(await api("/api/corpus/reconciliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "build", personalityId }) }));
    setItems((await api(`/api/corpus/reconciliation?personalityId=${personalityId}&status=proposed&limit=150`)).items || []);
  });
  const decide = (item: Item, decision: string) => act("Saving decision", async () => {
    if (!reviewer.trim()) throw new Error("Enter your reviewer name first.");
    await api("/api/corpus/reconciliation", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decide", id: item.id, decision, reviewer, reviewerKind: "human", editedText: edits[item.id] || undefined }) });
    setItems((old) => old.filter((entry) => entry.id !== item.id));
  });

  return <main className="mx-auto max-w-7xl px-4 py-8">
    <nav className="mb-6 flex gap-4 text-sm"><Link href="/corpus" className="underline">Corpus</Link><Link href="/corpus/evidence" className="underline">Evidence Completion</Link><Link href="/corpus/epistemics" className="underline">Epistemics</Link><Link href="/review" className="underline">Claims</Link></nav>
    <p className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Corpus administration</p>
    <h1 className="mt-2 text-4xl font-bold">Evidence Reconciliation</h1>
    <p className="mt-2 max-w-3xl text-zinc-600">Approved claims with a located passage but no EXACT support. Each item says why EXACT failed and proposes an evidence-aligned atomic claim or a confirmation. Approving creates a new lineage-linked claim; the original approved claim is never edited.</p>
    <section className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5 shadow-sm">
      <label className="text-sm">Personality<select className="input mt-1" value={personalityId} onChange={(event) => setPersonalityId(event.target.value)}>{personalities.map((item) => <option key={item.id} value={item.id}>{item.canonical_name}</option>)}</select></label>
      <label className="text-sm">Status<select className="input mt-1" value={status} onChange={(event) => { setStatus(event.target.value); void load(event.target.value); }}>{["proposed", "approved_atomic", "confirmed_exact", "kept_original", "marked_interpretive", "rejected", "passage_non_supporting", "duplicate"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-sm">Reviewer<input className="input mt-1" value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Your name" /></label>
      <button disabled={Boolean(busy) || !personalityId} onClick={build} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">Build reconciliation queue</button>
      <button disabled={Boolean(busy) || !personalityId} onClick={() => load()} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Load items</button>
      {busy && <span className="text-sm text-zinc-500">{busy}…</span>}
    </section>
    {message && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>}
    {summary && <p className="mt-4 text-sm text-zinc-600">{summary.claimsInQueue} claims · {summary.items} items · {summary.compoundClaims} compound · {summary.interpretiveClaims} interpretive · reasons {Object.entries(summary.reasons).map(([key, value]) => `${key} ${value}`).join(", ")}</p>}
    <div className="mt-6 space-y-4">{items.map((item) => {
      const source = item.source_chunks?.sources;
      return <article key={item.id} className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2 text-xs"><span className="rounded bg-zinc-100 px-2 py-1">priority {item.priority}</span><span className="rounded bg-zinc-100 px-2 py-1">current {item.current_level}</span>
          {item.reasons.map((reason) => <span key={reason} className="rounded bg-amber-50 px-2 py-1 text-amber-900">{reason}</span>)}
          <span className="rounded bg-zinc-100 px-2 py-1">{item.proposal_kind}{item.proposal_kind !== "none" ? (item.deterministic ? " · passes evidence policy" : " · likely direct support (confirm)") : ""}</span>
          {item.assessment.parameterCode && <span className="rounded bg-zinc-100 px-2 py-1">{item.assessment.parameterCode}</span>}</div>
        <h2 className="mt-3 text-xs font-semibold uppercase text-zinc-500">Original approved claim</h2>
        <p className="mt-1 leading-7">{item.claims?.claim_text}</p>
        <p className="text-xs text-zinc-500">{item.claims?.certainty} · {item.claims?.evidence_type}</p>
        {item.proposed_text && <><h2 className="mt-3 text-xs font-semibold uppercase text-zinc-500">Proposed {item.proposal_kind === "confirm_exact" ? "confirmation" : "atomic claim"}</h2>
          {item.proposal_kind === "atomic_claim" && item.status === "proposed"
            ? <textarea className="input mt-1 w-full" rows={2} value={edits[item.id] ?? item.proposed_text} onChange={(event) => setEdits((old) => ({ ...old, [item.id]: event.target.value }))} />
            : <p className="mt-1 leading-7">{item.proposed_text}</p>}
          <p className="text-xs text-zinc-500">{item.assessment.proposalBasis}{item.assessment.proposalSupport ? ` · matched ${item.assessment.proposalSupport.lexical.join(", ")}${item.assessment.proposalSupport.equivalent.length ? ` · equivalent ${item.assessment.proposalSupport.equivalent.join(", ")}` : ""}` : ""}</p></>}
        <h2 className="mt-3 text-xs font-semibold uppercase text-zinc-500">Source · locator</h2>
        <p className="text-sm">{source?.title} · cited {item.locator_raw || "—"} · passage {item.source_chunks?.page_or_section || "—"} · {item.assessment.identity} · locator {item.assessment.locatorFit}</p>
        <details className="mt-2"><summary className="cursor-pointer text-sm font-medium">Supporting passage</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{item.source_chunks?.chunk_text}</p></details>
        {item.status === "proposed" ? <div className="mt-4 flex flex-wrap gap-2">{ACTIONS.filter(([action]) => action !== "approve_atomic" || item.proposal_kind === "atomic_claim")
          .filter(([action]) => action !== "confirm_exact" || item.proposal_kind === "confirm_exact")
          .map(([action, label]) => <button key={action} disabled={Boolean(busy)} onClick={() => decide(item, action)} className={`rounded px-3 py-2 text-xs ${action === "approve_atomic" || action === "confirm_exact" ? "bg-zinc-900 text-white" : "border"}`}>{label}</button>)}</div>
          : <p className="mt-3 text-xs text-zinc-500">{item.status} by {item.reviewer}{item.review_note ? ` — ${item.review_note}` : ""}</p>}
      </article>;
    })}{items.length === 0 && <p className="text-sm text-zinc-500">No items for this status.</p>}</div>
  </main>;
}
