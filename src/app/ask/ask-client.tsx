"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJsonWithTimeout } from "@/lib/client/fetch-json";
import {
  answerBlocks,
  followUpQuestions,
  groupCitations,
  sourceTypeLabel,
  suggestedQuestions,
  type AskCitation,
  type InlineAnswerPart,
} from "@/lib/ask/presentation";
import { SYNTHESIS_FALLBACK_NOTICE } from "@/lib/ask/messages";

export type Personality = { id: string; canonical_name: string };

type AskResult = {
  personality: string;
  question: string;
  resolvedQuestion?: string;
  status?: "complete" | "abstained" | "extractive_fallback";
  answer: string;
  retrievedParameters?: Array<{ code: string; name: string }>;
  citations?: AskCitation[];
  conflicts?: Array<{ type: string; message: string; layers?: string[] }>;
  debug?: Record<string, unknown>;
};

type ConversationTurn = { question: string; result: AskResult };
type AskClientProps = { personalities: Personality[]; loadError: string };
type CitationRequest = { id: string; nonce: number } | null;

function ChevronDown({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}><path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArrowUp() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5"><path d="M10 15V5m0 0L6.5 8.5M10 5l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function renderInline(parts: InlineAnswerPart[], revealCitation: (id: string) => void) {
  return parts.map((part, index) => part.type === "citation" ? (
    <button
      key={`${part.citationId}-${index}`}
      type="button"
      onClick={() => revealCitation(part.citationId)}
      className="mx-0.5 inline-flex translate-y-[-1px] rounded px-1 py-0.5 text-[0.72em] font-bold text-teal-800 underline decoration-teal-300 underline-offset-2 transition hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      aria-label={`View source ${part.citationId}`}
    >
      {part.value}
    </button>
  ) : <span key={`text-${index}`}>{part.value.replaceAll("**", "")}</span>);
}

function AnswerContent({ answer, revealCitation }: { answer: string; revealCitation: (id: string) => void }) {
  return (
    <div className="answer-content">
      {answerBlocks(answer).map((block, index) => {
        if (block.type === "heading") return <h3 key={index}>{renderInline(block.parts, revealCitation)}</h3>;
        if (block.type === "list") return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, revealCitation)}</li>)}</ul>;
        return <p key={index}>{renderInline(block.parts, revealCitation)}</p>;
      })}
    </div>
  );
}

