"use client";
import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { answerBlocks, groupCitations, type AskCitation, type InlineAnswerPart } from "@/lib/ask/presentation";
import { fetchJsonWithTimeout } from "@/lib/client/fetch-json";
export type Personality = { id: string; canonical_name: string };
type Result = { question: string; personality: string; answer: string; citations?: AskCitation[]; status?: string; conflicts?: Array<{ message: string }> };
type Style = "simple" | "balanced" | "detailed" | "research";
const styles: Array<{ value: Style; label: string; description: string }> = [
  { value: "simple", label: "Simple", description: "A short explanation" },
  { value: "balanced", label: "Balanced", description: "A clear answer with context" },
  { value: "detailed", label: "Detailed", description: "More context and nuance" },
  { value: "research", label: "Research", description: "A deeper evidence review" },
];
function Inline({ parts, show, available }: { parts: InlineAnswerPart[]; show: (id: string) => void; available: Set<string> }) {
  return parts.map((part, index) => part.type === "citation" ? available.has(part.citationId) ? <button className="citation-ref" type="button" key={index} onClick={() => show(part.citationId)} aria-label={`Inspect citation ${part.citationId}`}>{part.value}</button> : <span key={index}>{part.value}</span> : <span key={index}>{part.value.replaceAll("*", "")}</span>);
}
function Answer({ answer, show, citations }: { answer: string; show: (id: string) => void; citations: AskCitation[] }) {
  const available = new Set(citations.map(citation => citation.id));
  return <div className="research-answer">{answerBlocks(answer).map((block, index) => block.type === "heading" ? <h3 key={index}><Inline parts={block.parts} show={show} available={available}/></h3> : block.type === "list" ? <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Inline parts={item} show={show} available={available}/></li>)}</ul> : <p key={index}><Inline parts={block.parts} show={show} available={available}/></p>)}</div>;
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
  const styleDescription = styles.find(item => item.value === style)?.description;
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!personId || !question.trim() || submitting.current) return;
    submitting.current = true; setLoading(true); setError(""); setSourceId(null);
    try {
      const { response, payload } = await fetchJsonWithTimeout<Result & { error?: string | { message?: string } }>("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personalityId: personId, question: question.trim(), responseStyle: style, history: turns.slice(-4).map(turn => ({ question: turn.question })) }) }, 120000);
      if (!response.ok) throw new Error("ask_failed");
      setTurns(current => [...current, payload].slice(-5)); setQuestion("");
    } catch { setError("DCF could not complete that answer. Your question is still here; try again."); }
    finally { submitting.current = false; setLoading(false); }
  }
  return <main className="ai-page page-shell"><div className="page-kicker">02 / AI RESEARCH</div><div className="ai-layout"><div className="ai-main"><div className="ai-title"><p className="section-label">The research desk</p><h1>Ask with context.</h1><p>Choose a person, ask a question, then follow the citations behind the answer.</p></div>
    <form onSubmit={ask} className="ask-form"><div className="ask-controls"><label>Person<Select value={personId} onValueChange={value => { setPersonId(value || ""); setTurns([]); setError(""); }} disabled={loading}><SelectTrigger aria-label="Choose person"><SelectValue>{personId ? person : "Choose a person"}</SelectValue></SelectTrigger><SelectContent>{personalities.map(item => <SelectItem key={item.id} value={item.id}>{item.canonical_name}</SelectItem>)}</SelectContent></Select></label><label>Response style<Select value={style} onValueChange={value => setStyle(value as Style)} disabled={loading}><SelectTrigger aria-label="Response style"><SelectValue>{styles.find(item => item.value === style)?.label}</SelectValue></SelectTrigger><SelectContent>{styles.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></label></div><p className="ask-style-help">{styleDescription}</p><label className="question-label" htmlFor="question">Your question about {person}</label><Textarea ref={input} id="question" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={`What would you like to understand about ${person}?`} className="question-input" disabled={loading}/><div className="ask-footer"><span>Enter to ask · Shift+Enter for a new line</span><Button type="submit" disabled={loading || !personId || !question.trim()}>{loading ? "Researching…" : "Ask DCF"}<ArrowRight size={16}/></Button></div></form>
    {error && <p role="alert" className="form-error">{error}</p>}{loading && <div className="answer-skeleton" role="status" aria-label="Researching your question"><p className="section-label">Researching {person}…</p><Skeleton className="h-7 w-2/3"/><Skeleton className="h-4 w-full"/><Skeleton className="h-4 w-11/12"/><Skeleton className="h-4 w-3/4"/></div>}
    {!result && !loading && <section className="suggestions"><p className="section-label">A place to start</p>{[`Who is ${person}?`, `What do the primary sources say about ${person}?`, `Where do interpretations of ${person} differ?`].map(value => <button type="button" key={value} onClick={() => { setQuestion(value); input.current?.focus(); }}>{value}<ArrowUpRight size={15}/></button>)}</section>}
    {result && <article className="answer-article"><div className="answer-overline">RESEARCH RESPONSE <span>·</span> {result.personality}</div><h2>{result.question}</h2><Answer answer={result.answer} show={setSourceId} citations={result.citations || []}/><section className="sources-list"><div className="sources-heading"><h3>Sources & citations</h3><span>{result.citations?.length || 0} references</span></div>{sources.length ? <>{([["DCF Library", librarySources], ["Live research", liveSources]] as const).map(([label, groups]) => groups.length ? <div key={label}><p className="section-label mt-5 mb-2">{label}</p><p className="source-group-help">{label === "DCF Library" ? "Reviewed records and passages in the DCF collection." : "Web material consulted for this answer."}</p>{groups.map(group => <button className="source-row" type="button" key={group.key} onClick={() => setSourceId(group.citations[0].id)}><BookOpen size={17}/><span><strong>{group.title}</strong><small>{[group.author, group.institution].filter(Boolean).join(" · ") || "Source record"}</small></span><span className="source-ids">{group.citations.map(citation => citation.id).join(", ")}</span><ArrowUpRight size={15}/></button>)}</div> : null)}</> : <p className="empty-note">No citations accompanied this response.</p>}</section></article>}
    </div><aside className="ai-aside"><div className="aside-rule"/><p className="section-label">Reading DCF</p><p>Click a citation to see the source, its location, and the passage or summary used in the answer.</p><div className="aside-rule"/><p className="section-label">Evidence matters</p><p>Traditional accounts, historical evidence, and interpretation can tell different stories. DCF marks uncertainty where the material cannot settle a question.</p></aside></div>
    <Sheet open={!!sourceId && !!selectedCitation} onOpenChange={open => { if (!open) setSourceId(null); }}><SheetContent className="source-sheet"><SheetHeader><SheetTitle>Citation {selectedCitation?.id || ""}</SheetTitle><SheetDescription>{selectedSource?.title || "Source detail"}</SheetDescription></SheetHeader><div className="source-sheet-body">{selectedCitation && <><p className="section-label">{selectedCitation.kind === "live_web_source" ? "LIVE RESEARCH" : "DCF LIBRARY"}</p><h3>{selectedCitation.title}</h3><p className="source-meta">{[selectedCitation.author, selectedCitation.institution, selectedCitation.sourceType].filter(Boolean).join(" · ") || "Source record"}</p><dl><div><dt>Source type</dt><dd>{selectedCitation.sourceType || selectedCitation.kind.replaceAll("_", " ")}</dd></div><div><dt>Location</dt><dd>{selectedCitation.pageOrSection || "Not specified"}</dd></div><div><dt>Evidence</dt><dd>{selectedCitation.evidenceType || selectedCitation.textualLayer || "Source material"}</dd></div></dl><p className="section-label">{selectedCitation.kind === "live_web_source" ? "RELEVANT SUPPORT" : "CITED SUPPORT"}</p><blockquote>{selectedCitation.excerpt || "No excerpt is available for this citation."}</blockquote>{selectedCitation.url && <a href={selectedCitation.url} target="_blank" rel="noreferrer" className="editorial-link">Open original source <ArrowUpRight size={16}/></a>}</>}</div></SheetContent></Sheet>
  </main>;
}
