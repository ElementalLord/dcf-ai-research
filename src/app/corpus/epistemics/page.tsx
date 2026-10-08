"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Personality = { id: string; canonical_name: string };
type Parameter = { code: string; name: string; state: string; reasons: string[]; explanation: string[]; depthVersion: string };
type ReviewItem = { claimId: string; text: string; certainty: string | null; legacyEvidenceType: string | null; currentType: string | null; proposedType: string; confidence: number;
  signals: Array<{ type: string; weight: number; why: string }>; compound: boolean; contractStatus: string; contractDetail: { reasons?: string[]; evidence?: string[]; provisional?: { candidates?: string[]; typeDependent?: boolean } | null } };
type Summary = { scope: string; versions: Record<string, string>; claims: number; excludedFromScope: number; byType: Record<string, number>; byTypeSatisfied: Record<string, number>;
  byStatus: Record<string, number>; byReview: Record<string, number>; compound: number; exact: { claims: number; exactClaims: number }; parameters: Parameter[]; reviewQueue: ReviewItem[] };

const TYPES = ["TEXTUAL_ASSERTION", "TRADITIONAL_NARRATIVE", "HISTORICAL_FACT", "HISTORICAL_INFERENCE", "SCHOLARLY_ATTRIBUTION", "SCHOLARLY_INTERPRETATION",
  "SYNTHETIC_INTERPRETATION", "MODERN_RECEPTION", "NORMATIVE_RELEVANCE", "CONTESTED", "METHODOLOGICAL"];

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Epistemics request failed.");
  return data;
}

