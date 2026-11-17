"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { PortraitData } from "@/components/portrait";
import { Arrow, Lotus } from "@/components/vedic-icons";

export type HeroFigure = { slug: string; name: string; role: string; deva: string; portrait: PortraitData | null };

type Particle = { x: number; y: number; vx: number; vy: number; tx: number; ty: number; size: number; tone: number; ts: number; tt: number };
type Target = { x: number; y: number; size: number; tone: number };
type Palette = { tones: string[]; bg: string };

const TONES = ["--brand-text", "--brand-accent", "--dot-spiritual", "--brand-muted", "--dot-sages", "--dot-scientists"];
const HOLD_MS = 3600;
const SWIRL_MS = 1100;

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  return { tones: TONES.map((name) => style.getPropertyValue(name).trim() || "#333"), bg: style.getPropertyValue("--brand-bg").trim() || "#f7f2ea" };
}

/** Points on a grid where the offscreen drawing has ink, darker cells giving larger dots. */
function sampleCanvas(draw: (context: CanvasRenderingContext2D, width: number, height: number) => boolean, box: { x: number; y: number; w: number; h: number }, step: number, mode: "text" | "photo", onDark = false, background: { value: number | null } = { value: null }): Target[] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(box.w)); canvas.height = Math.max(1, Math.round(box.h));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !draw(context, canvas.width, canvas.height)) return [];
  let data: Uint8ClampedArray;
  try { data = context.getImageData(0, 0, canvas.width, canvas.height).data; } catch { return []; }
  const targets: Target[] = [];
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const jx = Math.min(canvas.width - 1, Math.round(x + (Math.random() - 0.5) * step * 0.5));
      const jy = Math.min(canvas.height - 1, Math.round(y + (Math.random() - 0.5) * step * 0.5));
      const i = (jy * canvas.width + jx) * 4;
      if (mode === "text") {
        if (data[i + 3] > 120) targets.push({ x: box.x + jx, y: box.y + jy, size: 1.6 + Math.random() * 0.6, tone: Math.random() < 0.22 ? 2 : Math.random() < 0.12 ? 0 : 1 });
      } else {
        if (data[i + 3] < 40) continue;
        const light = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        // On a light page dark areas get the biggest dots; on a dark page bright areas do, so the face never reads as a negative.
        // Skip pixels close to the photo's own background so only the person is drawn.
        if (background.value !== null && Math.abs(light - background.value) < 0.1) continue;
        const dark = onDark ? light : 1 - light;
        if (dark < 0.16 || Math.random() > 0.35 + dark) continue;
        targets.push({ x: box.x + jx, y: box.y + jy, size: 0.55 + dark * 2.15, tone: dark > 0.62 ? 0 : dark > 0.4 ? 1 : dark > 0.27 ? 2 : 3 });
      }
    }
  }
  return targets;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * The opening of the site: a field of particles that bursts open, gathers into ॐ, and then flows
 * from one well-known face to the next. Faces are halftones sampled from each person's portrait;
 * when a portrait cannot be read, the particles spell the person's name in Devanagari instead.
 * The pointer pushes particles aside; a click moves on to the next figure.
 */
