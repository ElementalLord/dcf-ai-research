"use client";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * The guide's face: a 9×9 grid of dots that morphs between shapes. It waves when it first greets
 * you, rests with a slow breath, and while thinking draws Vedic forms one after another (trishula,
 * lotus, diya, a turning wheel, damaru, sun). Dots ripple outward from the centre on each change.
 *
 * In the bitmaps, "#" is a lit dot in the accent colour, "+" a lit dot in the second colour.
 */
const N = 9;
type Frame = string[];

const art = (rows: string) => rows.trim().split("\n").map((row) => row.trim());

const HAND_UP = art(`
..#.#.#..
..#.#.#.#
..#.#.#.#
#.#######
.########
..#######
..######.
...####..
...####..`);
const HAND_LEFT = art(`
.#.#.#...
.#.#.#.#.
..#.#.#.#
+.#######
.########
..#######
..######.
...####..
...####..`);
const HAND_RIGHT = art(`
...#.#.#.
..#.#.#.#
..#.#.#.#
.#######+
.########
..#######
..######.
...####..
...####..`);
const TRISHULA = art(`
#...#...#
#..###..#
##..#..##
.#######.
....#....
...+#+...
....#....
....#....
....#....`);
const LOTUS = art(`
....#....
...###...
.#.###.#.
##.###.##
.#######.
..#####..
+++++++++
.........
.+.+.+.+.`);
const DIYA = art(`
....+....
...+++...
...+#+...
....#....
.........
#.......#
.#######.
..#####..
...###...`);
const DAMARU = art(`
#########
.#######.
..#####..
...###...
++..#..++
...###...
..#####..
.#######.
#########`);

function generated(test: (x: number, y: number, r: number, a: number) => "#" | "+" | "."): Frame {
  return Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => {
    const dx = x - 4; const dy = y - 4;
    return test(dx, dy, Math.hypot(dx, dy), Math.atan2(dy, dx));
  }).join(""));
}
const near = (a: number, step: number, offset: number) => { const d = ((a - offset) % step + step) % step; return Math.min(d, step - d) < 0.2; };
const wheel = (offset: number) => generated((_x, _y, r, a) => r > 3.4 && r < 4.6 ? "#" : r < 0.5 ? "+" : r < 3.4 && near(a, Math.PI / 4, offset) ? "#" : ".");
const sun = (long: boolean) => generated((_x, _y, r, a) => r < 1.6 ? "+" : r > 2.4 && r < (long ? 4.6 : 3.6) && near(a, Math.PI / 4, 0) ? "#" : ".");
const BREATH = generated((_x, _y, r) => r < 0.5 ? "#" : r > 1.6 && r < 2.4 ? "+" : ".");
const BREATH_OUT = generated((_x, _y, r) => r < 0.5 ? "#" : r > 1.6 && r < 2.4 ? "+" : r > 3.5 && r < 4.3 && Math.round((r * 10)) % 2 === 0 ? "#" : ".");

const SEQUENCES = {
  wave: { frames: [HAND_UP, HAND_LEFT, HAND_RIGHT, HAND_LEFT, HAND_RIGHT, HAND_UP], ms: 300 },
  rest: { frames: [BREATH, BREATH_OUT], ms: 1600 },
  think: { frames: [TRISHULA, TRISHULA, LOTUS, LOTUS, DIYA, DIYA, wheel(0), wheel(Math.PI / 8), wheel(0), wheel(Math.PI / 8), DAMARU, DAMARU, sun(false), sun(true), sun(false)], ms: 520 },
} as const;
export type GlyphMode = keyof typeof SEQUENCES;

export function DotGlyph({ mode, size = 48, label }: { mode: GlyphMode; size?: number; label?: string }) {
  const reduce = useReducedMotion();
  // `settled` turns a finished wave into the resting breath without the parent having to time it.
  const [state, setState] = useState({ mode, step: 0, settled: false });
  if (state.mode !== mode) setState({ mode, step: 0, settled: false });
  const active: GlyphMode = mode === "wave" && (state.settled || reduce) ? "rest" : mode;

  useEffect(() => {
    if (reduce) return;
    const length = SEQUENCES[active].frames.length;
    const timer = window.setInterval(() => setState((current) => {
      const next = current.step + 1;
      if (active === "wave" && next >= length) return { ...current, step: 0, settled: true };
      return { ...current, step: next % length };
    }), SEQUENCES[active].ms);
    return () => window.clearInterval(timer);
  }, [active, reduce]);

  const frames = SEQUENCES[active].frames;
  const frame = frames[Math.min(state.step, frames.length - 1)];
  return <svg className={`dot-glyph is-${active}`} width={size} height={size} viewBox="0 0 90 90" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {Array.from({ length: N * N }, (_, index) => {
      const x = index % N; const y = Math.floor(index / N);
      const cell = frame[y]?.[x] ?? ".";
      const distance = Math.hypot(x - 4, y - 4);
      return <circle key={index} cx={5 + x * 10} cy={5 + y * 10} r={cell === "." ? 1.4 : 3.7}
        className={cell === "#" ? "on" : cell === "+" ? "on alt" : "off"}
        style={{ transitionDelay: `${Math.round(distance * 22)}ms` }} />;
    })}
  </svg>;
}
