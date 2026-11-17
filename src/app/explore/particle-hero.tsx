"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Arrow, Lotus } from "@/components/vedic-icons";

type Particle = { x: number; y: number; vx: number; vy: number; tx: number; ty: number; size: number; ts: number; tone: number; tt: number; seed: number };
type Target = { x: number; y: number; size: number; tone: number };
type Draw = (c: CanvasRenderingContext2D) => void;

/** Each symbol is drawn into a 100 × 100 box; the particles take the shape of the ink. */
const SYMBOLS: Array<{ id: string; deva: string; name: string; meaning: string; draw: Draw | "om" }> = [
  { id: "om", deva: "ॐ", name: "Om", meaning: "The sound from which, tradition says, all others arise", draw: "om" },
  { id: "padma", deva: "पद्म", name: "Padma · lotus", meaning: "Purity rising out of muddy water", draw: (c) => {
    const petal = (cx: number, base: number, tip: number, width: number, lean = 0) => {
      c.beginPath(); c.moveTo(cx, base);
      c.bezierCurveTo(cx - width, base - (base - tip) * 0.45, cx - width * 0.4 + lean, tip + 10, cx + lean, tip);
      c.bezierCurveTo(cx + width * 0.4 + lean, tip + 10, cx + width, base - (base - tip) * 0.45, cx, base); c.fill();
    };
    petal(50, 74, 14, 15);
    c.save(); c.translate(50, 74); c.rotate(-0.62); petal(0, 0, -50, 12); c.restore();
    c.save(); c.translate(50, 74); c.rotate(0.62); petal(0, 0, -50, 12); c.restore();
    c.save(); c.translate(50, 76); c.rotate(-1.15); petal(0, 0, -40, 9); c.restore();
    c.save(); c.translate(50, 76); c.rotate(1.15); petal(0, 0, -40, 9); c.restore();
    c.fillRect(18, 82, 64, 5); c.fillRect(30, 91, 40, 4);
  } },
  { id: "trishula", deva: "त्रिशूल", name: "Trishula", meaning: "The trident of Shiva: creation, preservation, dissolution", draw: (c) => {
    c.lineCap = "round"; c.lineJoin = "round"; c.lineWidth = 7;
    c.beginPath(); c.moveTo(50, 22); c.lineTo(50, 95); c.stroke();
    c.beginPath(); c.moveTo(20, 18); c.bezierCurveTo(18, 44, 32, 54, 50, 54); c.bezierCurveTo(68, 54, 82, 44, 80, 18); c.stroke();
    for (const x of [20, 50, 80]) { c.beginPath(); c.moveTo(x - 7, x === 50 ? 26 : 24); c.lineTo(x, 4); c.lineTo(x + 7, x === 50 ? 26 : 24); c.closePath(); c.fill(); }
    c.fillRect(38, 64, 24, 6); c.fillRect(41, 74, 18, 5);
  } },
  { id: "chakra", deva: "धर्मचक्र", name: "Dharma chakra", meaning: "The wheel of right conduct, with twenty-four spokes", draw: (c) => {
    c.lineWidth = 6; c.beginPath(); c.arc(50, 50, 43, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2.6;
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; c.beginPath(); c.moveTo(50 + 9 * Math.cos(a), 50 + 9 * Math.sin(a)); c.lineTo(50 + 41 * Math.cos(a), 50 + 41 * Math.sin(a)); c.stroke(); }
    c.beginPath(); c.arc(50, 50, 9, 0, Math.PI * 2); c.fill();
  } },
  { id: "deepa", deva: "दीप", name: "Deepa · lamp", meaning: "Light that drives out ignorance", draw: (c) => {
    c.beginPath(); c.moveTo(50, 6); c.bezierCurveTo(62, 22, 64, 34, 58, 42); c.bezierCurveTo(54, 47, 46, 47, 42, 42); c.bezierCurveTo(36, 34, 38, 22, 50, 6); c.fill();
    c.beginPath(); c.moveTo(8, 58); c.lineTo(92, 58); c.bezierCurveTo(88, 76, 70, 86, 50, 86); c.bezierCurveTo(30, 86, 12, 76, 8, 58); c.fill();
    c.beginPath(); c.moveTo(90, 58); c.lineTo(98, 50); c.lineTo(94, 62); c.fill();
    c.fillRect(46, 86, 8, 6); c.fillRect(30, 92, 40, 5);
  } },
  { id: "shankha", deva: "शङ्ख", name: "Shankha · conch", meaning: "The call that announces an auspicious beginning", draw: (c) => {
    c.beginPath(); c.moveTo(20, 80);
    c.bezierCurveTo(4, 56, 12, 20, 46, 12); c.bezierCurveTo(78, 6, 96, 32, 86, 54); c.bezierCurveTo(80, 68, 62, 70, 56, 62);
    c.bezierCurveTo(70, 56, 72, 40, 60, 34); c.bezierCurveTo(46, 28, 34, 40, 38, 54); c.bezierCurveTo(42, 66, 56, 76, 72, 78);
    c.lineTo(30, 92); c.closePath(); c.fill();
    c.globalCompositeOperation = "destination-out"; c.lineWidth = 3; c.beginPath(); c.arc(60, 46, 7, 0, Math.PI * 1.6); c.stroke(); c.globalCompositeOperation = "source-over";
  } },
  { id: "veena", deva: "वीणा", name: "Veena", meaning: "The instrument of Saraswati, goddess of learning", draw: (c) => {
    c.beginPath(); c.arc(72, 72, 22, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(20, 20, 13, 0, Math.PI * 2); c.fill();
    c.lineWidth = 9; c.lineCap = "round"; c.beginPath(); c.moveTo(26, 26); c.lineTo(62, 62); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(8, 8); c.lineTo(2, 2); c.stroke();
    c.globalCompositeOperation = "destination-out"; c.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) { const t = 30 + i * 5.4; c.beginPath(); c.moveTo(t - 4, t + 4); c.lineTo(t + 4, t - 4); c.stroke(); }
    c.globalCompositeOperation = "source-over";
  } },
];
const TONES = ["--brand-accent", "--dot-spiritual", "--brand-text", "--brand-muted"];
const HOLD_MS = 4600;
const DRIFT_MS = 1700;

