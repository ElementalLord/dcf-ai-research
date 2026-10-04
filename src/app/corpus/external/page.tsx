"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Personality = { id: string; canonical_name: string };
type Plan = { personality: { name: string }; provider: string; configured: boolean; coverage: Record<string, number>; weakAreas: Array<{ name: string; sourceChunks: number; uniqueEvidenceSources: number; claimsWithExactPassages: number; approvedClaims: number }>; queries: Array<{ query: string }>; estimatedSearchRequests: number; policyNote: string | null };
type Run = { id: string; status: string; next_query_index: number; queries: Array<{ query: string }>; max_search_requests: number; search_calls: number; cache_hits: number; candidate_urls: number; accepted_urls: number; rejected_urls: number; pages_fetched: number; pages_cache_hits: number; chunks_added: number; duplicate_urls: number; saturated_steps: number; error_category: string | null; discovered_candidates: Array<{ url: string; status: string; reason?: string }> };

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "External research request failed.");
  return data;
}

export default function ExternalResearchPage() {
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [personalityId, setPersonalityId] = useState("");
  const [maxSearchRequests, setMaxSearchRequests] = useState(25);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const stopRequested = useRef(false);

  useEffect(() => { api("/api/corpus/onboard").then((data) => { setPersonalities(data.personalities || []); setPersonalityId(data.personalities?.find((item: Personality) => /vishvamitra/i.test(item.canonical_name))?.id || data.personalities?.[0]?.id || ""); }).catch((error) => setMessage(error.message)); }, []);
  const action = useCallback(async (body: object): Promise<Run> => (await api("/api/corpus/external-research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).run, []);

  async function preview() {
    setBusy(true); setMessage(""); setPlan(null);
    try { const data = await api(`/api/corpus/external-research?personalityId=${encodeURIComponent(personalityId)}&maxSearchRequests=${maxSearchRequests}`); setPlan(data.plan); setRun(data.run); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Preview failed."); }
    finally { setBusy(false); }
  }
  async function runSteps(initial: Run) {
    setBusy(true); stopRequested.current = false;
    let current = initial;
    try {
      while (current.status === "running" && !stopRequested.current) {
        current = await action({ action: "step", runId: current.id });
        setRun(current);
      }
      if (stopRequested.current && current.status === "running") { current = await action({ action: "stop", runId: current.id }); setRun(current); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Expansion stopped after an error."); }
    finally { setBusy(false); }
  }
  async function start() {
    setMessage("");
    try { const created = await action({ action: "start", personalityId, maxSearchRequests }); setRun(created); await runSteps(created); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Expansion could not start."); }
  }
  async function resume() {
    if (!run) return;
    try { const resumed = await action({ action: "resume", runId: run.id }); setRun(resumed); await runSteps(resumed); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Resume failed."); }
  }
  return <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-900"><div className="mx-auto max-w-5xl">
    <nav className="mb-6 flex gap-4 text-sm"><Link href="/corpus" className="underline">Corpus</Link><Link href="/corpus/onboard" className="underline">Onboarding</Link><Link href="/ask" className="underline">Ask</Link></nav>
    <h1 className="text-4xl font-bold">External Research</h1><p className="mt-2 text-zinc-600">Brave Search discovers URLs. Approved original pages supply all evidence and citations.</p>
    <section className="mt-7 rounded-2xl border bg-white p-6"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Personality<select className="input mt-2" value={personalityId} onChange={(event) => { setPersonalityId(event.target.value); setPlan(null); setRun(null); }}>{personalities.map((item) => <option key={item.id} value={item.id}>{item.canonical_name}</option>)}</select></label><label className="text-sm font-medium">Hard search limit<input className="input mt-2" type="number" min={1} max={100} value={maxSearchRequests} onChange={(event) => { setMaxSearchRequests(Math.max(1, Math.min(100, Number(event.target.value) || 1))); setPlan(null); }} /></label></div><button disabled={busy || !personalityId} onClick={preview} className="mt-5 rounded-lg bg-zinc-900 px-4 py-2 text-white disabled:opacity-50">Preview Research Plan</button></section>
    {message && <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}
    {plan && <section className="mt-6 rounded-2xl border bg-white p-6"><h2 className="text-2xl font-semibold">{plan.personality.name} Corpus Expansion Plan</h2><p className="mt-2 text-sm">Provider: {plan.provider} · {plan.configured ? "Configured" : "Not configured"} · Estimated Brave searches: {plan.estimatedSearchRequests}</p>{plan.policyNote && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{plan.policyNote} <Link className="underline" href="/corpus/sources">Review internet permissions</Link></p>}<p className="mt-2 text-sm">Current corpus: {plan.coverage.sources} sources, {plan.coverage.chunks} chunks, {plan.coverage.approvedClaims} approved claims.</p><h3 className="mt-5 font-semibold">Weakest coverage</h3><ul className="mt-2 list-inside list-disc text-sm">{plan.weakAreas.map((gap) => <li key={gap.name}>{gap.name}: {gap.sourceChunks} tagged chunks, {gap.uniqueEvidenceSources} sources, {gap.claimsWithExactPassages}/{gap.approvedClaims} claims with passages</li>)}</ul><h3 className="mt-5 font-semibold">Planned queries</h3><ol className="mt-2 list-inside list-decimal text-sm">{plan.queries.map((item, index) => <li key={index}>{item.query}</li>)}</ol><button disabled={!plan.configured || busy || Boolean(run && run.status === "running")} onClick={start} className="mt-6 rounded-lg bg-emerald-800 px-4 py-2 text-white disabled:opacity-50">Run Limited Expansion</button></section>}
    {run && <section className="mt-6 rounded-2xl border bg-white p-6"><h2 className="text-2xl font-semibold">Expansion run · {run.status}</h2><p className="mt-2 text-sm">Query {run.next_query_index}/{run.queries.length} · Brave calls {run.search_calls}/{run.max_search_requests} · Cached searches {run.cache_hits}</p><div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">{[["Candidate URLs", run.candidate_urls], ["Policy accepted", run.accepted_urls], ["Policy rejected", run.rejected_urls], ["New pages", run.pages_fetched], ["Page cache hits", run.pages_cache_hits], ["New chunks", run.chunks_added], ["Duplicate URLs", run.duplicate_urls], ["Saturation steps", run.saturated_steps]].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><strong>{value}</strong> {label}</div>)}</div>{run.error_category && <p className="mt-3 text-sm text-amber-800">Provider: {run.error_category}</p>}{run.discovered_candidates?.length > 0 && <details className="mt-4"><summary className="cursor-pointer font-medium">Candidate URLs and policy decisions</summary><ul className="mt-2 space-y-2 text-xs">{run.discovered_candidates.map((item, index) => <li key={`${item.url}-${index}`} className="break-all rounded border p-2">{item.status}: {item.url} {item.reason && `(${item.reason})`}</li>)}</ul></details>}<div className="mt-5 flex gap-3">{run.status === "running" && <button onClick={async () => { if (busy) stopRequested.current = true; else setRun(await action({ action: "stop", runId: run.id })); }} className="rounded-lg border px-4 py-2">Stop</button>}{run.status === "running" && !busy && <button onClick={() => runSteps(run)} className="rounded-lg bg-zinc-900 px-4 py-2 text-white">Continue</button>}{run.status === "stopped" && <button disabled={busy} onClick={resume} className="rounded-lg bg-zinc-900 px-4 py-2 text-white disabled:opacity-50">Resume</button>}</div></section>}
  </div></main>;
}