export default function EpistemicsPage() {
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [personalityId, setPersonalityId] = useState("");
  const [scope, setScope] = useState<"strict" | "test">("strict");
  const [reviewer, setReviewer] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { api("/api/corpus/onboard").then((data) => { setPersonalities(data.personalities || []); setPersonalityId(data.personalities?.[0]?.id || ""); }).catch((error) => setMessage(error.message)); }, []);
  async function act(label: string, work: () => Promise<void>) {
    setBusy(label); setMessage("");
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : `${label} failed.`); } finally { setBusy(""); }
  }
  const load = (nextScope = scope) => act("Loading", async () => setSummary(await api(`/api/corpus/epistemics?personalityId=${personalityId}&scope=${nextScope}`)));
  const reassess = () => act("Reassessing", async () => {
    await api("/api/corpus/epistemics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reassess", personalityId }) });
    setSummary(await api(`/api/corpus/epistemics?personalityId=${personalityId}&scope=${scope}`));
  });
  const review = (item: ReviewItem, decision: string) => act("Saving review", async () => {
    if (!reviewer.trim()) throw new Error("Enter your reviewer name first.");
    await api("/api/corpus/epistemics", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review", claimId: item.claimId, decision, type: decision === "change_type" ? changes[item.claimId] || item.proposedType : undefined, reviewer, reviewerKind: "human" }) });
    setSummary(await api(`/api/corpus/epistemics?personalityId=${personalityId}&scope=${scope}`));
  });

  return <main className="mx-auto max-w-7xl px-4 py-8">
    <nav className="mb-6 flex gap-4 text-sm"><Link href="/corpus" className="underline">Corpus</Link><Link href="/corpus/reconcile" className="underline">Reconciliation</Link><Link href="/corpus/evidence" className="underline">Evidence Completion</Link></nav>
    <p className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Corpus administration</p>
    <h1 className="mt-2 text-4xl font-bold">Claim Epistemics</h1>
    <p className="mt-2 max-w-3xl text-zinc-600">What each approved claim asserts (narrative, textual, historical, interpretive, contested…), the evidence that kind of claim requires, and whether its evidence meets that contract. Depth is judged by contract satisfaction, not by one uniform exact-passage rate.</p>
    <section className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5 shadow-sm">
      <label className="text-sm">Personality<select className="input mt-1" value={personalityId} onChange={(event) => setPersonalityId(event.target.value)}>{personalities.map((item) => <option key={item.id} value={item.id}>{item.canonical_name}</option>)}</select></label>
      <label className="text-sm">Metrics<select className="input mt-1" value={scope} onChange={(event) => { const next = event.target.value as "strict" | "test"; setScope(next); void load(next); }}><option value="strict">Strict (excludes AI-only approvals)</option><option value="test">Test (includes AI-reviewed claims)</option></select></label>
      <label className="text-sm">Reviewer<input className="input mt-1" value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Your name" /></label>
      <button disabled={Boolean(busy) || !personalityId} onClick={() => load()} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Load</button>
      <button disabled={Boolean(busy) || !personalityId} onClick={reassess} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">Reassess (keeps human decisions)</button>
      {busy && <span className="text-sm text-zinc-500">{busy}…</span>}
    </section>
    {message && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>}
    {summary && <>
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold">Claim types ({summary.scope})</h2>
          <p className="mt-1 text-xs text-zinc-500">{summary.claims} claims · {summary.excludedFromScope} outside this scope · {summary.compound} compound · exact passages {summary.exact.exactClaims}/{summary.exact.claims} · {Object.values(summary.versions).join(" · ")}</p>
          <ul className="mt-3 space-y-1 text-sm">{Object.entries(summary.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => <li key={type}>{type}: {count}{!type.startsWith("UNTYPED") && ` (met ${summary.byTypeSatisfied[`${type}:met`] || 0})`}</li>)}</ul></div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold">Evidence contracts</h2>
          <ul className="mt-3 space-y-1 text-sm">{Object.entries(summary.byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => <li key={status}>{status}: {count}</li>)}</ul>
          <h3 className="mt-4 font-semibold">Type review</h3><ul className="mt-1 space-y-1 text-sm">{Object.entries(summary.byReview).map(([status, count]) => <li key={status}>{status}: {count}</li>)}</ul></div>
      </section>
      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold">Parameter depth</h2>
        <div className="mt-3 space-y-3">{summary.parameters.map((parameter) => <details key={parameter.code} className="rounded-xl border p-3"><summary className="cursor-pointer text-sm"><span className="font-semibold">{parameter.state}</span> · {parameter.name} <span className="text-xs text-zinc-500">({parameter.depthVersion})</span></summary>
          <ul className="mt-2 list-disc pl-5 text-sm">{parameter.explanation.map((line) => <li key={line}>{line}</li>)}</ul>
          {parameter.reasons.length > 0 && <p className="mt-2 text-xs text-amber-900">Blocking: {parameter.reasons.join("; ")}</p>}</details>)}</div></section>
      <section className="mt-6 space-y-3"><h2 className="text-xl font-semibold">Pending type reviews ({summary.reviewQueue.length})</h2>
        {summary.reviewQueue.map((item) => <article key={item.claimId} className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="leading-7">{item.text}</p>
          <p className="mt-1 text-xs text-zinc-500">current {item.currentType || "unclassified"} · proposed {item.proposedType} ({item.confidence}) · legacy {item.legacyEvidenceType} · {item.certainty}{item.compound ? " · compound" : ""}</p>
          <p className="mt-1 text-xs text-zinc-500">Why: {item.signals.map((signal) => `${signal.type} +${signal.weight} (${signal.why})`).join("; ")}</p>
          <p className="mt-1 text-xs text-zinc-500">Evidence: {(item.contractDetail.evidence || []).join(", ") || "no passages"} · {item.contractStatus}: {(item.contractDetail.reasons || []).join(" ")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button disabled={Boolean(busy)} onClick={() => review(item, "confirm_type")} className="rounded bg-zinc-900 px-3 py-2 text-xs text-white">Confirm {item.proposedType}</button>
            <select className="rounded border px-2 py-1 text-xs" value={changes[item.claimId] || item.proposedType} onChange={(event) => setChanges((old) => ({ ...old, [item.claimId]: event.target.value }))}>{TYPES.map((type) => <option key={type}>{type}</option>)}</select>
            <button disabled={Boolean(busy)} onClick={() => review(item, "change_type")} className="rounded border px-3 py-2 text-xs">Change type</button>
            <button disabled={Boolean(busy)} onClick={() => review(item, "mark_contested")} className="rounded border px-3 py-2 text-xs">Mark contested</button>
            <button disabled={Boolean(busy)} onClick={() => review(item, "mark_synthetic")} className="rounded border px-3 py-2 text-xs">Mark synthetic</button>
            <button disabled={Boolean(busy)} onClick={() => review(item, "mark_historical_inference")} className="rounded border px-3 py-2 text-xs">Mark historical inference</button>
            <button disabled={Boolean(busy)} onClick={() => review(item, "keep_unclassified")} className="rounded border px-3 py-2 text-xs">Keep unclassified</button>
          </div></article>)}</section>
    </>}
  </main>;
}