/** Points on a grid where the offscreen drawing has ink. */
function sample(box: { x: number; y: number; size: number }, step: number, paint: (c: CanvasRenderingContext2D, size: number) => void): Target[] {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.max(1, Math.round(box.size));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.fillStyle = "#000"; context.strokeStyle = "#000";
  paint(context, canvas.width);
  let data: Uint8ClampedArray;
  try { data = context.getImageData(0, 0, canvas.width, canvas.height).data; } catch { return []; }
  const targets: Target[] = [];
  for (let y = 0; y < canvas.height; y += step) for (let x = 0; x < canvas.width; x += step) {
    const jx = Math.min(canvas.width - 1, Math.round(x + (Math.random() - 0.5) * step * 0.6));
    const jy = Math.min(canvas.height - 1, Math.round(y + (Math.random() - 0.5) * step * 0.6));
    if (data[(jy * canvas.width + jx) * 4 + 3] > 120) {
      const roll = Math.random();
      targets.push({ x: box.x + jx, y: box.y + jy, size: 1.5 + Math.random() * 0.9, tone: roll < 0.7 ? 0 : roll < 0.9 ? 1 : 2 });
    }
  }
  return targets;
}

/**
 * The opening of the site: a soft field of dots that gathers into a sacred symbol, holds, drifts
 * gently apart, and slowly settles into the next one (ॐ, lotus, trishula, dharma chakra, lamp,
 * conch, veena). The pointer parts the dots; a click moves on to the next symbol.
 */
