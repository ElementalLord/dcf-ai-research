"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MysticBackdrop } from "@/components/mystic-backdrop";
import { answerBlocks, type AskCitation, type InlineAnswerPart } from "@/lib/ask/presentation";
import { fetchJsonWithTimeout } from "@/lib/client/fetch-json";
import { readableEvidence } from "@/lib/corpus/readable-evidence";

export type Personality = { id: string; canonical_name: string };
type Result = { question: string; resolvedQuestion?: string; personality: string; answer: string; citations?: AskCitation[]; status?: string };
type Style = "simple" | "balanced" | "detailed" | "research";
const styles: Array<{ value: Style; label: string; description: string }> = [
  { value: "simple", label: "Simple", description: "Brief and plain" },
  { value: "balanced", label: "Balanced", description: "Answer with context" },
  { value: "detailed", label: "Detailed", description: "More explanation" },
  { value: "research", label: "Research", description: "Fuller evidence review" },
];
const citationLabels: Record<string, string> = {
  primary_text: "Original text",
  secondary_source: "Scholarly source",
  traditional_narrative: "Traditional account",
  live_web_source: "Website",
  textual_tradition: "Textual tradition",
  scholarly_interpretation: "Scholarly interpretation",
};
function citationLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  return citationLabels[value] || value.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
}

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
  const [conversations, setConversations] = useState<Record<string, Result[]>>({});
  const turns = conversations[personId] || [];
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(loadError ? "People could not be loaded. Refresh the page to try again." : "");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const submitting = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const result = turns.at(-1);
  const selectedCitation = sourceId ? turns[Number(sourceId.split(":")[0])]?.citations?.find(citation => citation.id === sourceId.split(":")[1]) : undefined;
  const selectedExcerpt = readableEvidence(selectedCitation?.excerpt);
  const person = personalities.find(item => item.id === personId)?.canonical_name || "a person";
  const styleLabel = styles.find(item => item.value === style)?.label || "Balanced";

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.sessionStorage.getItem("dcf-conversations-v1");
    } catch { /* A private browser session can deny storage. */ }
    queueMicrotask(() => {
      if (saved) {
        try { setConversations(JSON.parse(saved) as Record<string, Result[]>); }
        catch { /* Invalid saved history is ignored. */ }
      }
      setRestored(true);
    });
  }, []);
  useEffect(() => {
    if (!restored) return;
    try { window.sessionStorage.setItem("dcf-conversations-v1", JSON.stringify(conversations)); }
    catch { /* Conversation remains in this page session. */ }
  }, [conversations, restored]);

  useEffect(() => {
    if (!loading) return;
    const interval = window.setInterval(() => setElapsed(seconds => seconds + 1), 1000);
    return () => window.clearInterval(interval);
  }, [loading]);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!personId || !question.trim() || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setElapsed(0);
    setError("");
    setSourceId(null);
    try {
      const { response, payload } = await fetchJsonWithTimeout<Result>("/api/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalityId: personId, question: question.trim(), responseStyle: style, history: turns.slice(-4).map(turn => ({ question: turn.question.slice(0, 1000), resolvedQuestion: turn.resolvedQuestion?.slice(0, 2000), answer: turn.answer.replace(/\[[CS]\d+\]/g, "").slice(0, 800), citedConcepts: (turn.citations || []).slice(0, 4).map(citation => citation.title.slice(0, 120)).filter(title => title.trim().length >= 2) })) }),
      }, 120000);
      if (!response.ok) throw new Error("ask_failed");
      setConversations(current => ({ ...current, [personId]: [...(current[personId] || []), payload].slice(-5) }));
      setQuestion("");
    } catch {
      setError("The answer could not be completed. Your question is still here; try again.");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return <main className="ai-page page-shell">
    <MysticBackdrop />
    <div className="page-kicker">AI</div>
    <div className="ai-layout"><div className="ai-main">
      <div className="ai-title"><p className="section-label">Ask DCF</p><h1>Start with a question.</h1><p>Choose a person, then ask what you want to know. Open citations to check the answer.</p></div>
      <form onSubmit={ask} className="ask-form">
        <label className="person-control">Person
          <Select value={personId} onValueChange={value => { setPersonId(value || ""); setSourceId(null); setError(""); }} disabled={loading}>
            <SelectTrigger aria-label="Choose person"><SelectValue>{personId ? person : "Choose a person"}</SelectValue></SelectTrigger>
            <SelectContent className="ai-select-content">{personalities.map(item => <SelectItem key={item.id} value={item.id}>{item.canonical_name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className="question-label" htmlFor="question">Your question</label>
        <Textarea ref={input} id="question" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} placeholder={`What would you like to know about ${person}?`} className="question-input" disabled={loading} />
        <div className="ask-footer"><label className="depth-control">Answer depth
          <Select value={style} onValueChange={value => setStyle(value as Style)} disabled={loading}>
            <SelectTrigger aria-label="Answer depth"><SelectValue>{styleLabel}</SelectValue></SelectTrigger>
            <SelectContent className="ai-select-content">{styles.map(item => <SelectItem key={item.value} value={item.value}>{item.label}: {item.description}</SelectItem>)}</SelectContent>
          </Select>
        </label><Button type="submit" disabled={loading || !personId || !question.trim()}>{loading ? "Checking sources…" : "Ask"}<ArrowRight size={16} aria-hidden="true" /></Button></div>
        <p className="ask-keyboard-note">Press Enter to ask. Use Shift+Enter for a new line.</p>
      </form>
      {error && <p role="alert" className="form-error">{error}</p>}
      {loading && <div className="answer-skeleton" role="status" aria-live="polite" aria-label="Checking sources and preparing an answer"><p className="answer-progress"><LoaderCircle size={17} className="animate-spin"/>{elapsed >= 20 ? "Still checking sources and preparing your answer…" : `Checking sources for ${person}…`}<span aria-hidden="true">{elapsed}s</span></p><Skeleton className="h-5 w-2/3"/><Skeleton className="h-4 w-full"/><Skeleton className="h-4 w-11/12"/><Skeleton className="h-4 w-3/4"/></div>}
      {!result && !loading && <section className="suggestions"><p className="section-label">Example questions</p>{[`Who is ${person}?`, `What do the sources say about ${person}?`].map(value => <Button type="button" variant="ghost" key={value} onClick={() => { setQuestion(value); input.current?.focus(); }}>{value}<ArrowUpRight size={15} aria-hidden="true" /></Button>)}</section>}
      {turns.map((turn, turnIndex) => <article className="answer-article" key={`${personId}:${turnIndex}`}><div className="answer-overline">Answer about {turn.personality}</div><h2>{turn.question}</h2><Answer answer={turn.answer} show={id => setSourceId(`${turnIndex}:${id}`)} citations={turn.citations || []}/>
        <section className="sources-list">
          <div className="sources-heading"><h3>Sources</h3><span>{turn.citations?.length || 0} citations</span></div>
          {(turn.citations || []).length ? ([ ["DCF Library", (turn.citations || []).filter(citation => citation.kind !== "live_web_source")], ["Live research", (turn.citations || []).filter(citation => citation.kind === "live_web_source")] ] as const).map(([label, groups]) => groups.length ? (
            <div key={label} className="source-group">
              <p className="section-label">{label}</p>
              <div className="source-grid">{groups.map(citation => (
                <button className="source-row" type="button" key={citation.id} onClick={() => setSourceId(`${turnIndex}:${citation.id}`)} aria-label={`View citation ${citation.id}: ${citation.title}`}>
                  <span className="source-ids">{citation.id}</span>
                  <span className="source-row-copy"><strong title={citation.title}>{citation.title}</strong><small>{citation.pageOrSection || "Location not recorded"}</small><span>{readableEvidence(citation.excerpt)?.slice(0, 180) || "Readable passage unavailable; inspect the original source."}</span></span>
                  <span className="source-row-action">View evidence <ArrowUpRight size={14} aria-hidden="true" /></span>
                </button>
              ))}</div>
            </div>
          ) : null) : <p className="empty-note">No cited source could answer this question. Try a more focused question.</p>}
        </section>
      </article>)}
    </div></div>
    <Sheet open={!!sourceId && !!selectedCitation} onOpenChange={open => { if (!open) setSourceId(null); }}><SheetContent className="source-sheet"><SheetHeader><SheetTitle>Citation {selectedCitation?.id || ""}</SheetTitle><SheetDescription>{selectedCitation?.title || "Source detail"}</SheetDescription></SheetHeader><div className="source-sheet-body">{selectedCitation && <><p className="section-label">{selectedCitation.kind === "live_web_source" ? "Live research" : "DCF Library"}</p><p className="source-meta">{[selectedCitation.author, selectedCitation.institution, citationLabel(selectedCitation.sourceType, "")].filter(Boolean).join(" · ") || "Source record"}</p><div className="citation-location"><span>Where to find it</span><strong>{selectedCitation.pageOrSection || "Specific location not recorded"}</strong></div><p className="section-label">Evidence from this location</p>{selectedExcerpt ? <blockquote>{selectedExcerpt}</blockquote> : <p className="citation-unavailable">A readable passage is unavailable for this citation. Check the original source before relying on it.</p>}<div className="citation-details"><span>{citationLabel(selectedCitation.sourceType || selectedCitation.kind, "Source record")}</span><span>{citationLabel(selectedCitation.evidenceType || selectedCitation.textualLayer, "Source material")}</span></div>{selectedCitation.url && <a href={selectedCitation.url} target="_blank" rel="noreferrer" className="editorial-link">Open original source <ArrowUpRight size={16} aria-hidden="true" /></a>}</>}</div></SheetContent></Sheet>
  </main>;
}
