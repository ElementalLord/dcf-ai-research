"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Personality = { id: string; canonical_name: string };
type Depth = { overall: string; sufficient: boolean; areas: Array<{ name: string; state: string; reasons: string[] }>; weakAreas: Array<{ name: string; state: string; reasons: string[] }>; benchmark?: { broadReady: boolean; questions: Array<{ question: string; chunks: number; independentWorks: number; exactLocations: number; textualLayers: number }> } };
type Plan = { personality: { name: string }; provider: string; configured: boolean; coverage: Record<string, number>; depth: Depth; weakAreas: Array<{ name: string; sourceChunks: number; uniqueEvidenceSources: number; claimsWithExactPassages: number; approvedClaims: number }>; queries: Array<{ query: string }>; estimatedSearchRequests: number; policyNote: string | null };
type Run = { id: string; mode: string; status: string; stop_reason: string | null; depth_report: Depth; round_reports: Array<{ round: number; searches: number; candidates: number; credible: number; bibliographic: number; rejected: number; pagesFetched: number; chunksAdded: number; primaryPassages?: number; scholarlySources?: number; exactClaimLinks?: number; depth: string; weakAreas: string[] }>; verified_sources: number; bibliographic_sources: number; independent_works: number; primary_passages: number; scholarly_sources: number; exact_claim_links: number; next_query_index: number; queries: Array<{ query: string }>; max_search_requests: number; search_calls: number; cache_hits: number; candidate_urls: number; accepted_urls: number; rejected_urls: number; pages_fetched: number; pages_cache_hits: number; chunks_added: number; duplicate_urls: number; saturated_steps: number; error_category: string | null; discovered_candidates: Array<{ url: string; status: string; reason?: string }> };
type Candidate = { canonical_url: string; title: string | null; institution: string | null; author: string | null; editor: string | null; work_title: string | null; source_family: string | null; source_type: string | null; full_text_status: string | null; access_notes: string | null; independent_work_key: string | null; relevant_parameters: string[]; verification_status: string; verification_reason: string | null; credibility_signals: string[]; credibility_failures: string[] };

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "External research request failed.");
  return data;
}

