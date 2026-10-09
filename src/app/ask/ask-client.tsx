"use client";

import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { answerBlocks, groupCitations, type AskCitation, type InlineAnswerPart } from "@/lib/ask/presentation";
import { fetchJsonWithTimeout } from "@/lib/client/fetch-json";

export type Personality = { id: string; canonical_name: string };
type Result = { question: string; personality: string; answer: string; citations?: AskCitation[]; status?: string };
type Style = "simple" | "balanced" | "detailed" | "research";
const styles: Array<{ value: Style; label: string; description: string }> = [
  { value: "simple", label: "Simple", description: "Brief and plain" },
  { value: "balanced", label: "Balanced", description: "Answer with context" },
  { value: "detailed", label: "Detailed", description: "More explanation" },
  { value: "research", label: "Research", description: "Fuller evidence review" },
];

function Inline({ parts, show, available }: { parts: InlineAnswerPart[]; show: (id: string) => void; available: Set<string> }) {
  return parts.map((part, index) => part.type === "citation"
    ? available.has(part.citationId)
      ? <button className="citation-ref" type="button" key={index} onClick={() => show(part.citationId)} aria-label={`Inspect citation ${part.citationId}`}>{part.value}</button>
      : <span key={index}>{part.value}</span>
    : <span key={index}>{part.value.replaceAll("*", "")}</span>);
}

function Answer({ answer, show, citations }: { answer: string; show: (id: string) => void; citations: AskCitation[] }) {
  const available = new Set(citations.map(citation => citation.id));
  return <div className="research-answer">{answerBlocks(answer).map((block, index) => block.type === "heading"
    ? <h3 key={index}><Inline parts={block.parts} show={show} available={available}/></h3>
    : block.type === "list"
      ? <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Inline parts={item} show={show} available={available}/></li>)}</ul>
      : <p key={index}><Inline parts={block.parts} show={show} available={available}/></p>)}</div>;
}