export function ParticleHero({ figures }: { figures: HeroFigure[] }) {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const advance = useRef<() => void>(() => {});
  const [current, setCurrent] = useState(-1);

  useEffect(() => {
    const host = stage.current; const element = canvas.current;
    if (!host || !element) return;
    const context = element.getContext("2d");
    if (!context) return;
    let width = 0; let height = 0; let dpr = 1;
    let palette = readPalette();
    let particles: Particle[] = [];
    let scenes: Array<{ figure: number; targets: Target[] }> = [];
    let sceneIndex = -1; let phase: "burst" | "form" | "swirl" = "burst"; let phaseStart = performance.now();
    const pointer = { x: -9999, y: -9999, active: false };
    let frame = 0; let visible = true; let cancelled = false;
    const images = new Map<string, HTMLImageElement | null>();

    const portraitBox = () => {
      const wide = width > 860;
      // On phones the stage sits above the text and the face fills it.
      const h = wide ? height * 0.86 : height * 0.94;
      const w = Math.min(h * 0.82, width - 24);
      return wide ? { x: width * 0.72 - w / 2, y: (height - h) / 2, w, h } : { x: (width - w) / 2, y: height * 0.03, w, h };
    };
    const textBox = () => {
      // Centred on the portrait area but never past the edges of the stage.
      const box = portraitBox(); const centre = box.x + box.w / 2;
      const w = Math.min(box.w * 1.5, 2 * (width - centre) - 48, 2 * centre - 48);
      return { x: centre - w / 2, y: box.y + box.h * 0.22, w, h: box.h * 0.56 };
    };
    const step = () => Math.max(4, Math.round(Math.min(width, 1400) / 210));

    const textTargets = (text: string) => {
      const box = textBox();
      return sampleCanvas((c, w, h) => {
        const family = getComputedStyle(document.documentElement).getPropertyValue("--font-deva").trim() || "serif";
        let size = h * 0.8;
        c.font = `${size}px ${family}, serif`;
        const measured = c.measureText(text).width;
        if (measured > w * 0.94) size *= (w * 0.94) / measured;
        c.font = `${size}px ${family}, serif`; c.fillStyle = "#000"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(text, w / 2, h * 0.56);
        return true;
      }, box, Math.max(3, step() - 1), "text");
    };
    const photoTargets = (image: HTMLImageElement) => {
      const box = portraitBox();
      const background = { value: null as number | null };
      return sampleCanvas((c, w, h) => {
        // Cover-crop, favouring the upper part of the photo where the face usually is.
        const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
        const dw = image.naturalWidth * scale; const dh = image.naturalHeight * scale;
        c.drawImage(image, (w - dw) / 2, Math.min(0, (h - dh) * 0.2), dw, dh);
        // The top corners are almost always backdrop; their average brightness is treated as empty space.
        try {
          const patch = Math.max(4, Math.round(w * 0.08)); let sum = 0; let count = 0;
          for (const px of [0, w - patch]) {
            const pixels = c.getImageData(px, 0, patch, patch).data;
            for (let i = 0; i < pixels.length; i += 16) { sum += (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255; count++; }
          }
          background.value = count ? sum / count : null;
        } catch { background.value = null; }
        // Soft oval vignette so the face sits inside a medallion rather than a hard rectangle.
        c.globalCompositeOperation = "destination-in";
        c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.5, h * 0.5, 0, 0, Math.PI * 2); c.fill();
        return true;
      }, box, step(), "photo", document.documentElement.dataset.theme === "dark", background);
    };

    const buildScenes = () => {
      const built: Array<{ figure: number; targets: Target[] }> = [{ figure: -1, targets: textTargets("ॐ") }];
      figures.forEach((figure, index) => {
        const image = figure.portrait ? images.get(figure.portrait.src) : null;
        const targets = image ? photoTargets(image) : [];
        built.push({ figure: index, targets: targets.length > 300 ? targets : textTargets(figure.deva) });
      });
      scenes = built.filter((scene) => scene.targets.length);
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = rect.width; height = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * dpr); element.height = Math.round(height * dpr);
      element.style.width = `${width}px`; element.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = width < 640 ? 1400 : 2600;
      if (particles.length !== count) {
        particles = Array.from({ length: count }, () => {
          const angle = Math.random() * Math.PI * 2; const speed = 4 + Math.random() * 10;
          return { x: width / 2, y: height / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, tx: width / 2, ty: height / 2, size: 0.6 + Math.random() * 1.4, tone: Math.floor(Math.random() * 4), ts: 1, tt: 1 };
        });
      }
      buildScenes();
      if (sceneIndex >= 0) assign(scenes[sceneIndex % scenes.length]);
    };

    const assign = (scene: { figure: number; targets: Target[] } | undefined) => {
      if (!scene) return;
      const targets = [...scene.targets].sort(() => Math.random() - 0.5);
      particles.forEach((particle, index) => {
        const target = targets[index];
        if (target) { particle.tx = target.x; particle.ty = target.y; particle.ts = target.size; particle.tt = target.tone; }
        else {
          // Spare particles drift as faint dust around the edges.
          const angle = Math.random() * Math.PI * 2; const radius = Math.max(width, height) * (0.45 + Math.random() * 0.25);
          particle.tx = width / 2 + Math.cos(angle) * radius; particle.ty = height / 2 + Math.sin(angle) * radius * 0.6; particle.ts = 0.5; particle.tt = 3;
        }
      });
    };

    const next = () => {
      if (!scenes.length) return;
      sceneIndex = (sceneIndex + 1) % scenes.length;
      // After the first pass, skip ॐ so the faces keep flowing.
      if (sceneIndex === 0 && scenes.length > 1 && phase !== "burst") sceneIndex = 1;
      phase = "swirl"; phaseStart = performance.now();
      setCurrent(-2);
    };
    advance.current = () => { if (phase === "form") next(); };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!visible) return;
      const elapsed = now - phaseStart;
      if (phase === "burst" && elapsed > 900) { sceneIndex = 0; assign(scenes[0]); phase = "form"; phaseStart = now; setCurrent(scenes[0]?.figure ?? -1); }
      else if (phase === "swirl" && elapsed > SWIRL_MS) { assign(scenes[sceneIndex]); phase = "form"; phaseStart = now; setCurrent(scenes[sceneIndex]?.figure ?? -1); }
      else if (phase === "form" && elapsed > (sceneIndex === 0 ? 2400 : HOLD_MS)) next();

      context.clearRect(0, 0, width, height);
      const cx = width / 2; const cy = height / 2; const t = now / 1000;
      const buckets: Array<Array<Particle>> = palette.tones.map(() => []);
      for (const particle of particles) {
        if (phase === "burst") { particle.vx *= 0.94; particle.vy *= 0.94; }
        else if (phase === "swirl") {
          // A spiral flow around the centre, like a breath before the next face.
          const dx = particle.x - cx; const dy = particle.y - cy; const distance = Math.hypot(dx, dy) + 1;
          particle.vx += (-dy / distance) * 0.55 + (-dx / distance) * 0.12 + Math.sin(t * 2 + particle.y * 0.01) * 0.08;
          particle.vy += (dx / distance) * 0.55 + (-dy / distance) * 0.12 + Math.cos(t * 2 + particle.x * 0.01) * 0.08;
          particle.vx *= 0.93; particle.vy *= 0.93;
        } else {
          particle.vx += (particle.tx - particle.x) * 0.045; particle.vy += (particle.ty - particle.y) * 0.045;
          particle.vx *= 0.8; particle.vy *= 0.8;
          particle.x += Math.sin(t * 1.3 + particle.ty * 0.05) * 0.06;
        }
        if (pointer.active) {
          const dx = particle.x - pointer.x; const dy = particle.y - pointer.y; const d2 = dx * dx + dy * dy;
          if (d2 < 7000) { const push = (7000 - d2) / 7000 * 2.4; const d = Math.sqrt(d2) + 0.01; particle.vx += (dx / d) * push; particle.vy += (dy / d) * push; }
        }
        particle.x += particle.vx; particle.y += particle.vy;
        particle.size += ((phase === "form" ? particle.ts : 0.9) - particle.size) * 0.12;
        buckets[phase === "form" ? particle.tt : particle.tone % palette.tones.length].push(particle);
      }
      buckets.forEach((bucket, tone) => {
        context.fillStyle = palette.tones[tone];
        context.globalAlpha = tone === 3 ? 0.55 : 0.92;
        context.beginPath();
        for (const particle of bucket) { context.moveTo(particle.x + particle.size, particle.y); context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); }
        context.fill();
      });
      context.globalAlpha = 1;
    };

    const drawStatic = () => {
      // Reduced motion: show the first face (or ॐ) as a still halftone.
      const scene = scenes[1] ?? scenes[0];
      context.clearRect(0, 0, width, height);
      if (!scene) return;
      scene.targets.forEach((target) => { context.fillStyle = palette.tones[target.tone]; context.beginPath(); context.arc(target.x, target.y, target.size, 0, Math.PI * 2); context.fill(); });
      setCurrent(scene.figure);
    };

    const start = async () => {
      await document.fonts?.ready.catch(() => undefined);
      await Promise.all(figures.map(async (figure) => { if (figure.portrait) images.set(figure.portrait.src, await loadImage(figure.portrait.src)); }));
      if (cancelled) return;
      resize();
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
    const themeWatch = new MutationObserver(() => { palette = readPalette(); resize(); if (reduce) drawStatic(); });
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
  }, [figures, reduce]);

  const figure = current >= 0 ? figures[current] : null;
  return <section className="ph" aria-labelledby="hero-title">
    <div className="ph-stage" ref={stage} onClick={() => advance.current()}>
      <canvas ref={canvas} className="ph-canvas" aria-hidden="true" />
    </div>
    <div className="ph-copy">
      <p className="ph-eyebrow"><span lang="sa" className="ph-deva">प्रेरणा</span><span aria-hidden="true">·</span>Dharma Civilization Foundation</p>
      <h1 id="hero-title" className="ph-title">Inspiring <em>Personalities</em></h1>
      <p className="ph-lede">Sages, scientists, rulers, reformers and artists who shaped Indian civilization, each with the evidence behind every claim.</p>
      <div className="ph-caption" aria-live="polite">
        {figure
          ? <Link key={figure.slug} href={`/explore/${figure.slug}`} className="ph-figure"><span lang="sa" className="ph-figure-deva">{figure.deva}</span><strong>{figure.name}</strong><small>{figure.role}</small></Link>
          : <span key="om" className="ph-figure ph-figure-om"><span lang="sa" className="ph-figure-deva">ॐ</span><small>{current === -2 ? "" : "Twenty-five lives, one thread"}</small></span>}
      </div>
      <div className="ph-actions">
        <a href="#collection-title" className="key key-hot key-lg">Explore the lives<Arrow size={16} /></a>
        <Link href="/ai" className="key key-lg"><Lotus size={18} />Ask the guide</Link>
      </div>
    </div>
  </section>;
}
