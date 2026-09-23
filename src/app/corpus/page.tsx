"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Source = {
  id: string;
  title: string;
  author: string | null;
  source_type: string;
  source_status: string;
  url: string | null;
  ingestion_status: string;
  ingested_at: string | null;
  last_ingestion_error: string | null;
  textual_layer: string | null;
  chunks: number;
  embedded: number;
  personalities: number;
  parameters: number;
  pendingCandidates: number;
};

type Personality = { id: string; canonical_name: string };
type Chunk = {
  id: string;
  chunk_index: number;
  chunk_text: string;
  section_title: string | null;
  page_or_section: string | null;
  textual_layer: string | null;
  token_estimate: number;
  embedding_status: string;
};
type Candidate = {
  id: string;
  claim_text: string;
  claim_kind: string;
  certainty: string;
  extraction_confidence: number | null;
  extraction_note: string | null;
  parameter_fields: { label?: string; code?: string } | Array<{ label?: string; code?: string }> | null;
  source_chunks: { page_or_section?: string | null; textual_layer?: string | null; sources?: { title?: string } | Array<{ title?: string }> } | Array<{ page_or_section?: string | null; textual_layer?: string | null; sources?: { title?: string } | Array<{ title?: string }> }> | null;
};

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  }
  return fallback;
}