export default function ExternalResearchPage() {
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [personalityId, setPersonalityId] = useState("");
  const [maxSearchRequests, setMaxSearchRequests] = useState(50);
  const [mode, setMode] = useState<"guided" | "auto">("guided");
  const [focusQuery, setFocusQuery] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [families, setFamilies] = useState<Array<{ domain: string; path_prefix: string; institution: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const stopRequested = useRef(false);

  useEffect(() => { api("/api/corpus/onboard").then((data) => { setPersonalities(data.personalities || []); setPersonalityId(data.personalities?.find((item: Personality) => /vishvamitra/i.test(item.canonical_name))?.id || data.personalities?.[0]?.id || ""); }).catch((error) => setMessage(error.message)); }, []);
  const action = useCallback(async (body: object): Promise<Run> => (await api("/api/corpus/external-research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).run, []);

  async function preview() {
    setBusy(true); setMessage(""); setPlan(null);
    try { const data = await api(`/api/corpus/external-research?personalityId=${encodeURIComponent(personalityId)}&maxSearchRequests=${maxSearchRequests}`); setPlan(data.plan); setRun(data.run); if (data.run) await refreshAudit(data.run.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Preview failed."); }
    finally { setBusy(false); }
  }
  async function refreshAudit(id: string) {
    const data = await api(`/api/corpus/external-research?runId=${encodeURIComponent(id)}`);
    setCandidates(data.candidates || []); setFamilies(data.families || []);
  }
  async function runSteps(initial: Run) {
    setBusy(true); stopRequested.current = false;
    let current = initial;
    try {
      while (current.status === "running" && !stopRequested.current) {
        current = await action({ action: "step", runId: current.id });
        setRun(current);
        if (current.status !== "running") await refreshAudit(current.id);
      }
      if (stopRequested.current && current.status === "running") { current = await action({ action: "stop", runId: current.id }); setRun(current); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Expansion stopped after an error."); }
    finally { setBusy(false); }
  }
  async function start() {
    setMessage("");
    try { const created = await action({ action: "start", personalityId, maxSearchRequests, mode, focusQuery: focusQuery.trim() || undefined }); setRun(created); await runSteps(created); }
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
    <section className="mt-7 rounded-2xl border bg-white p-6"><div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-medium">Personality<select className="input mt-2" value={personalityId} onChange={(event) => { setPersonalityId(event.target.value); setPlan(null); setRun(null); }}>{personalities.map((item) => <option key={item.id} value={item.id}>{item.canonical_name}</option>)}</select></label><label className="text-sm font-medium">Hard search limit<input className="input mt-2" type="number" min={1} max={50} value={maxSearchRequests} onChange={(event) => { setMaxSearchRequests(Math.max(1, Math.min(50, Number(event.target.value) || 1))); setPlan(null); }} /></label><label className="text-sm font-medium">Mode<select className="input mt-2" value={mode} onChange={(event) => setMode(event.target.value as "guided" | "auto")}><option value="guided">Guided · one batch</option><option value="auto">Auto · until stop condition</option></select></label></div><label className="mt-4 block text-sm font-medium">Optional first search focus<input className="input mt-2" maxLength={160} value={focusQuery} onChange={(event) => setFocusQuery(event.target.value)} placeholder="Leave blank for the current highest-priority gap" /></label><button disabled={busy || !personalityId} onClick={preview} className="mt-5 rounded-lg bg-zinc-900 px-4 py-2 text-white disabled:opacity-50">Preview Research Plan</button></section>
    {message && <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}
    {plan && <section className="mt-6 rounded-2xl border bg-white p-6"><h2 className="text-2xl font-semibold">{plan.personality.name} Corpus Expansion Plan</h2><p className="mt-2 text-sm">Provider: {plan.provider} · {plan.configured ? "Configured" : "Not configured"} · First batch: {plan.estimatedSearchRequests} Brave searches · Hard limit: {maxSearchRequests}</p><p className="mt-2 text-sm">Current depth: <strong>{plan.depth.overall}</strong> · {plan.depth.sufficient ? "Sufficient" : "Still incomplete"} · Broad retrieval benchmark: {plan.depth.benchmark?.broadReady ? "ready" : "incomplete"}</p>{plan.policyNote && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{plan.policyNote}</p>}<p className="mt-2 text-sm">Current corpus: {plan.coverage.sources} URLs, {plan.coverage.independentWorks} independent works, {plan.coverage.chunks} chunks, {plan.coverage.approvedClaims} approved claims.</p><h3 className="mt-5 font-semibold">Weakest coverage</h3><ul className="mt-2 list-inside list-disc text-sm">{plan.depth.weakAreas.map((gap) => <li key={gap.name}>{gap.name}: {gap.state} · {gap.reasons.join("; ")}</li>)}</ul><h3 className="mt-5 font-semibold">First proposed queries</h3><ol className="mt-2 list-inside list-decimal text-sm">{plan.queries.slice(0, 5).map((item, index) => <li key={index}>{item.query}</li>)}</ol><button disabled={!plan.configured || busy || Boolean(run && run.status === "running")} onClick={start} className="mt-6 rounded-lg bg-emerald-800 px-4 py-2 text-white disabled:opacity-50">Start {mode === "auto" ? "Auto" : "Guided"} Expansion</button></section>}
    {run && <section className="mt-6 rounded-2xl border bg-white p-6">
      <h2 className="text-2xl font-semibold">Research run · {run.status}</h2>
      <p className="mt-2 text-sm">Mode {run.mode} · Stop reason {run.stop_reason || "none"} · Depth {run.depth_report?.overall || "pending"} · Brave calls {run.search_calls}/{run.max_search_requests} · Cached searches {run.cache_hits}</p>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">{[["Candidate URLs", run.candidate_urls], ["Verified sources", run.verified_sources], ["Independent works", run.independent_works], ["Primary passages", run.primary_passages], ["Scholarly sources", run.scholarly_sources], ["Bibliographic only", run.bibliographic_sources], ["Rejected", run.rejected_urls], ["Original pages fetched", run.pages_fetched], ["New chunks", run.chunks_added], ["Exact claim links", run.exact_claim_links], ["Duplicate URLs", run.duplicate_urls], ["Verified families", families.length]].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><strong>{value}</strong> {label}</div>)}</div>
      {run.error_category && <p className="mt-3 text-sm text-amber-800">Provider: {run.error_category}</p>}
      <h3 className="mt-6 font-semibold">Research rounds</h3>
      <ul className="mt-2 space-y-2 text-sm">{(run.round_reports || []).map((round) => <li key={round.round} className="rounded border p-3">Round {round.round}: {round.searches} searches · {round.candidates} candidates · {round.credible} credible · {round.pagesFetched} ingested · {round.chunksAdded} chunks · {round.primaryPassages || 0} primary passages · {round.scholarlySources || 0} scholarly sources · depth {round.depth}. Gaps: {round.weakAreas.join(", ")}</li>)}</ul>
      <h3 className="mt-6 font-semibold">Current depth</h3><ul className="mt-2 list-inside list-disc text-sm">{run.depth_report?.weakAreas?.map((area) => <li key={area.name}>{area.name}: {area.state} · {area.reasons.join("; ")}</li>)}</ul>
      {run.depth_report?.benchmark && <details className="mt-4"><summary className="cursor-pointer font-semibold">Deterministic retrieval benchmark · {run.depth_report.benchmark.broadReady ? "ready" : "incomplete"}</summary><ul className="mt-2 space-y-1 text-sm">{run.depth_report.benchmark.questions.map((item) => <li key={item.question}>{item.question}: {item.chunks} passages, {item.independentWorks} works, {item.exactLocations} exact locations, {item.textualLayers} layers</li>)}</ul></details>}
      <div className="mt-5 flex gap-3">{run.status === "running" && <button onClick={async () => { if (busy) stopRequested.current = true; else setRun(await action({ action: "stop", runId: run.id })); }} className="rounded-lg border px-4 py-2">Stop</button>}{run.status === "running" && !busy && <button onClick={() => runSteps(run)} className="rounded-lg bg-zinc-900 px-4 py-2 text-white">Continue</button>}{run.status === "stopped" && run.stop_reason !== "provider_error" && <button disabled={busy} onClick={resume} className="rounded-lg bg-zinc-900 px-4 py-2 text-white disabled:opacity-50">Next batch</button>}</div>
      {families.length > 0 && <details className="mt-6"><summary className="cursor-pointer font-semibold">Verified source families ({families.length})</summary><ul className="mt-2 text-sm">{families.map((family) => <li key={`${family.domain}${family.path_prefix}`}>{family.institution}: {family.domain}{family.path_prefix}</li>)}</ul></details>}
      <h3 className="mt-6 font-semibold">Source review</h3><p className="text-xs text-zinc-600">Discovery candidates are never evidence. Only verified, admitted original pages can be cited.</p>
      <div className="mt-2 space-y-2">{candidates.map((item, index) => <details key={`${item.canonical_url}-${index}`} className="rounded border p-3 text-sm"><summary className="cursor-pointer break-all font-medium">{item.verification_status} · {item.title || item.canonical_url}</summary><p className="mt-2 break-all">{item.canonical_url}</p><p>Institution: {item.institution || "unverified"} · Author/editor: {item.author || item.editor || "unknown"} · Work: {item.work_title || "unverified"}</p><p>Type: {item.source_type || "unknown"} · Full text: {item.full_text_status || "unknown"} · Independent work: {item.independent_work_key || "unverified"}</p><p>Relevant search gaps: {item.relevant_parameters?.join(", ") || "broad discovery"}</p><p>Access: {item.access_notes || "no license statement"} · Source family: {item.source_family || "none"}</p><p>Decision: {item.verification_reason}</p><ul className="mt-2 list-inside list-disc text-green-800">{item.credibility_signals?.map((signal) => <li key={signal}>{signal}</li>)}</ul><ul className="list-inside list-disc text-red-800">{item.credibility_failures?.map((failure) => <li key={failure}>{failure}</li>)}</ul></details>)}</div>
    </section>}
  </div></main>;
}