function SourcePanel({ citations, revealRequest }: { citations: AskCitation[]; revealRequest: CitationRequest }) {
  const groups = useMemo(() => groupCitations(citations), [citations]);
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set());
  const groupByCitation = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((group, groupIndex) => group.citations.forEach((citation) => map.set(citation.id, groupIndex)));
    return map;
  }, [groups]);
  const requestedGroup = revealRequest ? groupByCitation.get(revealRequest.id) : undefined;

  useEffect(() => {
    if (!revealRequest) return;
    const groupIndex = groupByCitation.get(revealRequest.id);
    if (groupIndex === undefined) return;
    window.setTimeout(() => document.getElementById(`source-${revealRequest.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }, [groupByCitation, revealRequest]);

  return (
    <section className="mt-10 border-t border-stone-200 pt-7" aria-labelledby="sources-heading">
      <div className="flex items-end justify-between gap-4">
        <div><p className="eyebrow">Evidence trail</p><h3 id="sources-heading" className="mt-1 font-serif text-2xl font-semibold text-slate-950">Sources</h3></div>
        <p className="text-sm text-stone-500">{citations.length} citation{citations.length === 1 ? "" : "s"} · {groups.length} source{groups.length === 1 ? "" : "s"}</p>
      </div>
      <div className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
        {groups.map((group, groupIndex) => {
          const first = group.citations[0];
          return (
            <details
              key={group.key}
              open={openGroups.has(groupIndex) || requestedGroup === groupIndex}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setOpenGroups((current) => {
                  const next = new Set(current);
                  if (open) next.add(groupIndex); else next.delete(groupIndex);
                  return next;
                });
              }}
              className="group/source py-1"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-5 rounded-lg px-2 py-4 transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="mb-2 flex flex-wrap items-center gap-2">
                    {group.citations.map((citation) => <span key={citation.id} id={`source-${citation.id}`} className="rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[0.68rem] font-semibold text-teal-800">{citation.id}</span>)}
                    <span className="source-label">{sourceTypeLabel(first)}</span>
                  </span>
                  <span className="block font-medium leading-6 text-slate-900">{group.title}</span>
                  {(group.author || group.institution) && <span className="mt-1 block text-sm text-stone-500">{[group.author, group.institution].filter(Boolean).join(" · ")}</span>}
                </span>
                <ChevronDown className="mt-2 h-5 w-5 shrink-0 text-stone-400 transition group-open/source:rotate-180" />
              </summary>
              <div className="pb-5 pl-2 pr-10">
                {group.citations.map((citation) => (
                  <div key={citation.id} className="mt-3 border-l-2 border-teal-200 pl-4 first:mt-0">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                      {citation.textualLayer && <span>Layer: {citation.textualLayer}</span>}
                      {citation.pageOrSection && <span>Location: {citation.pageOrSection}</span>}
                      {citation.personalityName && <span>Subject: {citation.personalityName}</span>}
                    </div>
                    <blockquote className="mt-2 text-sm leading-6 text-stone-700">“{citation.excerpt}”</blockquote>
                  </div>
                ))}
                {group.url && <a href={group.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4 hover:text-teal-950">Open source <span aria-hidden="true">↗</span></a>}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

export default function AskClient({ personalities, loadError }: AskClientProps) {
  const [personalityIds, setPersonalityIds] = useState<string[]>(personalities[0]?.id ? [personalities[0].id] : []);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [personalitySearch, setPersonalitySearch] = useState("");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [citationRequest, setCitationRequest] = useState<CitationRequest>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(loadError);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const result = turns.at(-1)?.result || null;
  const selectedPeople = personalities.filter((personality) => personalityIds.includes(personality.id));
  const selectedName = selectedPeople.map((personality) => personality.canonical_name).join(" and ") || "a personality";
  const filteredPersonalities = personalities.filter((personality) => personality.canonical_name.toLocaleLowerCase().includes(personalitySearch.toLocaleLowerCase()));

  function chooseQuestion(value: string) {
    setQuestion(value);
    window.setTimeout(() => questionRef.current?.focus(), 0);
  }

  function selectSingle(id: string) {
    setPersonalityIds(id ? [id] : []);
    setTurns([]);
    setCitationRequest(null);
    setError("");
  }

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const submittedQuestion = question.trim();
    if (!submittedQuestion) return;
    setLoading(true);
    setError("");

    try {
      const history = turns.slice(-4).map((turn) => ({ question: turn.question, resolvedQuestion: turn.result.resolvedQuestion }));
      const { response, payload } = await fetchJsonWithTimeout<AskResult & { error?: string | { message?: string } }>("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalityIds, question: submittedQuestion, history }),
      }, 120_000);
      if (!response.ok) {
        const apiError = payload.error;
        throw new Error(typeof apiError === "string" ? apiError : apiError?.message || "The research request could not be completed.");
      }
      setTurns((current) => [...current, { question: submittedQuestion, result: payload }].slice(-5));
      setQuestion("");
      setCitationRequest(null);
    } catch (err) {
      setError(err instanceof DOMException && err.name === "AbortError" ? "The research request took too long. Please try again." : "We couldn’t complete that research request. Please try again in a moment.");
      if (process.env.NODE_ENV !== "production") console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-slate-900">
      <header className="border-b border-stone-200/90 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/ask" className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700" aria-label="DCF Research AI home">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-950 font-serif text-sm font-bold tracking-wide text-white">DCF</span>
            <span className="hidden font-serif text-lg font-semibold tracking-tight text-slate-950 sm:inline">Research AI</span>
          </Link>
          <nav aria-label="Primary navigation" className="flex items-center gap-2 text-sm">
            <Link href="/ask" aria-current="page" className="rounded-full bg-slate-950 px-4 py-2 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Ask</Link>
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-2 font-medium text-stone-600 hover:bg-white hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden"><span className="sm:hidden">Tools</span><span className="hidden sm:inline">Research tools</span> <ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
              <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl shadow-stone-900/10">
                <Link href="/research" className="block rounded-lg px-3 py-2 hover:bg-stone-50">Research</Link>
                <Link href="/review" className="block rounded-lg px-3 py-2 hover:bg-stone-50">Review</Link>
                <Link href="/corpus" className="block rounded-lg px-3 py-2 hover:bg-stone-50">Corpus</Link>
              </div>
            </details>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        <section aria-labelledby="ask-heading" className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Grounded in approved sources</p>
          <h1 id="ask-heading" className="mt-3 font-serif text-4xl font-semibold tracking-[-0.025em] text-slate-950 sm:text-5xl">Explore lives, texts, and traditions</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">Ask natural-language questions and trace every answer back to the evidence.</p>
        </section>

        <section className="mx-auto mt-9 max-w-3xl" aria-label="Research question">
          <form onSubmit={ask} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.45)] sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label htmlFor="personality" className="text-sm font-semibold text-slate-800">Ask about</label>
              {personalities.length > 1 && <button type="button" className="self-start rounded-md px-2 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:self-auto" onClick={() => { setComparisonMode((current) => !current); setPersonalityIds((current) => current.slice(0, 1)); setTurns([]); }}>{comparisonMode ? "Ask about one" : "Compare personalities"}</button>}
            </div>

            {!comparisonMode ? (
              <div className="relative mt-2">
                <select id="personality" value={personalityIds[0] || ""} onChange={(event) => selectSingle(event.target.value)} className="w-full appearance-none rounded-xl border border-stone-300 bg-[#fbfaf7] px-4 py-3 pr-11 text-base font-medium text-slate-900 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10" disabled={personalities.length === 0}>
                  {personalities.length === 0 && <option value="">No personalities available</option>}
                  {personalities.map((personality) => <option key={personality.id} value={personality.id}>{personality.canonical_name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-500" />
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-stone-200 bg-[#fbfaf7] p-3">
                {personalities.length > 1 && <label className="block"><span className="sr-only">Search personalities</span><input className="input" value={personalitySearch} onChange={(event) => setPersonalitySearch(event.target.value)} placeholder="Search personalities" /></label>}
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {filteredPersonalities.map((personality) => (
                    <label key={personality.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white">
                      <input type="checkbox" className="h-4 w-4 accent-teal-800" checked={personalityIds.includes(personality.id)} disabled={!personalityIds.includes(personality.id) && personalityIds.length >= 3} onChange={() => { setPersonalityIds((current) => current.includes(personality.id) ? current.filter((id) => id !== personality.id) : [...current, personality.id]); setTurns([]); }} />
                      {personality.canonical_name}
                    </label>
                  ))}
                </div>
                <p className="mt-2 px-2 text-xs text-stone-500">Select two or three personalities for an intentional comparison.</p>
              </div>
            )}

            <div className="mt-5 border-t border-stone-200 pt-5">
              <label htmlFor="question" className="block font-serif text-xl font-semibold text-slate-950">Ask a question about {selectedName}</label>
              <div className="relative mt-3 rounded-xl border border-stone-300 bg-white transition focus-within:border-teal-700 focus-within:ring-4 focus-within:ring-teal-700/10">
                <textarea ref={questionRef} id="question" required rows={3} value={question} disabled={loading} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit(); }} placeholder={`What would you like to understand about ${selectedName}?`} className="block w-full resize-none rounded-xl bg-transparent px-4 pb-14 pt-4 text-base leading-7 text-slate-900 outline-none placeholder:text-stone-400 disabled:cursor-wait disabled:bg-stone-50" aria-describedby="question-help" />
                <div className="absolute bottom-3 left-4 right-3 flex items-center justify-between gap-3">
                  <span id="question-help" className="hidden text-xs text-stone-400 sm:inline">⌘ Enter to ask</span>
                  <button disabled={loading || personalityIds.length === 0 || !question.trim()} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Researching…" : "Ask"} {!loading && <ArrowUp />}</button>
                </div>
              </div>
            </div>
          </form>

          {loading && <div role="status" aria-live="polite" className="mt-5 flex items-center justify-center gap-3 rounded-xl border border-stone-200 bg-white/70 px-4 py-4 text-sm font-medium text-stone-600"><span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-teal-800 motion-reduce:animate-none" />Searching approved sources…</div>}
          {error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>}
        </section>

        {!result && !loading && personalities.length > 0 && (
          <section className="mx-auto mt-9 max-w-3xl" aria-labelledby="suggested-heading">
            <h2 id="suggested-heading" className="text-sm font-semibold text-stone-500">Suggested questions</h2>
            <div className="mt-3 divide-y divide-stone-200 border-y border-stone-200">
              {suggestedQuestions(selectedName).map((suggestion) => <button key={suggestion} type="button" onClick={() => chooseQuestion(suggestion)} className="group flex w-full items-center justify-between gap-4 px-1 py-3.5 text-left text-sm text-stone-700 transition hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:text-base">{suggestion}<span aria-hidden="true" className="text-stone-400 transition group-hover:translate-x-1 group-hover:text-teal-700">→</span></button>)}
            </div>
          </section>
        )}

        {result && (
          <article className="mx-auto mt-12 max-w-3xl border-t border-stone-300 pt-9" aria-labelledby="answer-heading">
            {turns.length > 1 && <details className="mb-7 text-sm text-stone-500"><summary className="cursor-pointer font-medium hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Earlier in this conversation ({turns.length - 1})</summary><ol className="mt-3 space-y-2 border-l border-stone-300 pl-4">{turns.slice(0, -1).map((turn, index) => <li key={`${turn.question}-${index}`}>{turn.question}</li>)}</ol></details>}
            <div className="flex flex-wrap items-center gap-2"><span className="source-label bg-slate-900! text-white!">{result.personality}</span>{result.status === "extractive_fallback" && <span className="source-label">Verified evidence view</span>}</div>
            <p className="eyebrow mt-7">Question</p>
            <h2 id="answer-heading" className="mt-2 font-serif text-2xl font-semibold leading-9 text-slate-950 sm:text-3xl">{result.question}</h2>
            <p className="eyebrow mt-8">Answer</p>
            {result.status === "extractive_fallback" && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{SYNTHESIS_FALLBACK_NOTICE}</p>}
            <AnswerContent answer={result.answer} revealCitation={(id) => setCitationRequest({ id, nonce: Date.now() })} />
            {result.conflicts && result.conflicts.length > 0 && <aside className="mt-7 border-l-2 border-amber-400 pl-4 text-sm leading-6 text-stone-600"><span className="font-semibold text-slate-900">Evidence note. </span>{result.conflicts.map((conflict) => conflict.message).join(" ")}</aside>}
            {result.citations && result.citations.length > 0 && <SourcePanel citations={result.citations} revealRequest={citationRequest} />}

            <section className="mt-10 border-t border-stone-200 pt-7" aria-labelledby="follow-up-heading">
              <h3 id="follow-up-heading" className="font-serif text-xl font-semibold text-slate-950">Explore further</h3>
              <div className="mt-3 flex flex-col items-start gap-2">{followUpQuestions(result.personality).map((suggestion) => <button key={suggestion} type="button" onClick={() => chooseQuestion(suggestion)} className="rounded-lg px-2 py-1.5 text-left text-sm text-teal-800 transition hover:bg-teal-50 hover:text-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">{suggestion} <span aria-hidden="true">→</span></button>)}</div>
            </section>

            {result.debug && <details className="mt-10 border-t border-stone-200 pt-5"><summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Developer details</summary><pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-200">{JSON.stringify(result.debug, null, 2)}</pre></details>}
          </article>
        )}
      </div>
    </main>
  );
}
