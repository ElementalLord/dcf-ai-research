"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * The guide's face: an 11×11 grid of dots that morphs between pictures. It waves when it first
 * greets you, rests with a slow breath, and while thinking plays a shuffled series of small
 * animated scenes (a lotus opening, a flickering diya, a turning wheel, a rising sun, ॐ, …).
 * Each scene holds for a couple of seconds; between scenes the dots scatter and regather, and
 * no scene repeats until every other one has played.
 *
 * In the bitmaps, "#" is a dot in the accent colour, "+" a dot in the second colour.
 */
const N = 11;
const C = 5;
type Frame = string[];
type Scene = { name: string; frames: Frame[]; ms: number };

const art = (rows: string) => rows.trim().split("\n").map((row) => row.trim());
const blank = (): Frame => Array.from({ length: N }, () => ".".repeat(N));
function generated(test: (x: number, y: number, r: number, a: number) => "#" | "+" | "."): Frame {
  return Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => {
    const dx = x - C; const dy = y - C;
    return test(dx, dy, Math.hypot(dx, dy), Math.atan2(dy, dx));
  }).join(""));
}
const near = (a: number, step: number, offset: number, width = 0.17) => { const d = ((a - offset) % step + step) % step; return Math.min(d, step - d) < width; };

/* ---------- Hand-drawn pictures ---------- */
const HAND_UP = art(`
...#.#.#...
...#.#.#.#.
...#.#.#.#.
...#.#.#.#.
#..#######.
##.#######.
.#########.
..########.
...######..
....####...
....####...`);
const HAND_LEFT = art(`
..#.#.#....
..#.#.#.#.+
...#.#.#.#+
...#.#.#.#.
#..#######.
##.#######.
.#########.
..########.
...######..
....####...
....####...`);
const HAND_RIGHT = art(`
....#.#.#..
+...#.#.#.#
+..#.#.#.#.
...#.#.#.#.
#..#######.
##.#######.
.#########.
..########.
...######..
....####...
....####...`);
const TRISHULA = art(`
#....#....#
#...###...#
#....#....#
##...#...##
.##..#..##.
..#######..
.....#.....
....+++....
.....#.....
.....#.....
.....#.....`);
const TRISHULA_GLINT = art(`
+....+....+
#...###...#
#....#....#
##...#...##
.##..#..##.
..#######..
.....#.....
....+++....
.....#.....
.....#.....
.....#.....`);
const LOTUS_BUD = art(`
...........
...........
.....#.....
....###....
....###....
....###....
.....#.....
...#####...
+++++++++++
...........
..+..+..+..`);
const LOTUS_HALF = art(`
...........
.....#.....
....###....
..#.###.#..
..##.#.##..
...#####...
....###....
..#######..
+++++++++++
...........
.+..+..+..+`);
const LOTUS_FULL = art(`
.....#.....
....###....
.#..###..#.
.##.###.##.
###.###.###
.#########.
..#######..
...#####...
+++++++++++
...........
+..+..+..+.`);
const diya = (flame: Frame): Frame => [...flame, ...art(`
.....#.....
...........
#.........#
.#########.
..#######..
...#####...
....###....`)];
const DIYA_A = diya(art(`
.....+.....
....+++....
....+++....
....+#+....`));
const DIYA_B = diya(art(`
....+......
....++.....
...+++.....
....+#+....`));
const DIYA_C = diya(art(`
......+....
.....++....
.....+++...
....+#+....`));
const DAMARU_A = art(`
###########
.#########.
..#######..
...#####...
....###....
++...#...++
....###....
...#####...
..#######..
.#########.
###########`);
const DAMARU_B = art(`
###########
.#########.
..#######..
+..#####..+
.+..###..+.
.....#.....
....###....
...#####...
..#######..
.#########.
###########`);
const DAMARU_C = art(`
###########
.#########.
..#######..
...#####...
....###....
.....#.....
.+..###..+.
+..#####..+
..#######..
.#########.
###########`);
const KALASH = art(`
...#.#.#...
..##.#.##..
...+++++...
....+++....
...#####...
..#######..
.#########.
.###+++###.
.#########.
..#######..
...#####...`);
const KAILASH = art(`
...........
.....+.....
....+++....
...++#++...
...#####...
..#######..
.#########.
.####.####.
###########
...........
+.+.+.+.+.+`);
const FEATHER = art(`
.....#.....
....###....
...##+##...
..##+#+##..
..#+###+#..
..##+#+##..
...##+##...
....###....
.....#.....
.....#.....
....#.#....`);
const FEET_A = art(`
......+.+..
......###..
......###..
......###..
.......#...
.+.+.......
.###.......
.###.......
.###.......
..#........
...........`);
const FEET_B = art(`
.+.+.......
.###.......
.###.......
.###.......
..#........
......+.+..
......###..
......###..
......###..
.......#...
...........`);
const book = (lines: number[]): Frame => {
  const rows = art(`
...........
.####.####.
.#..#.#..#.
.#..#.#..#.
.#..#.#..#.
.#..#.#..#.
.#..#.#..#.
.####.####.
.....#.....
...........
...........`);
  return rows.map((row, y) => lines.includes(y) ? row.slice(0, 2) + "++" + row.slice(4, 7) + "++" + row.slice(9) : row);
};

