"use client";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { answerBlocks, groupCitations, type AskCitation, type InlineAnswerPart } from "@/lib/ask/presentation";
import { fetchJsonWithTimeout } from "@/lib/client/fetch-json";
export type Personality = { id: string; canonical_name: string };
type Result = { question: string; personality: string; answer: string; citations?: AskCitation[]; status?: string; conflicts?: Array<{ message: string }> };
type Style = "simple" | "balanced" | "detailed" | "research";
function Inline({ parts, show }: { parts: InlineAnswerPart[]; show: (id: string) => void }) { return parts.map((part, i) => part.type === "citation" ? <button className="citation-ref" type="button" key={i} onClick={() => show(part.citationId)} aria-label={`Inspect citation ${part.citationId}`}>{part.value}</button> : <span key={i}>{part.value.replaceAll("*", "")}</span>); }
function Answer({ answer, show }: { answer: string; show: (id: string) => void }) { return <div className="research-answer">{answerBlocks(answer).map((block, i) => block.type === "heading" ? <h3 key={i}><Inline parts={block.parts} show={show}/></h3> : block.type === "list" ? <ul key={i}>{block.items.map((item,j) => <li key={j}><Inline parts={item} show={show}/></li>)}</ul> : <p key={i}><Inline parts={block.parts} show={show}/></p>)}</div>; }
export default function AskClient({ personalities, loadError }: { personalities: Personality[]; loadError: string }) {
  const [personId, setPersonId] = useState(personalities[0]?.id || "");
  const [style, setStyle] = useState<Style>("balanced");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(loadError);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const result = turns.at(-1);
  const sources = groupCitations(result?.citations || []);
  const selectedCitation = result?.citations?.find(c => c.id === sourceId);
  const selectedSource = sources.find(group => group.citations.some(c => c.id === sourceId));
  const person = personalities.find(p => p.id === personId)?.canonical_name || "a person";
  async function ask(event: React.FormEvent) {
    event.preventDefault(); if (!personId || !question.trim() || loading) return;
    setLoading(true); setError("");
    try {
      const { response, payload } = await fetchJsonWithTimeout<Result & { error?: string | { message?: string } }>("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personalityId: personId, question: question.trim(), responseStyle: style, history: turns.slice(-4).map(t => ({ question: t.question })) }) }, 120000);
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : payload.error?.message || "The request could not be completed.");
      setTurns(current => [...current, payload].slice(-5)); setQuestion("");
    } catch (e) { setError(e instanceof Error ? e.message : "The request could not be completed."); }
    finally { setLoading(false); }
  }
  return <main className="ai-page page-shell"><div className="page-kicker">02 / AI RESEARCH</div><div className="ai-layout"><div className="ai-main"><div className="ai-title"><p className="section-label">The research desk</p><h1>Ask with context.</h1><p>Questions about lives, texts, and traditions. Answers you can trace to their sources.</p></div>
    <form onSubmit={ask} className="ask-form"><div className="ask-controls"><label>Person<Select value={personId} onValueChange={(value) => { setPersonId(value || ""); setTurns([]); }}><SelectTrigger className="w-full"><SelectValue>{(value: string | null) => personalities.find(p => p.id === value)?.canonical_name || "Choose a person"}</SelectValue></SelectTrigger><SelectContent>{personalities.map(p => <SelectItem key={p.id} value={p.id}>{p.canonical_name}</SelectItem>)}</SelectContent></Select></label><label>Answer depth<Select value={style} onValueChange={(value) => setStyle(value as Style)}><SelectTrigger className="w-full"><SelectValue>{(value: string | null) => value ? value[0].toUpperCase()+value.slice(1) : "Balanced"}</SelectValue></SelectTrigger><SelectContent>{["simple","balanced","detailed","research"].map(s => <SelectItem key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</SelectItem>)}</SelectContent></Select></label></div><label className="question-label" htmlFor="question">Your question</label><Textarea id="question" value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if(e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder={`What would you like to understand about ${person}?`} className="question-input"/><div className="ask-footer"><span>Enter to ask · Shift+Enter for a new line</span><Button type="submit" disabled={loading || !personId || !question.trim()}>{loading ? "Researching…" : "Ask DCF"}<ArrowRight size={16}/></Button></div></form>
    {error && <p role="alert" className="form-error">{error}</p>}{loading && <p role="status" className="working-note">Reading the approved evidence…</p>}
    {!result && <section className="suggestions"><p className="section-label">A place to start</p>{[`Who is ${person}?`,`What do the primary sources say about ${person}?`,`Where do interpretations of ${person} differ?`].map(q => <button type="button" key={q} onClick={() => setQuestion(q)}>{q}<ArrowUpRight size={15}/></button>)}</section>}
    {result && <article className="answer-article"><div className="answer-overline">RESEARCH RESPONSE <span>·</span> {result.personality}</div><h2>{result.question}</h2><Answer answer={result.answer} show={setSourceId}/>{result.conflicts && result.conflicts.length > 0 && <p className="reading-note">This response draws on more than one textual layer. Their perspectives are kept distinct.</p>}{result.status === "extractive_fallback" && <p className="reading-note">Synthesis is unavailable. This view presents relevant verified evidence.</p>}<section className="sources-list"><div className="sources-heading"><h3>Sources & citations</h3><span>{result.citations?.length || 0} references</span></div>{sources.length ? sources.map(group => <button className="source-row" type="button" key={group.key} onClick={() => setSourceId(group.citations[0].id)}><BookOpen size={17}/><span><strong>{group.title}</strong><small>{[group.author,group.institution].filter(Boolean).join(" · ") || "Source record"}</small></span><span className="source-ids">{group.citations.map(c => c.id).join(", ")}</span><ArrowUpRight size={15}/></button>) : <p className="empty-note">No citations accompanied this response.</p>}</section></article>}
    </div><aside className="ai-aside"><div className="aside-rule"/><p className="section-label">Reading DCF</p><p>Citations identify the claim or passage behind a statement. Open one to see its source, location, and excerpt.</p><div className="aside-rule"/><p className="section-label">Evidence matters</p><p>Traditional accounts, historical evidence, and interpretation can tell different stories. DCF marks uncertainty rather than treating them as interchangeable.</p></aside></div>
    <Sheet open={!!sourceId} onOpenChange={open => { if (!open) setSourceId(null); }}><SheetContent className="source-sheet sm:max-w-xl"><SheetHeader><SheetTitle>Source detail</SheetTitle><SheetDescription>{selectedSource?.title || "Citation"}</SheetDescription></SheetHeader><div className="source-sheet-body">{selectedCitation && <><p className="section-label">REFERENCE {selectedCitation.id}</p><h3>{selectedCitation.title}</h3><p className="source-meta">{[selectedCitation.author, selectedCitation.institution, selectedCitation.sourceType].filter(Boolean).join(" · ")}</p><dl><div><dt>Location</dt><dd>{selectedCitation.pageOrSection || "Not specified"}</dd></div><div><dt>Textual layer</dt><dd>{selectedCitation.textualLayer || "Not specified"}</dd></div><div><dt>Evidence type</dt><dd>{selectedCitation.evidenceType || selectedCitation.kind.replaceAll("_"," ")}</dd></div></dl><p className="section-label">CITED EXCERPT</p><blockquote>{selectedCitation.excerpt}</blockquote>{selectedCitation.url && <a href={selectedCitation.url} target="_blank" rel="noreferrer" className="editorial-link">Open original source <ArrowUpRight size={16}/></a>}</>}</div></SheetContent></Sheet>
  </main>;
}