export default function CorpusPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [personalityId, setPersonalityId] = useState("");
  const [mode, setMode] = useState<"text" | "url" | "pdf">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [textualLayer, setTextualLayer] = useState("");
  const [language, setLanguage] = useState("English");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [question, setQuestion] = useState("");
  const [searchResult, setSearchResult] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [reviewer, setReviewer] = useState("Corpus reviewer");
  const [duplicateIds, setDuplicateIds] = useState<Record<string, string>>({});
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");

  const selectedSource = useMemo(() => sources.find((source) => source.id === sourceId), [sources, sourceId]);

  const loadDashboard = useCallback(async () => {
    const [sourceResponse, optionResponse, candidateResponse] = await Promise.all([
      fetch("/api/corpus/sources", { cache: "no-store" }),
      fetch("/api/research/options", { cache: "no-store" }),
      fetch("/api/corpus/candidates?status=pending", { cache: "no-store" }),
    ]);
    const [sourcePayload, optionPayload, candidatePayload] = await Promise.all([
      sourceResponse.json(), optionResponse.json(), candidateResponse.json(),
    ]);
    if (!sourceResponse.ok) throw new Error(errorMessage(sourcePayload, "Sources could not be loaded."));
    if (!optionResponse.ok) throw new Error(errorMessage(optionPayload, "Options could not be loaded."));
    setSources(sourcePayload.sources || []);
    setPersonalities(optionPayload.personalities || []);
    if (candidateResponse.ok) setCandidates(candidatePayload.candidates || []);
    const nextSource = sourceId || sourcePayload.sources?.[0]?.id || "";
    const nextPersonality = personalityId || optionPayload.personalities?.find((personality: Personality) => personality.canonical_name === "Vishvamitra")?.id || optionPayload.personalities?.[0]?.id || "";
    setSourceId(nextSource);
    setPersonalityId(nextPersonality);
  }, [personalityId, sourceId]);

  useEffect(() => {
    loadDashboard().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Corpus dashboard failed to load."));
  }, [loadDashboard]);

  async function run(label: string, operation: () => Promise<void>) {
    setBusy(label);
    setMessage("");
    try {
      await operation();
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setBusy("");
    }
  }

  async function ingest() {
    await run("ingest", async () => {
      let response: Response;
      if (mode === "pdf") {
        if (!file) throw new Error("Choose a PDF first.");
        const form = new FormData();
        form.set("sourceId", sourceId);
        form.set("personalityIds", personalityId);
        form.set("textualLayer", textualLayer);
        form.set("language", language);
        form.set("file", file);
        response = await fetch("/api/corpus/ingest", { method: "POST", body: form });
      } else {
        response = await fetch("/api/corpus/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId, personalityIds: [personalityId], mode, text: mode === "text" ? text : undefined, url: mode === "url" ? url || undefined : undefined, textualLayer: textualLayer || null, language: language || null }),
        });
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Ingestion failed."));
      setMessage(`Ingested ${payload.chunksActive} active chunks.`);
    });
  }

  async function createSource() {
    await run("create source", async () => {
      const response = await fetch("/api/corpus/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newSourceTitle, url: newSourceUrl || null, sourceType: "other" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Source creation failed."));
      setSourceId(payload.source.id);
      setNewSourceTitle("");
      setNewSourceUrl("");
      setMessage(payload.reused ? "An existing source with that URL was selected." : "Candidate source created.");
    });
  }

  async function sourceAction(action: "tag" | "embed" | "extract") {
    await run(action, async () => {
      const response = await fetch("/api/corpus/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sourceId, personalityId, limit: 10 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, `${action} failed.`));
      setMessage(`${action} completed: ${JSON.stringify(payload)}`);
    });
  }

  async function viewChunks(id = sourceId) {
    await run("chunks", async () => {
      const response = await fetch(`/api/corpus/chunks?sourceId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Chunks could not be loaded."));
      setSourceId(id);
      setChunks(payload.chunks || []);
    });
  }

  async function updateSourceStatus(id: string, status: "candidate" | "approved" | "rejected") {
    await run("source review", async () => {
      const response = await fetch("/api/corpus/sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: id, status }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Source review failed."));
      setMessage(`Source marked ${status}.`);
    });
  }

  async function reviewCandidate(candidateId: string, decision: "accepted" | "rejected" | "duplicate" | "needs_review") {
    await run("candidate review", async () => {
      const response = await fetch("/api/corpus/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, decision, reviewer, duplicateOfClaimId: duplicateIds[candidateId] || null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Candidate review failed."));
      setMessage(decision === "accepted" ? `Candidate accepted as claim ${payload.claimId}; it remains needs_review.` : `Candidate marked ${decision}.`);
    });
  }

  async function search() {
    await run("search", async () => {
      const response = await fetch("/api/corpus/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personalityId, question }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Corpus search failed."));
      setSearchResult(payload);
    });
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-7xl px-5 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Internal research administration</p><h1 className="mt-2 text-4xl font-bold">Source Corpus</h1><p className="mt-2 text-zinc-600">Ingest, tag, embed, search, and review evidence without exposing server credentials.</p></div>
          <nav className="flex flex-wrap gap-2"><Link className="rounded-lg border bg-white px-3 py-2 text-sm" href="/">Research</Link><Link className="rounded-lg border bg-white px-3 py-2 text-sm" href="/review">Claims</Link><Link className="rounded-lg border bg-white px-3 py-2 text-sm" href="/ask">Ask</Link><Link className="rounded-lg border bg-white px-3 py-2 text-sm" href="/corpus/sources">Internet permissions</Link></nav>
        </div>

        {message && <div className="mb-6 rounded-xl border border-zinc-300 bg-white p-4 text-sm">{message}</div>}

        <section className="mb-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Ingest source</h2>
          <div className="mt-4 grid gap-3 rounded-xl bg-zinc-50 p-4 md:grid-cols-[1fr_1fr_auto]">
            <input className="input" value={newSourceTitle} onChange={(event) => setNewSourceTitle(event.target.value)} placeholder="New source title" />
            <input className="input" value={newSourceUrl} onChange={(event) => setNewSourceUrl(event.target.value)} placeholder="Optional source URL" />
            <button type="button" disabled={Boolean(busy) || newSourceTitle.trim().length < 2} onClick={createSource} className="rounded-lg border bg-white px-4 py-2 text-sm disabled:opacity-50">Create source</button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">Source<select className="input mt-2" value={sourceId} onChange={(event) => { setSourceId(event.target.value); const source = sources.find((item) => item.id === event.target.value); setUrl(source?.url || ""); setTextualLayer(source?.textual_layer || ""); }}>{sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
            <label className="text-sm font-medium">Personality<select className="input mt-2" value={personalityId} onChange={(event) => setPersonalityId(event.target.value)}>{personalities.map((personality) => <option key={personality.id} value={personality.id}>{personality.canonical_name}</option>)}</select></label>
            <label className="text-sm font-medium">Textual layer<input className="input mt-2" value={textualLayer} onChange={(event) => setTextualLayer(event.target.value)} placeholder="e.g. Rigveda or Ramayana — Bala Kanda" /></label>
            <label className="text-sm font-medium">Language<input className="input mt-2" value={language} onChange={(event) => setLanguage(event.target.value)} /></label>
          </div>
          <div className="mt-4 flex gap-2">{(["text", "url", "pdf"] as const).map((item) => <button key={item} type="button" onClick={() => setMode(item)} className={mode === item ? "rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white" : "rounded-lg bg-zinc-100 px-4 py-2 text-sm"}>{item === "text" ? "Pasted text" : item.toUpperCase()}</button>)}</div>
          {mode === "text" && <textarea className="input mt-4 min-h-48" value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste source text with headings and paragraph breaks…" />}
          {mode === "url" && <input className="input mt-4" value={url} onChange={(event) => setUrl(event.target.value)} placeholder={selectedSource?.url || "https://…"} />}
          {mode === "pdf" && <input className="mt-4 block text-sm" type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />}
          <div className="mt-5 flex flex-wrap gap-2"><button disabled={Boolean(busy) || !sourceId || !personalityId} onClick={ingest} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "ingest" ? "Ingesting…" : "Ingest / Re-ingest"}</button><button disabled={Boolean(busy) || !sourceId} onClick={() => viewChunks()} className="rounded-lg border px-4 py-2 text-sm">View chunks</button><button disabled={Boolean(busy) || !sourceId} onClick={() => sourceAction("tag")} className="rounded-lg border px-4 py-2 text-sm">Run tagging</button><button disabled={Boolean(busy) || !sourceId} onClick={() => sourceAction("embed")} className="rounded-lg border px-4 py-2 text-sm">Generate embeddings</button><button disabled={Boolean(busy) || !sourceId || !personalityId} onClick={() => sourceAction("extract")} className="rounded-lg border px-4 py-2 text-sm">Extract proposals</button></div>
        </section>

        <section className="mb-8 overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-xl font-semibold">Sources</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-zinc-50 text-zinc-500"><tr><th className="p-3">Source</th><th className="p-3">Review</th><th className="p-3">Ingestion</th><th className="p-3">Chunks / vectors</th><th className="p-3">Tags / candidates</th><th className="p-3">Actions</th></tr></thead><tbody>{sources.map((source) => <tr key={source.id} className="border-t align-top"><td className="p-3"><button className="text-left font-medium hover:underline" onClick={() => { setSourceId(source.id); setUrl(source.url || ""); }}>{source.title}</button><p className="mt-1 text-xs text-zinc-500">{source.source_type}</p>{source.last_ingestion_error && <p className="mt-1 max-w-sm text-xs text-red-700">{source.last_ingestion_error}</p>}</td><td className="p-3">{source.source_status}</td><td className="p-3">{source.ingestion_status}</td><td className="p-3">{source.chunks} / {source.embedded}</td><td className="p-3">{source.personalities} people · {source.parameters} fields · {source.pendingCandidates} pending</td><td className="p-3"><div className="flex flex-wrap gap-1"><button onClick={() => viewChunks(source.id)} className="rounded border px-2 py-1">Chunks</button><button onClick={() => updateSourceStatus(source.id, "approved")} className="rounded border px-2 py-1">Approve</button><button onClick={() => updateSourceStatus(source.id, "rejected")} className="rounded border px-2 py-1">Reject</button></div></td></tr>)}</tbody></table></div></section>

        {chunks.length > 0 && <section className="mb-8 rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Active chunks ({chunks.length})</h2><div className="mt-4 space-y-3">{chunks.map((chunk) => <details key={chunk.id} className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">#{chunk.chunk_index} · {chunk.page_or_section || chunk.section_title || "No section"} · {chunk.token_estimate} tokens · {chunk.embedding_status}</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{chunk.chunk_text}</p><p className="mt-2 text-xs text-zinc-500">Chunk ID: {chunk.id}</p></details>)}</div></section>}

        <section className="mb-8 rounded-2xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Pending candidate claims ({candidates.length})</h2><p className="mt-1 text-sm text-zinc-500">Accepting creates a normal claim with needs_review status; it does not approve it.</p></div><label className="text-sm">Reviewer<input className="input mt-1" value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></label></div><div className="mt-5 space-y-4">{candidates.map((candidate) => { const field = Array.isArray(candidate.parameter_fields) ? candidate.parameter_fields[0] : candidate.parameter_fields; const chunk = Array.isArray(candidate.source_chunks) ? candidate.source_chunks[0] : candidate.source_chunks; const source = Array.isArray(chunk?.sources) ? chunk.sources[0] : chunk?.sources; return <article key={candidate.id} className="rounded-xl border p-4"><p className="font-medium leading-7">{candidate.claim_text}</p><p className="mt-2 text-xs text-zinc-500">{candidate.claim_kind} · {candidate.certainty} · confidence {candidate.extraction_confidence ?? "unknown"} · {field?.label || field?.code} · {source?.title || "Unknown source"} · {chunk?.page_or_section || "No location"}</p>{candidate.extraction_note && <p className="mt-2 text-sm text-zinc-600">{candidate.extraction_note}</p>}<div className="mt-3 flex flex-wrap gap-2"><button className="rounded bg-zinc-900 px-3 py-2 text-xs text-white" onClick={() => reviewCandidate(candidate.id, "accepted")}>Accept to review queue</button><button className="rounded border px-3 py-2 text-xs" onClick={() => reviewCandidate(candidate.id, "needs_review")}>Needs more review</button><button className="rounded border px-3 py-2 text-xs" onClick={() => reviewCandidate(candidate.id, "rejected")}>Reject</button><input className="rounded border px-2 py-1 text-xs" value={duplicateIds[candidate.id] || ""} onChange={(event) => setDuplicateIds((old) => ({ ...old, [candidate.id]: event.target.value }))} placeholder="Existing claim UUID" /><button className="rounded border px-3 py-2 text-xs" onClick={() => reviewCandidate(candidate.id, "duplicate")}>Mark duplicate</button></div></article>; })}{candidates.length === 0 && <p className="text-sm text-zinc-500">No pending candidates.</p>}</div></section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Retrieval debug</h2><div className="mt-4 flex gap-2"><input className="input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Search the hybrid corpus…" /><button disabled={Boolean(busy) || !question.trim()} onClick={search} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">Search</button></div>{searchResult && <pre className="mt-4 max-h-[36rem] overflow-auto rounded-xl bg-zinc-950 p-4 text-xs text-zinc-100">{JSON.stringify(searchResult, null, 2)}</pre>}</section>
      </div>
    </main>
  );
}
