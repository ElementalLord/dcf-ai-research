"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";

/**
 * A guided walkthrough of a page: the page dims, a spotlight glides to one control at a time, and a card
 * beside it explains what that control does. The visitor moves with Next and Back (or the arrow keys) at their own
 * pace. The tour only points; it never clicks anything or changes a record. A step may ask the page to show a
 * different area first (`prepare`), for example switching to the Claims tab.
 */
export type TourStep = {
  /** CSS selector for the control to light up. Without one (or if it is not on screen) the card sits in the middle. */
  target?: string;
  /** A short label for the part of the page, shown above the title. */
  area: string;
  title: string;
  body: ReactNode;
  /** Called before the step is shown, so the page can reveal the right tab. */
  prepare?: () => void;
};

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8; // breathing room around the lit control
const GAP = 14; // between the spotlight and the card
const EDGE = 16; // minimum distance from the viewport edge
const HEADER = 96; // keep targets clear of the sticky site header when scrolling to them

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sameRect = (a: Rect | null, b: Rect | null) => !!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
/** Space left for the target once the sticky header and (on phones) the docked card are accounted for. */
const viewRoom = () => window.innerHeight - HEADER - (window.innerWidth < 640 ? 260 : 40);
/** Scroll so the control sits centred in the free space, or at the top of it when it is too tall to fit. */
function bringIntoView(element: HTMLElement, smooth: boolean) {
  const box = element.getBoundingClientRect();
  const room = viewRoom();
  const offset = box.height < room ? HEADER + Math.max(0, (room - box.height) / (window.innerWidth < 640 ? 4 : 2)) : HEADER;
  window.scrollTo({ top: Math.max(0, window.scrollY + box.top - offset), behavior: smooth ? "smooth" : "auto" });
}
function comfortablyVisible(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  return box.top >= HEADER - 4 && (box.bottom <= HEADER + viewRoom() + 4 || box.height > viewRoom());
}
const findTarget = (selector?: string) => {
  if (!selector) return null;
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? element : null;
};