export function ParticleHero() {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const advance = useRef<() => void>(() => {});
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const host = stage.current; const element = canvas.current;
    if (!host || !element) return;
    const context = element.getContext("2d");
    if (!context) return;
    let width = 0; let height = 0;
    let tones: string[] = [];
    let particles: Particle[] = [];
    let scenes: Target[][] = [];
    let index = 0; let phase: "gather" | "hold" | "drift" = "gather"; let phaseStart = performance.now();
    const pointer = { x: -9999, y: -9999, active: false };
    let frame = 0; let visible = true; let cancelled = false;

    const readTones = () => { const style = getComputedStyle(document.documentElement); tones = TONES.map((name) => style.getPropertyValue(name).trim() || "#999"); };
    /** The square the symbol fills: right of the text on wide screens, the whole stage on phones. Never past an edge. */
    const symbolBox = () => {
      if (width <= 860) { const size = Math.min(width - 48, height - 32); return { x: (width - size) / 2, y: (height - size) / 2, size }; }
      const shell = Math.min(width - 48, 1280);
      const textRight = (width - shell) / 2 + 540;
      const room = width - textRight - 40;
      const size = Math.max(220, Math.min(height * 0.8, room - 24));
      return { x: textRight + (room - size) / 2, y: (height - size) / 2, size };
    };
    const build = () => {
      const box = symbolBox();
      const step = Math.max(4, Math.round(box.size / 110));
      const family = getComputedStyle(document.documentElement).getPropertyValue("--font-deva").trim() || "serif";
      scenes = SYMBOLS.map((symbol) => sample(box, step, (c, size) => {
        if (symbol.draw === "om") {
          c.font = `100px ${family}, serif`;
          const ink = c.measureText("ॐ");
          const inkW = (ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight) || ink.width;
          const inkH = (ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent) || 100;
          const fontSize = 100 * Math.min((size * 0.92) / inkW, (size * 0.92) / inkH);
          c.font = `${fontSize}px ${family}, serif`;
          const scaled = c.measureText("ॐ");
          c.fillText("ॐ", (size - (scaled.actualBoundingBoxLeft + scaled.actualBoundingBoxRight)) / 2 + scaled.actualBoundingBoxLeft,
            (size - (scaled.actualBoundingBoxAscent + scaled.actualBoundingBoxDescent)) / 2 + scaled.actualBoundingBoxAscent);
        } else {
          c.save(); c.scale(size / 100, size / 100); symbol.draw(c); c.restore();
        }
      }));
    };
    const assign = (targets: Target[]) => {
      const shuffled = [...targets].sort(() => Math.random() - 0.5);
      particles.forEach((particle, i) => {
        const target = shuffled[i];
        if (target) { particle.tx = target.x; particle.ty = target.y; particle.ts = target.size; particle.tt = target.tone; }
        else {
          // Spare dots rest as faint dust scattered across the stage.
          particle.tx = Math.random() * width; particle.ty = Math.random() * height; particle.ts = 0.7; particle.tt = 3;
        }
      });
    };
    /** Dots ease a short way outward from the symbol's centre, as if exhaling, before the next one forms. */
    const drift = () => {
      const box = symbolBox(); const cx = box.x + box.size / 2; const cy = box.y + box.size / 2;
      for (const particle of particles) {
        const dx = particle.x - cx; const dy = particle.y - cy; const d = Math.hypot(dx, dy) + 1;
        const push = 30 + Math.random() * 70;
        particle.tx = particle.x + (dx / d) * push + (Math.random() - 0.5) * 40;
        particle.ty = particle.y + (dy / d) * push + (Math.random() - 0.5) * 40;
        particle.ts = Math.max(0.8, particle.ts * 0.8);
      }
    };
    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = rect.width; height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * dpr); element.height = Math.round(height * dpr);
      element.style.width = `${width}px`; element.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = width < 640 ? 1500 : 2600;
      if (particles.length !== count) particles = Array.from({ length: count }, () => ({
        x: Math.random() * width, y: Math.random() * height, vx: 0, vy: 0, tx: 0, ty: 0,
        size: 0.8, ts: 0.8, tone: 3, tt: 3, seed: Math.random() * Math.PI * 2,
      }));
      build();
      assign(scenes[index]);
    };
    const show = (next: number) => { index = next; assign(scenes[index]); phase = "gather"; phaseStart = performance.now(); setCurrent(index); };
    advance.current = () => { if (phase !== "drift") { drift(); phase = "drift"; phaseStart = performance.now(); } };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!visible) return;
      const elapsed = now - phaseStart;
      if (phase === "gather" && elapsed > 2600) { phase = "hold"; phaseStart = now; }
      else if (phase === "hold" && elapsed > HOLD_MS) { drift(); phase = "drift"; phaseStart = now; }
      else if (phase === "drift" && elapsed > DRIFT_MS) show((index + 1) % scenes.length);
      const t = now / 1000;
      context.clearRect(0, 0, width, height);
      const buckets: Particle[][] = tones.map(() => []);
      // A soft spring: low pull and strong damping, so dots glide rather than snap.
      const pull = phase === "drift" ? 0.012 : 0.016;
      for (const particle of particles) {
        particle.vx += (particle.tx - particle.x) * pull; particle.vy += (particle.ty - particle.y) * pull;
        particle.vx *= 0.86; particle.vy *= 0.86;
        if (pointer.active) {
          const dx = particle.x - pointer.x; const dy = particle.y - pointer.y; const d2 = dx * dx + dy * dy;
          if (d2 < 6400) { const d = Math.sqrt(d2) + 0.01; const push = ((6400 - d2) / 6400) * 0.9; particle.vx += (dx / d) * push; particle.vy += (dy / d) * push; }
        }
        particle.x += particle.vx + Math.sin(t * 0.9 + particle.seed) * 0.05;
        particle.y += particle.vy + Math.cos(t * 0.8 + particle.seed) * 0.05;
        particle.size += (particle.ts - particle.size) * 0.05;
        buckets[particle.tt]?.push(particle);
      }
      buckets.forEach((bucket, tone) => {
        context.fillStyle = tones[tone]; context.globalAlpha = tone === 3 ? 0.35 : 0.9;
        context.beginPath();
        for (const particle of bucket) { context.moveTo(particle.x + particle.size, particle.y); context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); }
        context.fill();
      });
      context.globalAlpha = 1;
    };
    const drawStatic = () => {
      context.clearRect(0, 0, width, height);
      (scenes[0] || []).forEach((target) => { context.fillStyle = tones[target.tone]; context.beginPath(); context.arc(target.x, target.y, target.size, 0, Math.PI * 2); context.fill(); });
    };

    const start = async () => {
      await document.fonts?.ready.catch(() => undefined);
      if (cancelled) return;
      readTones(); resize();
      if (reduce) { drawStatic(); return; }
      phaseStart = performance.now();
      frame = requestAnimationFrame(draw);
    };
    start();

    const onResize = () => { resize(); if (reduce) drawStatic(); };
    const onMove = (event: PointerEvent) => { const rect = host.getBoundingClientRect(); pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top; pointer.active = true; };
    const onLeave = () => { pointer.active = false; };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && !document.hidden; }, { threshold: 0.05 });
    const onVisibility = () => { visible = !document.hidden; };
    const themeWatch = new MutationObserver(() => { readTones(); if (reduce) drawStatic(); });
    window.addEventListener("resize", onResize);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    observer.observe(host);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      themeWatch.disconnect();
    };
  }, [reduce]);

  const symbol = SYMBOLS[current];
  return <section className="ph" aria-labelledby="hero-title">
    <div className="ph-stage" ref={stage} onClick={() => advance.current()}>
      <canvas ref={canvas} className="ph-canvas" aria-hidden="true" />
    </div>
    <div className="ph-copy">
      <p className="ph-eyebrow"><span lang="sa" className="ph-deva">प्रेरणा</span><span aria-hidden="true">·</span>Dharma Civilization Foundation</p>
      <h1 id="hero-title" className="ph-title">Inspiring <em>Personalities</em></h1>
      <p className="ph-lede">Sages, scientists, rulers, reformers and artists who shaped Indian civilization, each with the evidence behind every claim.</p>
      <p className="ph-figure" key={symbol.id} aria-live="polite">
        <span lang="sa" className="ph-figure-deva">{symbol.deva}</span>
        <strong>{symbol.name}</strong>
        <small>{symbol.meaning}</small>
      </p>
      <div className="ph-actions">
        <a href="#collection-title" className="key key-hot key-lg">Explore the lives<Arrow size={16} /></a>
        <Link href="/ai" className="key key-lg"><Lotus size={18} />Ask the guide</Link>
      </div>
    </div>
  </section>;
}
