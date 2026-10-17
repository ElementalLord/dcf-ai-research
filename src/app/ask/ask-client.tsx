"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { groupByCategory } from "@/lib/personality-groups";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MysticBackdrop } from "@/components/mystic-backdrop";
import { answerBlocks, citationAuthority, isIncompleteQuestion, isUnusableStoredAnswer, type AskCitation, type InlineAnswerPart } from "@/lib/ask/presentation";
import { AUTHORITY_CAVEAT, AUTHORITY_HELP, AUTHORITY_LABELS, PRIMARY_SOURCE_HELP, sourceTypeName } from "@/lib/sources/authority";
import { fetchJsonWithTimeout } from "@/lib/client/fetch-json";
import { readableEvidence } from "@/lib/corpus/readable-evidence";
import ResponseFeedback from "./response-feedback";

export type Personality = { id: string; canonical_name: string; category?: string | null; lenses?: Array<{ id: string; label: string }> };
type Result = { question: string; resolvedQuestion?: string; personality: string; answer: string; citations?: AskCitation[]; status?: string; lens?: { id: string; label: string } | null; feedbackToken?: string };
type Style = "simple" | "balanced" | "detailed" | "research";
type ResizeAxis = "width" | "height";
type ResizeSession = { axis: ResizeAxis; pointerId: number; startX: number; startY: number; width: number; height: number };
const CHAT_MIN_WIDTH = 700;
const CHAT_MIN_HEIGHT = 540;
const CHAT_MAX_HEIGHT = 1500;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const styles: Array<{ value: Style; label: string; description: string }> = [
  { value: "simple", label: "Simple", description: "Brief and plain" },
  { value: "balanced", label: "Balanced", description: "Answer with context" },
  { value: "detailed", label: "Detailed", description: "More explanation" },
  { value: "research", label: "Research", description: "Fuller evidence review" },
];
const shortCategoryNames: Record<string, string> = {
  "Educators and Social Reformers": "Educators & Reformers",
  "Monarchs and Political Leaders": "Rulers & Leaders",
  "Musicians, Performers and Cultural Figures": "Arts & Culture",
  "Rishis and Sages": "Rishis & Sages",
  "Saints and Spiritual Teachers": "Saints & Teachers",
  "Scientists and Innovators": "Scientists",
  "Social Entrepreneurs, Institution Builders and Agricultural Leaders": "Builders & Agriculture",
  "Warriors & Freedom Fighters": "Freedom Fighters",
};
const suggestionTemplates = [
  (person: string) => `Who is ${person}?`,
  (person: string) => `What is ${person} known for?`,
  (person: string) => `What did ${person} do that mattered?`,
  (person: string) => `What ideas are associated with ${person}?`,
  (person: string) => `How did ${person} influence others?`,
  (person: string) => `What challenges did ${person} face?`,
  (person: string) => `What do the sources say about ${person}?`,
  (person: string) => `What was happening in ${person}'s time?`,
  (person: string) => `How has ${person} been remembered?`,
  (person: string) => `What can we learn from ${person}'s life?`,
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

function citationReview(citation: AskCitation): string {
  if (citation.kind === "live_web_source") return "live page, not reviewed by DCF";
  if (citation.kind === "approved_source_passage") return "library passage, interpretation not reviewed";
  return citation.approvalOrigin === "human_manual" || citation.approvalOrigin === "mentor_review"
    ? "human-reviewed claim" : "claim admitted for testing or import";
}

function Inline({ parts, show, numbers, citations }: { parts: InlineAnswerPart[]; show: (id: string) => void; numbers: Map<string, number>; citations: Map<string, AskCitation> }) {
  return parts.map((part, index) => part.type === "citation"
    ? numbers.has(part.citationId)
      ? <button className="citation-ref" type="button" key={index} onClick={() => show(part.citationId)} aria-label={`Open source ${numbers.get(part.citationId)}: ${citations.get(part.citationId)?.title || "source"}; ${citations.get(part.citationId) ? citationReview(citations.get(part.citationId)!) : "review status unknown"}`} title={`${citations.get(part.citationId)?.title || "Source"} · ${citations.get(part.citationId) ? citationReview(citations.get(part.citationId)!) : "review status unknown"}`}>{numbers.get(part.citationId)}</button>
      : <span className="citation-ref citation-unavailable-ref" key={index} title="Source detail unavailable">{part.citationId.replace(/^[A-Za-z]+/, "")}</span>
    : <span key={index}>{part.value.replaceAll("*", "")}</span>);
}

function Answer({ answer, show, citations }: { answer: string; show: (id: string) => void; citations: AskCitation[] }) {
  const numbers = new Map(citations.map((citation, index) => [citation.id, index + 1]));
  const byId = new Map(citations.map((citation) => [citation.id, citation]));
  return <div className="research-answer">{answerBlocks(answer).flatMap(block => block.type === "list" ? block.items : [block.parts]).map((parts, index) =>
    <p key={index}><Inline parts={parts} show={show} numbers={numbers} citations={byId}/></p>)}</div>;
}

export default function AskClient({ personalities, loadError }: { personalities: Personality[]; loadError: string }) {
  const [personId, setPersonId] = useState(personalities[0]?.id || "");
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [personCategory, setPersonCategory] = useState("");
  const [style, setStyle] = useState<Style>("balanced");
  const [question, setQuestion] = useState("");
  const [conversations, setConversations] = useState<Record<string, Result[]>>({});
  const turns = conversations[personId] || [];
  const [loading, setLoading] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [suggestionStart, setSuggestionStart] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(loadError ? "People could not be loaded. Refresh the page to try again." : "");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [chatWidth, setChatWidth] = useState(980);
  const [chatHeight, setChatHeight] = useState<number | null>(null);
  const [chatSizeRestored, setChatSizeRestored] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1400);
  const [viewportHeight, setViewportHeight] = useState(800);
  const submitting = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const chatThread = useRef<HTMLDivElement>(null);
  const chatPage = useRef<HTMLElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const resizeSession = useRef<ResizeSession | null>(null);
  const selectedCitation = sourceId ? turns[Number(sourceId.split(":")[0])]?.citations?.find(citation => citation.id === sourceId.split(":")[1]) : undefined;
  const selectedCitationNumber = sourceId ? (turns[Number(sourceId.split(":")[0])]?.citations?.findIndex(citation => citation.id === sourceId.split(":")[1]) ?? -1) : -1;
  const selectedExcerpt = readableEvidence(selectedCitation?.excerpt);
  const selectedLive = selectedCitation?.kind === "live_web_source";
  const selectedAuthority = selectedCitation ? citationAuthority(selectedCitation) : null;
  const personRecord = personalities.find(item => item.id === personId);
  const person = personRecord?.canonical_name || "a person";
  const peopleGroups = groupByCategory(personalities);
  const activePeopleGroup = peopleGroups.find(group => group.label === personCategory)
    || peopleGroups.find(group => group.people.some(item => item.id === personId)) || peopleGroups[0];
  const lenses = personRecord?.lenses || [];
  // Follow-ups rely on the conversation for the name, so they read the way a person would ask them.
  const explore = turns.length
    ? [{ label: "In its time", ask: "How was that significant for its time?" }, { label: "Who else?", ask: "Who else was doing similar work at the time?" },
      ...lenses.map(lens => ({ label: `${lens.label} angle`, ask: `What about the ${lens.label.toLowerCase()} angle?` }))]
    : lenses.map(lens => ({ label: `${lens.label} angle`, ask: `Explain ${person} from the ${lens.label.toLowerCase()} angle.` }));
  const styleLabel = styles.find(item => item.value === style)?.label || "Balanced";
  const chatWidthMax = Math.max(CHAT_MIN_WIDTH, viewportWidth - 24);
  const displayedWidth = Math.min(chatWidth, chatWidthMax);
  const displayedHeight = chatHeight ?? Math.max(CHAT_MIN_HEIGHT, viewportHeight - 60);
  const visibleSuggestions = Array.from({ length: 3 }, (_, index) => suggestionTemplates[(suggestionStart + index) % suggestionTemplates.length](person));

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
    let savedWidth: string | null = null;
    let savedHeight: string | null = null;
    try {
      savedWidth = window.localStorage.getItem("dcf-chat-width-v1");
      savedHeight = window.localStorage.getItem("dcf-chat-height-v1");
    } catch { /* Resize handles still work without storage. */ }
    const updateViewport = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    queueMicrotask(() => {
      if (savedWidth) {
        const width = Number(savedWidth);
        if (Number.isFinite(width)) setChatWidth(clamp(width, CHAT_MIN_WIDTH, 2000));
      }
      if (savedHeight) {
        const height = Number(savedHeight);
        if (Number.isFinite(height)) setChatHeight(clamp(height, CHAT_MIN_HEIGHT, CHAT_MAX_HEIGHT));
      }
      setChatSizeRestored(true);
    });
    return () => window.removeEventListener("resize", updateViewport);
  }, []);
  useEffect(() => {
    if (!chatSizeRestored) return;
    try {
      window.localStorage.setItem("dcf-chat-width-v1", String(chatWidth));
      if (chatHeight !== null) window.localStorage.setItem("dcf-chat-height-v1", String(chatHeight));
    } catch { /* Keep the current size for this page. */ }
  }, [chatWidth, chatHeight, chatSizeRestored]);

  useEffect(() => {
    if (!loading) return;
    const interval = window.setInterval(() => setElapsed(seconds => seconds + 1), 1000);
    return () => window.clearInterval(interval);
  }, [loading]);
  useEffect(() => {
    if (turns.length || loading || !personId) return;
    const interval = window.setInterval(() => {
      const suggestions = suggestionsRef.current;
      if (suggestions?.matches(":hover") || suggestions?.contains(document.activeElement)) return;
      setSuggestionStart(start => (start + 3) % suggestionTemplates.length);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [personId, turns.length, loading]);
  useEffect(() => {
    const thread = chatThread.current;
    const latest = thread?.querySelector<HTMLElement>(".chat-exchange:last-of-type");
    if (thread && latest) thread.scrollTo({ top: latest.getBoundingClientRect().top - thread.getBoundingClientRect().top + thread.scrollTop - 18, behavior: "smooth" });
  }, [personId, turns.length, pendingQuestion]);

  function beginResize(axis: ResizeAxis, event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const bounds = chatPage.current?.getBoundingClientRect();
    if (!bounds) return;
    resizeSession.current = { axis, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, width: bounds.width, height: bounds.height };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveResize(event: PointerEvent<HTMLDivElement>) {
    const drag = resizeSession.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.axis === "width") setChatWidth(Math.round(clamp(drag.width + (event.clientX - drag.startX) * 2, CHAT_MIN_WIDTH, Math.max(CHAT_MIN_WIDTH, window.innerWidth - 24))));
    else setChatHeight(Math.round(clamp(drag.height + event.clientY - drag.startY, CHAT_MIN_HEIGHT, CHAT_MAX_HEIGHT)));
  }

  function endResize(event: PointerEvent<HTMLDivElement>) {
    if (resizeSession.current?.pointerId !== event.pointerId) return;
    resizeSession.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resizeWithKeyboard(axis: ResizeAxis, event: KeyboardEvent<HTMLDivElement>) {
    const decrease = axis === "width" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const increase = axis === "width" ? event.key === "ArrowRight" : event.key === "ArrowDown";
    if (!decrease && !increase && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const min = axis === "width" ? CHAT_MIN_WIDTH : CHAT_MIN_HEIGHT;
    const max = axis === "width" ? chatWidthMax : CHAT_MAX_HEIGHT;
    const current = axis === "width" ? displayedWidth : displayedHeight;
    const next = event.key === "Home" ? min : event.key === "End" ? max : clamp(current + (increase ? 40 : -40), min, max);
    if (axis === "width") setChatWidth(next);
    else setChatHeight(next);
  }

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!personId || !question.trim() || submitting.current) return;
    if (isIncompleteQuestion(question)) {
      setError("Finish your question so I know what you want to ask.");
      input.current?.focus();
      return;
    }
    submitting.current = true;
    setPendingQuestion(question.trim());
    setLoading(true);
    setElapsed(0);
    setError("");
    setSourceId(null);
    try {
      const { response, payload } = await fetchJsonWithTimeout<Result>("/api/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalityId: personId, question: question.trim(), responseStyle: style, history: turns.filter(turn => !isUnusableStoredAnswer(turn.answer, turn.status)).slice(-4).map(turn => ({ question: turn.question.slice(0, 1000), resolvedQuestion: turn.resolvedQuestion?.slice(0, 2000), answer: turn.status === "extractive_fallback" || turn.status === "abstained" ? undefined : turn.answer.replace(/\[[CS]\d+\]/g, "").slice(0, 800), citedConcepts: (turn.citations || []).slice(0, 4).map(citation => citation.title.slice(0, 120)).filter(title => title.trim().length >= 2) })) }),
      }, 120000);
      if (!response.ok || !payload.answer?.trim()) throw new Error("ask_failed");
      setConversations(current => ({ ...current, [personId]: [...(current[personId] || []), payload].slice(-12) }));
      setQuestion("");
    } catch {
      setError("The answer could not be completed. Your question is still here; try again.");
    } finally {
      submitting.current = false;
      setLoading(false);
      setPendingQuestion("");
    }
  }

  return <main ref={chatPage} className="ai-page page-shell" style={{ "--chat-width": `${chatWidth}px`, ...(chatHeight === null ? {} : { "--chat-height": `${chatHeight}px` }) } as CSSProperties}>
    <MysticBackdrop />
    <div className="page-kicker">AI</div>
    <div className="ai-layout"><div className="ai-main chat-main">
      <div className="ai-title"><p className="section-label">Ask DCF</p><h1>History, in conversation.</h1><p>Ask what you&apos;re curious about. Follow the story, then tap a citation whenever you want to see the evidence.</p></div>
      <div className="chat-shell">
        <MysticBackdrop contained />
        <div className="chat-toolbar"><div className="chat-toolbar-controls"><div className="person-control"><span>Talking about</span>
          <button type="button" className="person-picker-trigger" aria-label={`Choose person. Current: ${person}`} aria-haspopup="dialog" aria-expanded={personPickerOpen} onClick={() => { setPersonCategory(personRecord?.category || peopleGroups[0]?.label || ""); setPersonPickerOpen(true); }} disabled={loading || !personalities.length}><span>{personId ? person : "Choose a person"}</span><ChevronDown size={16} aria-hidden="true" /></button>
        </div><label className="depth-control">Answer depth
          <Select value={style} onValueChange={value => setStyle(value as Style)} disabled={loading}>
            <SelectTrigger aria-label="Answer depth"><SelectValue>{styleLabel}</SelectValue></SelectTrigger>
            <SelectContent className="ai-select-content">{styles.map(item => <SelectItem key={item.value} value={item.value}>{item.label}: {item.description}</SelectItem>)}</SelectContent>
          </Select>
        </label></div>{turns.length > 0 && <button className="chat-new" type="button" onClick={() => { setConversations(current => ({ ...current, [personId]: [] })); setSourceId(null); setError(""); input.current?.focus(); }} disabled={loading} aria-label="New chat"><RotateCcw size={14} aria-hidden="true" /><span>New chat</span></button>}</div>
        <div ref={chatThread} className="chat-thread" role="log" aria-live="polite" tabIndex={0} aria-label={`Conversation about ${person}`}>
          {!turns.length && !pendingQuestion && <div className="chat-welcome"><span className="chat-avatar" aria-hidden="true"><Sparkles size={19}/></span><div><p className="chat-name">DCF</p><p>Hi! What would you like to know about {person}? Start anywhere.</p></div></div>}
          {turns.map((turn, turnIndex) => <div className="chat-exchange" key={`${personId}:${turnIndex}`}>
            <div className="chat-message chat-message-user"><span className="chat-name">You</span><p>{turn.question}</p></div>
            <article className="chat-message chat-message-assistant"><span className="chat-avatar" aria-hidden="true"><Sparkles size={17}/></span><div className="chat-message-content"><span className="chat-name">DCF{turn.lens && <span className="chat-lens-tag">{turn.lens.label} angle</span>}</span>{isUnusableStoredAnswer(turn.answer, turn.status)
              ? <div className="chat-repair"><p>{isIncompleteQuestion(turn.question) ? "That question stopped partway through. Finish it below and I can give you a useful answer." : !turn.answer.trim() ? "That earlier reply was empty. Ask it again for a complete answer." : "That earlier reply pulled in page text instead of answering. Ask it again for a fresh response."}</p><button type="button" onClick={() => { setQuestion(isIncompleteQuestion(turn.question) ? `${turn.question.trim()} ` : turn.question); input.current?.focus(); }}>{isIncompleteQuestion(turn.question) ? "Finish question" : "Ask again"}<ArrowRight size={14} aria-hidden="true" /></button></div>
              : <><Answer answer={turn.answer} show={id => setSourceId(`${turnIndex}:${id}`)} citations={turn.citations || []}/>{turn.feedbackToken && <ResponseFeedback key={turn.feedbackToken} token={turn.feedbackToken}/>}</>}</div></article>
          </div>)}
          {pendingQuestion && <div className="chat-exchange chat-exchange-pending"><div className="chat-message chat-message-user"><span className="chat-name">You</span><p>{pendingQuestion}</p></div><div className="chat-message chat-message-assistant chat-thinking" role="status" aria-live="polite"><span className="chat-avatar" aria-hidden="true"><Sparkles size={17}/></span><div className="chat-message-content"><span className="chat-name">DCF is thinking</span><div className="chat-thinking-line"><span className="chat-thinking-dots" aria-hidden="true"><i/><i/><i/></span><span>{elapsed < 4 ? "Reading your question" : elapsed < 14 ? "Looking through the evidence" : "Putting the answer together"}</span></div><div className="chat-thinking-track" aria-hidden="true"><span className={elapsed < 4 ? "is-current" : "is-done"}/><span className={elapsed >= 4 && elapsed < 14 ? "is-current" : elapsed >= 14 ? "is-done" : ""}/><span className={elapsed >= 14 ? "is-current" : ""}/></div><small>{elapsed >= 25 ? "This is taking a little longer than usual." : "Sources will appear right beside the facts they support."}</small></div></div></div>}
        </div>
        {error && <p role="alert" className="form-error chat-error">{error}</p>}
        {!turns.length && !loading && <div ref={suggestionsRef} className="chat-suggestions"><span>Try asking</span>{visibleSuggestions.map(value => <button type="button" key={value} onClick={() => { setQuestion(value); input.current?.focus(); }}>{value}<ArrowUpRight size={14} aria-hidden="true" /></button>)}</div>}
        {!loading && explore.length > 0 && <div className="chat-explore" role="group" aria-label={turns.length ? "Explore further" : "Choose an angle"}><span>{turns.length ? "Explore further" : "Or choose an angle"}</span>{explore.map(item => <button type="button" key={item.label} title={item.ask} onClick={() => { setQuestion(item.ask); input.current?.focus(); }}>{item.label}</button>)}</div>}
      <form onSubmit={ask} className="ask-form chat-composer">
        <label className="question-label" htmlFor="question">Your question</label>
        <Textarea ref={input} id="question" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} placeholder={turns.length ? "Ask a follow-up…" : `Ask about ${person}…`} className="question-input" disabled={loading} />
        <div className="ask-footer"><p className="ask-keyboard-note">Enter to ask <span aria-hidden="true">·</span> Shift+Enter for a new line</p><Button type="submit" disabled={loading || !personId || !question.trim()}>{loading ? "Thinking…" : "Send"}<ArrowRight size={16} aria-hidden="true" /></Button></div>
      </form>
      <div className="chat-resize-handle chat-resize-width" role="separator" aria-orientation="vertical" aria-label="Resize chat width" aria-valuemin={CHAT_MIN_WIDTH} aria-valuemax={chatWidthMax} aria-valuenow={displayedWidth} aria-valuetext={`${displayedWidth} pixels`} tabIndex={0} title="Drag to resize chat width" onPointerDown={event => beginResize("width", event)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onKeyDown={event => resizeWithKeyboard("width", event)}><span /></div>
      <div className="chat-resize-handle chat-resize-height" role="separator" aria-orientation="horizontal" aria-label="Resize chat height" aria-valuemin={CHAT_MIN_HEIGHT} aria-valuemax={CHAT_MAX_HEIGHT} aria-valuenow={displayedHeight} aria-valuetext={`${displayedHeight} pixels`} tabIndex={0} title="Drag to resize chat height" onPointerDown={event => beginResize("height", event)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onKeyDown={event => resizeWithKeyboard("height", event)}><span /></div>
      </div>
    </div></div>
    <Dialog open={personPickerOpen} onOpenChange={setPersonPickerOpen}>
      <DialogContent className="person-picker-dialog">
        <DialogHeader className="person-picker-heading"><DialogTitle>Choose a person</DialogTitle><DialogDescription>Choose a category, then a person.</DialogDescription></DialogHeader>
        <div className="person-category-grid" role="group" aria-label="Person categories">
          {peopleGroups.map(group => <button type="button" key={group.label} className="person-category-button" aria-label={group.label} aria-pressed={group.label === activePeopleGroup?.label} onClick={() => setPersonCategory(group.label)}><span>{shortCategoryNames[group.label] || group.label}</span><small>{group.people.length}</small></button>)}
        </div>
        {activePeopleGroup && <div className="person-choice-section"><h3>{activePeopleGroup.label}</h3><div className="person-choice-grid">
          {activePeopleGroup.people.map(item => <button type="button" key={item.id} className="person-choice-button" aria-pressed={item.id === personId} onClick={() => { setPersonId(item.id); setPersonPickerOpen(false); setSuggestionStart(0); setQuestion(""); setSourceId(null); setError(""); }}><span>{item.canonical_name}</span>{item.id === personId && <Check size={17} aria-hidden="true" />}</button>)}
        </div></div>}
      </DialogContent>
    </Dialog>
    <Sheet open={!!sourceId && !!selectedCitation} onOpenChange={open => { if (!open) setSourceId(null); }}><SheetContent className="source-sheet"><SheetHeader><SheetTitle>Source {selectedCitationNumber >= 0 ? selectedCitationNumber + 1 : ""}</SheetTitle><SheetDescription>{selectedCitation?.title || "Source detail"}</SheetDescription></SheetHeader><div className="source-sheet-body">{selectedCitation && selectedAuthority && <>
      <dl className="source-facts">
        <div><dt>Publisher</dt><dd>{[selectedCitation.institution, selectedCitation.author].filter(Boolean).join(" · ") || "Not recorded"}</dd></div>
        <div><dt>Kind of evidence</dt><dd>{selectedAuthority.primary ? <><strong>Primary source</strong><span>{PRIMARY_SOURCE_HELP}</span></> : sourceTypeName(selectedCitation.sourceType, selectedLive)}</dd></div>
        <div><dt>Who published it</dt><dd><strong className={`authority-badge authority-${selectedAuthority.level}`}>{AUTHORITY_LABELS[selectedAuthority.level]}</strong><span>{selectedAuthority.primary && selectedAuthority.level === "general_web"
          ? "The original text is the evidence. This copy of it is hosted on a website that is not a recognized institution, so compare it with an institutional edition when exact wording matters."
          : `${selectedAuthority.basis ? `${selectedAuthority.basis.replace(/\.$/, "")}. ` : ""}${AUTHORITY_HELP[selectedAuthority.level]}`}</span></dd></div>
        <div><dt>Found in</dt><dd><strong>{selectedLive ? "Live research" : "DCF Library"}</strong><span>{selectedLive ? "Fetched for this question; DCF has not reviewed this page." : selectedCitation.kind === "approved_claim" ? selectedCitation.approvalOrigin === "human_manual" || selectedCitation.approvalOrigin === "mentor_review" ? "This claim was reviewed by a person." : "This claim was admitted for testing or import; it has not been reviewed by a person." : "This source passage is admitted for AI evidence. Its presence does not mean any interpretation of it was reviewed by a person."}</span></dd></div>
        <div><dt>Where to find it</dt><dd>{selectedCitation.pageOrSection || "Specific location not recorded"}</dd></div>
      </dl>
      <h3 className="section-label source-section-heading">Evidence from this source</h3>
      {selectedExcerpt ? <blockquote>{selectedExcerpt}</blockquote> : <p className="citation-unavailable">A readable passage is unavailable for this citation. Check the original source before relying on it.</p>}
      <p className="source-note">{selectedCitation.evidenceType ? <><strong>Kind of statement:</strong> {citationLabel(selectedCitation.evidenceType, "Source material")}. </> : null}{AUTHORITY_CAVEAT}</p>
      {selectedCitation.url && <a href={selectedCitation.url} target="_blank" rel="noreferrer" className="editorial-link">Open original source<span className="sr-only"> (opens in a new tab)</span> <ArrowUpRight size={16} aria-hidden="true" /></a>}
    </>}</div></SheetContent></Sheet>
  </main>;
}
