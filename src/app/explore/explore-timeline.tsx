"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { Portrait, type PortraitData } from "@/components/portrait";
import { CATEGORY_ICONS, Manuscript } from "@/components/vedic-icons";
import { ERA_PERIODS, type ExplorePerson } from "./explore-data";

const DEVANAGARI_DIGITS = ["१", "२", "३", "४", "५", "६", "७", "८", "९"];
const ease = [0.23, 1, 0.32, 1] as const;

const chronological = (a: ExplorePerson, b: ExplorePerson) =>
  ERA_PERIODS.indexOf(a.period) - ERA_PERIODS.indexOf(b.period)
  || (a.sortYear ?? Number.NEGATIVE_INFINITY) - (b.sortYear ?? Number.NEGATIVE_INFINITY)
  || a.name.localeCompare(b.name);

/** Two strands that twist around the centre line, like the cord that binds a palm-leaf manuscript. */
function cordPaths(height: number) {
  const period = 56;
  const amplitude = 6;
  const strand = (phase: number) => {
    let d = `M ${30 + amplitude * Math.sin(phase)} 0`;
    for (let y = 8; y <= height; y += 8) d += ` L ${(30 + amplitude * Math.sin((y / period) * Math.PI * 2 + phase)).toFixed(2)} ${y}`;
    return d;
  };
  return [strand(0), strand(Math.PI)];
}

/** A lotus rosette: two rings of petals, a dotted ring and a seed. Drawn stroke by stroke. */
function Rosette({ spin, index, reduce }: { spin: MotionValue<number>; index: number; reduce: boolean | null }) {
  const petals = (count: number, inner: number, outer: number, width: number) => Array.from({ length: count }, (_, petal) => {
    const angle = (petal / count) * Math.PI * 2;
    const tip = [50 + outer * Math.cos(angle), 50 + outer * Math.sin(angle)];
    const base = [50 + inner * Math.cos(angle), 50 + inner * Math.sin(angle)];
    const side = (sign: number) => [50 + (inner + (outer - inner) * 0.55) * Math.cos(angle + sign * width), 50 + (inner + (outer - inner) * 0.55) * Math.sin(angle + sign * width)];
    const [l, r] = [side(-1), side(1)];
    return `M ${base[0].toFixed(2)} ${base[1].toFixed(2)} Q ${l[0].toFixed(2)} ${l[1].toFixed(2)} ${tip[0].toFixed(2)} ${tip[1].toFixed(2)} Q ${r[0].toFixed(2)} ${r[1].toFixed(2)} ${base[0].toFixed(2)} ${base[1].toFixed(2)}`;
  });
  const outer = petals(8 + (index % 3) * 4, 22, 44, 0.32);
  const inner = petals(8, 9, 24, 0.42);
  const draw = (delay: number) => reduce ? {} : {
    initial: { pathLength: 0, opacity: 0 },
    whileInView: { pathLength: 1, opacity: 1 },
    viewport: { once: true, amount: 0.6 },
    transition: { duration: 1.4, ease, delay },
  };
  return <motion.svg className="tl-rosette" viewBox="0 0 100 100" aria-hidden="true" style={reduce ? undefined : { rotate: spin }}>
    <motion.circle cx="50" cy="50" r="47" className="tl-ring" {...draw(0)} />
    <circle cx="50" cy="50" r="47" className="tl-dots" />
    {outer.map((d, i) => <motion.path key={`o${i}`} d={d} {...draw(0.15 + i * 0.04)} />)}
    {inner.map((d, i) => <motion.path key={`i${i}`} d={d} className="tl-inner" {...draw(0.6 + i * 0.05)} />)}
    <motion.circle cx="50" cy="50" r="4.5" className="tl-seed" {...draw(1)} />
  </motion.svg>;
}