/* ---------- Generated pictures ---------- */
const wheel = (offset: number) => generated((_x, _y, r, a) => r > 4.3 && r < 5.4 ? "#" : r < 1 ? "+" : r < 4.3 && near(a, Math.PI / 4, offset) ? "#" : ".");
const sunrise = (lift: number) => generated((x, y, _r, a) => {
  if (y === 3) return "+";
  if (y > 3) return (y === 5 && x % 3 === 0) ? "+" : ".";
  const cy = 3 - lift; const d = Math.hypot(x, y - cy);
  if (d < 2.1) return "#";
  return d > 3.1 && d < 4.4 && near(Math.atan2(y - cy, x), Math.PI / 4, Math.PI / 8 * (lift % 2), 0.22) && a < 0 ? "#" : ".";
});
const moon = (twinkle: number) => generated((x, y) => {
  const outer = Math.hypot(x + 1, y) < 4.2; const inner = Math.hypot(x + 3, y - 1) < 3.9;
  if (outer && !inner) return "#";
  const stars = twinkle ? [[3, -4], [4, 2]] : [[2, -2], [4, -1], [3, 4]];
  return stars.some(([sx, sy]) => sx === x && sy === y) ? "+" : ".";
});
const ripple = (phase: number) => generated((_x, _y, r) => r < 0.6 ? "+" : [phase, phase + 2.6, phase + 5.2].some((ring) => Math.abs(r - ring) < 0.45) ? "#" : ".");
const mandala = (turn: number) => generated((_x, _y, r, a) => r < 0.8 ? "+" : r < 5.4 && r > 1.4 && Math.cos(6 * (a - turn)) > 0.55 - (r > 3.6 ? 0.25 : 0) ? (r > 3.6 ? "#" : "+") : ".");
const yantra = (spark: boolean) => generated((x, y) => {
  const edge = (px: number, py: number, flip: number) => {
    const ty = flip * py; // up-pointing triangle with apex at (0,-4.5), base at y = 2.6
    const left = Math.abs(px) - (ty + 4.5) * 0.58;
    return (Math.abs(left) < 0.55 && ty >= -4.6 && ty <= 2.6) || (Math.abs(ty - 2.6) < 0.5 && Math.abs(px) <= 4.2);
  };
  if (x === 0 && y === 0) return spark ? "+" : "#";
  return edge(x, y, 1) ? "#" : edge(x, y, -1) ? "+" : ".";
});
const scatter = (seed: number): Frame => generated((x, y) => ((x * 7 + y * 13 + seed * 5) % 9 === 0) ? "+" : ".");
const BREATH = generated((_x, _y, r) => r < 0.6 ? "#" : r > 1.7 && r < 2.5 ? "+" : ".");
const BREATH_OUT = generated((_x, _y, r, a) => r < 0.6 ? "#" : r > 1.7 && r < 2.5 ? "+" : r > 4 && r < 4.9 && near(a, Math.PI / 4, 0, 0.3) ? "#" : ".");

/** ॐ, sampled from the Devanagari font in the browser so the shape matches the site's lettering. */
let omFrame: Frame | null = null;
function sampleOm(): Frame | null {
  if (omFrame || typeof document === "undefined") return omFrame;
  try {
    const size = 88; const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return null;
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-deva").trim() || "serif";
    context.fillStyle = "#000"; context.textAlign = "center"; context.textBaseline = "middle";
    context.font = `${size * 0.86}px ${family}, serif`; context.fillText("ॐ", size / 2, size * 0.56);
    const data = context.getImageData(0, 0, size, size).data; const cell = size / N;
    const frame = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => {
      let ink = 0;
      for (let sy = 0; sy < cell; sy += 2) for (let sx = 0; sx < cell; sx += 2) ink += data[(Math.floor(y * cell + sy) * size + Math.floor(x * cell + sx)) * 4 + 3];
      return ink / ((cell / 2) ** 2 * 255) > 0.3 ? "#" : ".";
    }).join(""));
    omFrame = frame.join("").includes("#") ? frame : null;
  } catch { omFrame = null; }
  return omFrame;
}

