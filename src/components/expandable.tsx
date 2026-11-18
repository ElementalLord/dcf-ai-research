"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Holds a long list at a fixed height, fading out at the bottom, until the reader asks for the
 * rest. Short lists show in full with no button. Collapsing again returns the reader to the top
 * of the list, so they are never left stranded far down the page.
 */
export function Expandable({ children, height = 420, noun = "items", count, className = "", forceOpen = false }: {
  children: ReactNode;
  /** Collapsed height in pixels. */
  height?: number;
  /** What the list holds, for the button: "Show all 42 sources". */
  noun?: string;
  /** How many entries the list holds, when known. */
  count?: number;
  className?: string;
  /** Opens the list, for example when something inside it has been selected from elsewhere. */
  forceOpen?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(forceOpen);
  const [overflows, setOverflows] = useState(false);
  // Open when forceOpen turns on; the reader can still close it afterwards.
  const [wasForced, setWasForced] = useState(forceOpen);
  if (forceOpen !== wasForced) { setWasForced(forceOpen); if (forceOpen) setOpen(true); }

  useIsomorphicLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    // Only lock lists that are clearly longer than the window; a few extra pixels are not worth a button.
    const resize = new ResizeObserver(() => measure());
    const watch = () => { resize.disconnect(); resize.observe(element); for (const child of Array.from(element.children)) resize.observe(child); };
    function measure() { setOverflows(element!.scrollHeight > height + 72); }
    // Rows can arrive after the first paint (filters, loading), so re-measure when the content changes.
    const mutations = new MutationObserver(() => { watch(); measure(); });
    mutations.observe(element, { childList: true, subtree: true });
    watch(); measure();
    return () => { resize.disconnect(); mutations.disconnect(); };
  }, [height]);

  const locked = overflows && !open;
  return <div className={`expandable ${locked ? "is-locked" : ""} ${className}`}>
    <div ref={box} className="expandable-body" style={locked ? { maxHeight: height } : undefined}>{children}</div>
    {overflows && <button type="button" className="expandable-toggle" aria-expanded={open} onClick={() => {
      setOpen((value) => !value);
      if (open) box.current?.parentElement?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }}>
      <ChevronDown size={15} aria-hidden="true" className={open ? "is-flipped" : ""} />
      {open ? "Show less" : count ? `Show all ${count} ${noun}` : `Show all ${noun}`}
    </button>}
  </div>;
}