export function ExploreTimeline({ people, portraits }: { people: ExplorePerson[]; portraits: Record<string, PortraitData> }) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 0 when the top of the timeline reaches the middle of the screen, 1 when its end does.
  const { scrollYProgress } = useScroll({ target: root, offset: ["start center", "end center"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.4 });
  const lampY = useTransform(progress, (value) => value * height);
  const spin = useTransform(scrollYProgress, [0, 1], [0, 220]);
  const [strandA, strandB] = useMemo(() => cordPaths(height), [height]);

  const eras = ERA_PERIODS.map((period) => ({ period, members: people.filter((person) => person.period === period).sort(chronological) })).filter((era) => era.members.length);
  let leafIndex = 0;

  return <div className="tl" ref={root}>
    <p className="tl-heading" aria-hidden="true"><span lang="sa">कालक्रम</span></p>
    {height > 0 && <svg className="tl-cord" width="60" height={height} viewBox={`0 0 60 ${height}`} aria-hidden="true">
      <path d={strandA} className="tl-cord-ghost" /><path d={strandB} className="tl-cord-ghost" />
      <motion.path d={strandA} className="tl-cord-a" style={{ pathLength: reduce ? 1 : progress }} />
      <motion.path d={strandB} className="tl-cord-b" style={{ pathLength: reduce ? 1 : progress }} />
    </svg>}
    {!reduce && height > 0 && <motion.span className="tl-lamp" style={{ y: lampY }} aria-hidden="true"><span /></motion.span>}

    {eras.map((era, eraIndex) => <section className="tl-era" key={era.period} aria-labelledby={`era-${eraIndex}`}>
      <header className="tl-era-head">
        <div className="tl-era-mark"><Rosette spin={spin} index={eraIndex} reduce={reduce} /><span className="tl-numeral" lang="sa">{DEVANAGARI_DIGITS[ERA_PERIODS.indexOf(era.period)]}</span></div>
        <motion.h3 id={`era-${eraIndex}`} initial={reduce ? false : { opacity: 0, y: 10, letterSpacing: "0.08em" }} whileInView={{ opacity: 1, y: 0, letterSpacing: "0em" }} viewport={{ once: true, amount: 0.8 }} transition={{ duration: 0.8, ease }}>{era.period}</motion.h3>
        <p className="tl-era-count">{era.members.length} {era.members.length === 1 ? "life" : "lives"}</p>
      </header>
      <ol className="tl-leaves">
        {era.members.map((person) => {
          const side = leafIndex++ % 2 === 0 ? "left" : "right";
          const Icon = CATEGORY_ICONS[person.presentationCategory.id] ?? Manuscript;
          return <motion.li key={person.id} className={`tl-leaf-wrap is-${side}`}
            initial={reduce ? false : { opacity: 0, x: side === "left" ? -48 : 48, rotate: side === "left" ? -2.5 : 2.5, filter: "blur(6px)" }}
            whileInView={{ opacity: 1, x: 0, rotate: 0, filter: "blur(0px)" }}
            viewport={{ once: true, amount: 0.45 }} transition={{ duration: 0.75, ease }}>
            <span className="tl-tie" aria-hidden="true" />
            <Link href={`/explore/${person.slug}`} className={`tl-leaf cat-${person.presentationCategory.id}`}>
              <span className="tl-hole" aria-hidden="true" /><span className="tl-hole" aria-hidden="true" />
              <Portrait name={person.name} portrait={portraits[person.slug]} category={person.presentationCategory.id} size={54} />
              <span className="tl-leaf-text">
                <span className="tl-leaf-date">{person.eraShort}</span>
                <strong>{person.name}</strong>
                <span className="tl-leaf-role"><Icon size={14} />{person.detailedCategory}</span>
              </span>
            </Link>
          </motion.li>;
        })}
      </ol>
    </section>)}
    <div className="tl-end" aria-hidden="true"><Rosette spin={spin} index={2} reduce={reduce} /></div>
  </div>;
}