const SCENES: Scene[] = [
  { name: "trishula", frames: [TRISHULA, TRISHULA, TRISHULA_GLINT, TRISHULA], ms: 600 },
  { name: "lotus", frames: [LOTUS_BUD, LOTUS_HALF, LOTUS_FULL, LOTUS_FULL], ms: 650 },
  { name: "diya", frames: [DIYA_A, DIYA_B, DIYA_A, DIYA_C, DIYA_A, DIYA_B], ms: 420 },
  { name: "wheel", frames: [wheel(0), wheel(Math.PI / 16), wheel(Math.PI / 8), wheel(Math.PI * 3 / 16), wheel(0), wheel(Math.PI / 16), wheel(Math.PI / 8)], ms: 340 },
  { name: "damaru", frames: [DAMARU_A, DAMARU_B, DAMARU_A, DAMARU_C, DAMARU_A, DAMARU_B], ms: 360 },
  { name: "sunrise", frames: [sunrise(0), sunrise(1), sunrise(2), sunrise(3), sunrise(3)], ms: 520 },
  { name: "moon", frames: [moon(0), moon(1), moon(0), moon(1)], ms: 620 },
  { name: "kalash", frames: [KALASH], ms: 2300 },
  { name: "kailash", frames: [KAILASH], ms: 2300 },
  { name: "feather", frames: [FEATHER], ms: 2300 },
  { name: "feet", frames: [FEET_A, FEET_B, FEET_A, FEET_B], ms: 560 },
  { name: "book", frames: [book([2]), book([3]), book([4]), book([5]), book([6])], ms: 460 },
  { name: "ripple", frames: [ripple(0.4), ripple(1.3), ripple(2.2), ripple(0.4), ripple(1.3), ripple(2.2)], ms: 400 },
  { name: "mandala", frames: [mandala(0), mandala(Math.PI / 18), mandala(Math.PI / 9), mandala(Math.PI / 6), mandala(Math.PI * 2 / 9)], ms: 480 },
  { name: "yantra", frames: [yantra(false), yantra(true), yantra(false), yantra(true)], ms: 600 },
  { name: "om", frames: [], ms: 2400 },
];
const WAVE = [HAND_UP, HAND_LEFT, HAND_RIGHT, HAND_LEFT, HAND_RIGHT, HAND_UP];
const REST = [BREATH, BREATH_OUT];
export type GlyphMode = "wave" | "rest" | "think";

/** A shuffled order of scene indexes; the first never repeats the previous bag's last. */
function shuffledBag(previous: number | null) {
  const bag = SCENES.map((_, index) => index);
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  if (bag[0] === previous && bag.length > 1) [bag[0], bag[1]] = [bag[1], bag[0]];
  return bag;
}

export function DotGlyph({ mode, size = 48, label }: { mode: GlyphMode; size?: number; label?: string }) {
  const reduce = useReducedMotion();
  // The first frame is fixed so server and browser render the same markup.
  const [frame, setFrame] = useState<Frame>(mode === "think" ? TRISHULA : mode === "wave" ? HAND_UP : BREATH);
  const [resting, setResting] = useState(mode === "rest");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current = []; };
    const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
    clear();
    if (reduce) {
      later(() => { setFrame(mode === "think" ? LOTUS_FULL : BREATH); setResting(mode !== "think"); }, 0);
      return clear;
    }
    const rest = (step = 0) => { setResting(true); setFrame(REST[step % REST.length]); later(() => rest(step + 1), 1700); };
    if (mode === "rest") { later(() => rest(), 0); return clear; }
    if (mode === "wave") {
      const wave = (step: number) => {
        if (step >= WAVE.length) { later(() => rest(), 200); return; }
        setResting(false); setFrame(WAVE[step]); later(() => wave(step + 1), 300);
      };
      later(() => wave(0), 0);
      return clear;
    }
    // Thinking: scenes from a shuffle bag, each followed by a short scatter.
    let bag = shuffledBag(null);
    let last: number | null = null;
    const play = (position: number) => {
      if (position >= bag.length) { bag = shuffledBag(last); position = 0; }
      const index = bag[position]; last = index;
      const scene = SCENES[index];
      const frames = scene.name === "om" ? (sampleOm() ? [sampleOm()!] : []) : scene.frames;
      if (!frames.length) { play(position + 1); return; }
      setResting(false);
      frames.forEach((item, step) => later(() => setFrame(item), step * scene.ms));
      const duration = Math.max(2300, frames.length * scene.ms);
      later(() => setFrame(scatter(position)), duration);
      later(() => play(position + 1), duration + 380);
    };
    later(() => play(0), 0);
    return clear;
  }, [mode, reduce]);

  const shown = frame.length === N ? frame : blank();
  return <svg className={`dot-glyph${resting ? " is-rest" : ""}`} width={size} height={size} viewBox="0 0 110 110" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {Array.from({ length: N * N }, (_, index) => {
      const x = index % N; const y = Math.floor(index / N);
      const cell = shown[y]?.[x] ?? ".";
      return <circle key={index} cx={5 + x * 10} cy={5 + y * 10} r={cell === "." ? 1.3 : 3.8}
        className={cell === "#" ? "on" : cell === "+" ? "on alt" : "off"}
        style={{ transitionDelay: `${Math.round(Math.hypot(x - C, y - C) * 20)}ms` }} />;
    })}
  </svg>;
}
