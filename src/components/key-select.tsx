"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Chevron } from "./vedic-icons";

type Option = { value: string; label: string };

/**
 * A dropdown built for this site instead of the browser's native select: a tactile key that opens a
 * small sheet of options. Keyboard: Enter/Space/ArrowDown open, arrows move, Enter picks, Esc closes.
 */
export function KeySelect({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => { if (open) list.current?.focus(); }, [open]);

  const openList = () => { setActive(Math.max(0, options.findIndex((option) => option.value === value))); setOpen(true); };
  const pick = (option: Option) => { onChange(option.value); setOpen(false); root.current?.querySelector("button")?.focus(); };
  const onListKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(options.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(options.length - 1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(options[active]); }
    else if (event.key === "Escape" || event.key === "Tab") { setOpen(false); if (event.key === "Escape") root.current?.querySelector("button")?.focus(); }
  };

  return <div className="key-select" ref={root}>
    <button type="button" className={`key key-select-trigger${options[0]?.value === "all" && value !== "all" ? " is-set" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`}
      onClick={() => open ? setOpen(false) : openList()}
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); openList(); } }}>
      <span className="key-select-label">{label}</span><span className="key-select-value">{current?.label}</span><Chevron size={15} className={open ? "is-flipped" : ""} />
    </button>
    <AnimatePresence>{open && <motion.ul key="list" ref={list} id={`${id}-list`} role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={`${id}-${active}`} className="key-select-list"
      initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
      onKeyDown={onListKey}>
      {options.map((option, index) => <li key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value === value} className={index === active ? "is-active" : ""}
        onPointerEnter={() => setActive(index)} onClick={() => pick(option)}>
        <span>{option.label}</span>{option.value === value && <Check size={15} />}
      </li>)}
    </motion.ul>}</AnimatePresence>
  </div>;
}