export default function AskClient({ personalities, loadError }: { personalities: Personality[]; loadError: string }) {
  const [personId, setPersonId] = useState(personalities[0]?.id || "");
  const [style, setStyle] = useState<Style>("balanced");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(loadError ? "People could not be loaded. Refresh the page to try again." : "");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const submitting = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const result = turns.at(-1);
  const sources = groupCitations(result?.citations || []);
  const librarySources = sources.filter(group => group.citations[0]?.kind !== "live_web_source");
  const liveSources = sources.filter(group => group.citations[0]?.kind === "live_web_source");
  const selectedCitation = result?.citations?.find(citation => citation.id === sourceId);
  const selectedSource = sources.find(group => group.citations.some(citation => citation.id === sourceId));
  const person = personalities.find(item => item.id === personId)?.canonical_name || "a person";
  const styleLabel = styles.find(item => item.value === style)?.label || "Balanced";

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!personId || !question.trim() || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError("");
    setSourceId(null);
    try {
      const { response, payload } = await fetchJsonWithTimeout<Result>("/api/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalityId: personId, question: question.trim(), responseStyle: style, history: turns.slice(-4).map(turn => ({ question: turn.question })) }),
      }, 120000);
      if (!response.ok) throw new Error("ask_failed");
      setTurns(current => [...current, payload].slice(-5));
      setQuestion("");
    } catch {
      setError("The answer could not be completed. Your question is still here; try again.");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return <main className="ai-page page-shell">
    <div className="page-kicker">AI</div>
    <div className="ai-layout"><div className="ai-main">
      <div className="ai-title"><p className="section-label">Ask DCF</p><h1>Start with a question.</h1><p>Choose a person, then ask what you want to know. Open citations to check the answer.</p></div>
      <form onSubmit={ask} className="ask-form">
        <label className="person-control">Person
          <Select value={personId} onValueChange={value => { setPersonId(value || ""); setTurns([]); setError(""); }} disabled={loading}>
            <SelectTrigger aria-label="Choose person"><SelectValue>{personId ? person : "Choose a person"}</SelectValue></SelectTrigger>
            <SelectContent>{personalities.map(item => <SelectItem key={item.id} value={item.id}>{item.canonical_name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className="question-label" htmlFor="question">Your question</label>
        <Textarea ref={input} id="question" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} placeholder={`What would you like to know about ${person}?`} className="question-input" disabled={loading} />
        <div className="ask-footer"><label className="depth-control">Answer depth
          <Select value={style} onValueChange={value => setStyle(value as Style)} disabled={loading}>
            <SelectTrigger aria-label="Answer depth"><SelectValue>{styleLabel}</SelectValue></SelectTrigger>
            <SelectContent>{styles.map(item => <SelectItem key={item.value} value={item.value}>{item.label}: {item.description}</SelectItem>)}</SelectContent>
          </Select>
        </label><Button type="submit" disabled={loading || !personId || !question.trim()}>{loading ? "Checking sources…" : "Ask"}<ArrowRight size={16} aria-hidden="true" /></Button></div>
        <p className="ask-keyboard-note">Press Enter to ask. Use Shift+Enter for a new line.</p>
      </form>
      {error && <p role="alert" className="form-error">{error}</p>}
      {loading && <div className="answer-skeleton" role="status" aria-label="Checking sources and preparing an answer"><p>Checking sources for {person}…</p><Skeleton className="h-5 w-2/3"/><Skeleton className="h-4 w-full"/><Skeleton className="h-4 w-11/12"/><Skeleton className="h-4 w-3/4"/></div>}
      {!result && !loading && <section className="suggestions"><p className="section-label">Example questions</p>{[`Who is ${person}?`, `What do the sources say about ${person}?`].map(value => <button type="button" key={value} onClick={() => { setQuestion(value); input.current?.focus(); }}>{value}<ArrowUpRight size={15} aria-hidden="true" /></button>)}</section>}
      {result && <article className="answer-article"><div className="answer-overline">Answer about {result.personality}</div><h2>{result.question}</h2><Answer answer={result.answer} show={setSourceId} citations={result.citations || []}/>
        <section className="sources-list">
          <div className="sources-heading"><h3>Sources</h3><span>{result.citations?.length || 0} citations</span></div>
          {sources.length ? ([ ["DCF Library", librarySources], ["Live research", liveSources] ] as const).map(([label, groups]) => groups.length ? (
            <div key={label} className="source-group">
              <p className="section-label">{label}</p>
              <div className="source-grid">{groups.map(group => (
                <button className="source-row" type="button" key={group.key} onClick={() => setSourceId(group.citations[0].id)} aria-label={`View citation ${group.citations[0].id}: ${group.title}`}>
                  <span className="source-ids">{group.citations[0].id}{group.citations.length > 1 ? ` +${group.citations.length - 1}` : ""}</span>
                  <strong title={group.title}>{group.title}</strong>
                  <span className="source-row-action">View citation <ArrowUpRight size={14} aria-hidden="true" /></span>
                </button>
              ))}</div>
            </div>
          ) : null) : <p className="empty-note">No cited source could answer this question. Try a more focused question.</p>}
        </section>
      </article>}
    </div></div>
    <Sheet open={!!sourceId && !!selectedCitation} onOpenChange={open => { if (!open) setSourceId(null); }}><SheetContent className="source-sheet"><SheetHeader><SheetTitle>Citation {selectedCitation?.id || ""}</SheetTitle><SheetDescription>{selectedSource?.title || "Source detail"}</SheetDescription></SheetHeader><div className="source-sheet-body">{selectedCitation && <><p className="section-label">{selectedCitation.kind === "live_web_source" ? "Live research" : "DCF Library"}</p><h3>{selectedCitation.title}</h3><p className="source-meta">{[selectedCitation.author, selectedCitation.institution, selectedCitation.sourceType].filter(Boolean).join(" · ") || "Source record"}</p><dl><div><dt>Source type</dt><dd>{selectedCitation.sourceType || selectedCitation.kind.replaceAll("_", " ")}</dd></div><div><dt>Location</dt><dd>{selectedCitation.pageOrSection || "Not specified"}</dd></div><div><dt>Evidence</dt><dd>{selectedCitation.evidenceType || selectedCitation.textualLayer || "Source material"}</dd></div></dl><p className="section-label">Supporting material</p><blockquote>{selectedCitation.excerpt || "No excerpt is available for this citation."}</blockquote>{selectedCitation.url && <a href={selectedCitation.url} target="_blank" rel="noreferrer" className="editorial-link">Open original source <ArrowUpRight size={16} aria-hidden="true" /></a>}</>}</div></SheetContent></Sheet>
  </main>;
}
