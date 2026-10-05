"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Personality = { id: string; canonical_name: string };
type Location = { key: string; work: string; locator: string; kind: string; priority: number; claims: number; coreClaims: number; parameters: string[]; availability: string[]; storedAlternate: boolean };
type Preview = { approvedClaims: number; missingClaims: number; requirements: number; addressable: number; locations: number; top: Location[] };
type Result = Location & { acquisition: { method: string; detail: string; failureReason?: string }; exact: number; strong: number; partial: number };
type Coverage = { approvedClaims: number; exactClaims: number; parameters: Array<{ code: string; name: string; exact: number; approved: number; depth?: string }> };
type Report = { dryRun: boolean; attempted: number; results: Result[]; exactAdded: number; strongAdded: number; partialAdded: number; braveCalls: number; geminiCalls: number;
  metrics: Record<string, number>; alternates: Array<{ original: string; access: string; relation: string }>; largePdfs: string[]; before: Coverage; after: Coverage };
type Requirement = { location_key: string; locator_raw: string | null; status: string; source_availability: string; priority: number; resolution: { failureReason?: string | null; level?: string; acquisition?: { method: string } } };

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Evidence completion request failed.");
  return data;
}

export default function EvidenceCompletionPage() {
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [personalityId, setPersonalityId] = useState("");
  const [maxLocations, setMaxLocations] = useState(30);
  const [braveBudget, setBraveBudget] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { api("/api/corpus/onboard").then((data) => { setPersonalities(data.personalities || []); setPersonalityId(data.personalities?.[0]?.id || ""); }).catch((error) => setMessage(error.message)); }, []);

  async function act(label: string, work: () => Promise<void>) {
    setBusy(label); setMessage("");
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : `${label} failed.`); } finally { setBusy(""); }
  }
  const loadRequirements = async () => setRequirements((await api(`/api/corpus/evidence-completion?personalityId=${personalityId}&view=requirements`)).requirements || []);
  const previewGaps = () => act("Preview", async () => { setPreview(await api(`/api/corpus/evidence-completion?personalityId=${personalityId}&limit=50`)); await loadRequirements(); });
  const runCompletion = (dryRun: boolean) => act(dryRun ? "Dry run" : "Run", async () => {
    setReport(await api("/api/corpus/evidence-completion", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personalityId, maxLocations, braveBudget: dryRun ? 0 : braveBudget, dryRun }) }));
    await loadRequirements();
  });

  return <main className="mx-auto max-w-7xl px-4 py-8">
    <nav className="mb-6 flex gap-4 text-sm"><Link href="/corpus" className="underline">Corpus</Link><Link href="/corpus/external" className="underline">External Research</Link><Link href="/ask" className="underline">Ask</Link></nav>
    <p className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Corpus administration</p>
    <h1 className="mt-2 text-4xl font-bold">Citation-first Evidence Completion</h1>
    <p className="mt-2 max-w-3xl text-zinc-600">Approved claims without exact passage support, grouped by the passage their own citations name. Acquisition tries stored passages, the cited source, verified copies of the same work, and sibling pages before any exact-work search. No Gemini calls.</p>
    <section className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5 shadow-sm">
      <label className="text-sm">Personality<select className="input mt-1" value={personalityId} onChange={(event) => setPersonalityId(event.target.value)}>{personalities.map((item) => <option key={item.id} value={item.id}>{item.canonical_name}</option>)}</select></label>
      <label className="text-sm">Locations<input className="input mt-1 w-24" type="number" min={1} max={60} value={maxLocations} onChange={(event) => setMaxLocations(Number(event.target.value))} /></label>
      <label className="text-sm">Brave budget<input className="input mt-1 w-24" type="number" min={0} max={8} value={braveBudget} onChange={(event) => setBraveBudget(Number(event.target.value))} /></label>
      <button disabled={Boolean(busy) || !personalityId} onClick={previewGaps} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Preview evidence gaps</button>
      <button disabled={Boolean(busy) || !personalityId} onClick={() => runCompletion(true)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Dry run</button>
      <button disabled={Boolean(busy) || !personalityId} onClick={() => runCompletion(false)} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">Run evidence completion</button>
      {busy && <span className="text-sm text-zinc-500">{busy}…</span>}
    </section>
    {message && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>}
    {preview && <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">Queue</h2>
      <p className="mt-1 text-sm text-zinc-600">{preview.missingClaims} of {preview.approvedClaims} approved claims lack exact support · {preview.requirements} citations · {preview.addressable} with a usable locator · {preview.locations} passage locations</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-zinc-50 text-zinc-500"><tr><th className="p-2">Priority</th><th className="p-2">Location</th><th className="p-2">Claims (core)</th><th className="p-2">Parameters</th><th className="p-2">Availability</th></tr></thead>
        <tbody>{preview.top.map((item) => <tr key={item.key} className="border-t"><td className="p-2">{item.priority}</td><td className="p-2"><p className="font-medium">{item.work}</p><p className="text-xs text-zinc-500">{item.locator} · {item.kind}</p></td><td className="p-2">{item.claims} ({item.coreClaims})</td><td className="p-2 text-xs">{item.parameters.join(", ")}</td><td className="p-2 text-xs">{item.availability.join(", ")}{item.storedAlternate ? " · stored copy" : ""}</td></tr>)}</tbody></table></div>
    </section>}
    {report && <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">{report.dryRun ? "Dry run" : "Run"} result</h2>
      <p className="mt-1 text-sm text-zinc-600">{report.attempted} locations · EXACT {report.exactAdded} · STRONG {report.strongAdded} · PARTIAL {report.partialAdded} · Brave {report.braveCalls} · Gemini {report.geminiCalls}</p>
      <p className="mt-1 text-sm text-zinc-600">Exact coverage {report.before.exactClaims}/{report.before.approvedClaims} → {report.after.exactClaims}/{report.after.approvedClaims}</p>
      <p className="mt-1 text-xs text-zinc-500">{Object.entries(report.metrics || {}).map(([key, value]) => `${key} ${value}`).join(" · ")}</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-zinc-50 text-zinc-500"><tr><th className="p-2">Location</th><th className="p-2">Acquisition</th><th className="p-2">Failure</th><th className="p-2">E / S / P</th></tr></thead>
        <tbody>{report.results.map((item) => <tr key={item.key} className="border-t align-top"><td className="p-2"><p className="font-medium">{item.work}</p><p className="text-xs text-zinc-500">{item.locator}</p></td><td className="p-2">{item.acquisition.method}<p className="max-w-md text-xs text-zinc-500">{item.acquisition.detail}</p></td><td className="p-2 text-xs">{item.acquisition.failureReason || ""}</td><td className="p-2">{item.exact} / {item.strong} / {item.partial}</td></tr>)}</tbody></table></div>
      <h3 className="mt-5 font-semibold">Parameters</h3>
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{report.after.parameters.map((parameter) => { const before = report.before.parameters.find((item) => item.code === parameter.code); return <li key={parameter.code}>{parameter.name}: {before?.exact}/{before?.approved} {before?.depth} → {parameter.exact}/{parameter.approved} {parameter.depth}</li>; })}</ul>
      {report.alternates.length > 0 && <><h3 className="mt-5 font-semibold">Access copies</h3><ul className="mt-2 space-y-1 text-sm">{report.alternates.map((item) => <li key={item.access}>{item.original} → <span className="break-all">{item.access}</span> ({item.relation})</li>)}</ul></>}
    </section>}
    {requirements.length > 0 && <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">Persisted requirements ({requirements.length})</h2>
      <div className="mt-4 max-h-[32rem] overflow-auto"><table className="w-full text-left text-xs"><thead className="bg-zinc-50 text-zinc-500"><tr><th className="p-2">Location</th><th className="p-2">Status</th><th className="p-2">Availability</th><th className="p-2">Acquisition</th><th className="p-2">Failure reason</th></tr></thead>
        <tbody>{requirements.map((item, index) => <tr key={`${item.location_key}-${index}`} className="border-t"><td className="p-2">{item.location_key}</td><td className="p-2">{item.status}</td><td className="p-2">{item.source_availability}</td><td className="p-2">{item.resolution?.acquisition?.method || ""}</td><td className="p-2">{item.resolution?.failureReason || ""}</td></tr>)}</tbody></table></div>
    </section>}
  </main>;
}