/** Render only while the tour is running; mounting starts it at the first step. */
export function GuidedTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [gliding, setGliding] = useState(true);
  const [rect, setRect] = useState<Rect | null>(null);
  const [found, setFound] = useState(false);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  // The page rebuilds its step list on every render; read it through a ref so a re-render never restarts a step.
  const stepsRef = useRef(steps);
  useEffect(() => { stepsRef.current = steps; });
  const step = steps[index];
  const last = index === steps.length - 1;

  // Closing hands focus back to whatever opened the tour.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => { opener?.focus?.(); };
  }, []);

  // Show the step: let the page reveal the right area, wait for the control to appear, then bring it into view.
  useEffect(() => {
    const step = stepsRef.current[index];
    if (!step) return;
    step.prepare?.();
    let frame = 0;
    let recheck = 0;
    // The spotlight glides only while moving between steps; afterwards it sticks to the control as the page scrolls.
    const settle = window.setTimeout(() => setGliding(false), 900);
    let tries = 0;
    const look = () => {
      const element = findTarget(step.target);
      if (!element && step.target && tries++ < 45) { frame = requestAnimationFrame(look); return; } // up to ~¾ s for a tab to render
      setFound(!!element);
      if (element) {
        bringIntoView(element, !reducedMotion());
        // A freshly shown tab can still change height while it loads; once the scroll settles, correct any drift.
        recheck = window.setTimeout(() => { if (!comfortablyVisible(element)) bringIntoView(element, false); }, 850);
      }
      card.current?.focus({ preventScroll: true });
    };
    frame = requestAnimationFrame(look);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(settle); window.clearTimeout(recheck); };
  }, [index]);

  // Follow the control while the page scrolls, resizes or reflows, so the spotlight never drifts off it.
  useEffect(() => {
    let frame = 0;
    const track = () => {
      const element = found ? findTarget(stepsRef.current[index]?.target) : null;
      const box = element?.getBoundingClientRect();
      const next = box ? { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 } : null;
      setRect(current => (next === null ? (current === null ? current : null) : sameRect(current, next) ? current : next));
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    return () => cancelAnimationFrame(frame);
  }, [found, index]);

  // Place the card next to the spotlight: below if it fits, else above, else wherever it covers least.
  useLayoutEffect(() => {
    if (!card.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { width: cw, height: ch } = card.current.getBoundingClientRect();
    if (!rect) { setCardPos({ top: Math.max(EDGE, (vh - ch) / 2), left: Math.max(EDGE, (vw - cw) / 2) }); return; }
    if (vw < 640) { // phones: dock to whichever edge the spotlight is not near
      const top = rect.top + rect.height / 2 > vh / 2 ? EDGE : vh - ch - EDGE;
      setCardPos(current => current && current.top === top && current.left === 12 ? current : { top, left: 12 });
      return;
    }
    const left = Math.min(Math.max(EDGE, rect.left + rect.width / 2 - cw / 2), vw - cw - EDGE);
    const below = rect.top + rect.height + GAP;
    const above = rect.top - GAP - ch;
    const top = below + ch <= vh - EDGE ? below : above >= EDGE ? above : vh - ch - EDGE;
    setCardPos(current => current && Math.abs(current.top - top) < 0.5 && Math.abs(current.left - left) < 0.5 ? current : { top, left });
  }, [rect, index]);

  const go = useCallback((delta: number) => {
    const next = Math.min(steps.length - 1, Math.max(0, index + delta));
    if (next === index) return;
    setFound(false); setGliding(true); setIndex(next);
  }, [index, steps.length]);

  // Arrow keys step, Escape ends. Tab stays inside the card while the page behind it is dimmed.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault(); event.stopPropagation();
        if (event.key === "ArrowRight" && last) onClose(); else go(event.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (event.key === "Tab" && card.current) {
        const focusable = [...card.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
        if (!focusable.length) return;
        const first = focusable[0];
        const end = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === card.current)) { event.preventDefault(); end.focus(); }
        else if (!event.shiftKey && (active === end || !card.current.contains(active))) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, last, onClose]);

  if (!step || typeof document === "undefined") return null;
  return createPortal(
    <div className="tour-root">
      {/* catches clicks so the page can't be changed mid-tour; the spotlight's shadow does the dimming */}
      <div className="tour-backdrop" aria-hidden="true" />
      <div className={`tour-spotlight ${rect ? "" : "is-off"} ${gliding ? "is-gliding" : ""}`} aria-hidden="true"
        style={rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : undefined} />
      <div ref={card} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" tabIndex={-1}
        style={cardPos ? { top: cardPos.top, left: cardPos.left } : { visibility: "hidden" }}>
        <div className="tour-card-top">
          <span className="tour-area">{step.area}</span>
          <span className="tour-count">{index + 1} of {steps.length}</span>
          <button type="button" className="tour-close" onClick={onClose} aria-label="End the tour"><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="tour-progress" aria-hidden="true"><span style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
        <div className="tour-copy" key={index}>
          <h2 id="tour-title">{step.title}</h2>
          <div id="tour-body" className="tour-body">{step.body}</div>
        </div>
        <div className="tour-actions">
          <button type="button" className="key tour-back" onClick={() => go(-1)} disabled={index === 0}><ArrowLeft size={15} aria-hidden="true" />Back</button>
          <span className="tour-hint" aria-hidden="true">← → keys</span>
          <button type="button" className="key key-hot tour-next" onClick={() => (last ? onClose() : go(1))} autoFocus>
            {last ? "Finish" : "Next"}{!last && <ArrowRight size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">Step {index + 1} of {steps.length}: {step.title}</p>
    </div>,
    document.body,
  );
}

/** The button that starts a tour. In Resources it sits beside “How to use”; pass a class to style it elsewhere. */
export function TourButton({ onStart, className = "key resource-help-trigger", label = "Take the tour" }: { onStart: () => void; className?: string; label?: string }) {
  return <button type="button" className={`${className} tour-trigger`} onClick={onStart}>
    <Compass size={17} aria-hidden="true" /><span>{label}</span>
  </button>;
}
