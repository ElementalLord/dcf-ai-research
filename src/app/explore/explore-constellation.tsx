"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number; radius: number; phase: number; speed: number };

export function ExploreConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: -1000, y: -1000 };
    let width = 0;
    let height = 0;
    let frame = 0;
    let points: Point[] = [];

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(24, Math.min(48, Math.round(width / 34)));
      points = Array.from({ length: count }, (_, index) => ({
        x: ((index * 83) % 997) / 997 * width,
        y: ((index * 149 + 43) % 991) / 991 * height,
        radius: 0.7 + (index % 4) * 0.35,
        phase: index * 0.73,
        speed: 0.00015 + (index % 5) * 0.000025,
      }));
    };

    const draw = (time = 0) => {
      context.clearRect(0, 0, width, height);
      const positions = points.map((point) => ({
        ...point,
        px: point.x + Math.sin(time * point.speed + point.phase) * 13,
        py: point.y + Math.cos(time * point.speed * .8 + point.phase) * 9,
      }));
      for (let left = 0; left < positions.length; left += 1) {
        const point = positions[left];
        for (let right = left + 1; right < positions.length; right += 1) {
          const neighbor = positions[right];
          const distance = Math.hypot(point.px - neighbor.px, point.py - neighbor.py);
          if (distance > 145) continue;
          context.beginPath();
          context.moveTo(point.px, point.py);
          context.lineTo(neighbor.px, neighbor.py);
          context.strokeStyle = `rgba(147, 176, 235, ${.08 * (1 - distance / 145)})`;
          context.lineWidth = .7;
          context.stroke();
        }
        const pointerDistance = Math.hypot(point.px - pointer.x, point.py - pointer.y);
        const nearby = pointerDistance < 170;
        context.beginPath();
        context.arc(point.px, point.py, point.radius + (nearby ? 1.1 : 0), 0, Math.PI * 2);
        context.fillStyle = nearby ? "rgba(205, 216, 255, .72)" : "rgba(170, 191, 239, .28)";
        context.fill();
      }
      if (!reducedMotion) frame = window.requestAnimationFrame(draw);
    };

    const move = (event: PointerEvent) => { pointer.x = event.clientX; pointer.y = event.clientY; };
    const leave = () => { pointer.x = -1000; pointer.y = -1000; };
    resize();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, []);

  return <canvas ref={canvasRef} className="explore-constellation" aria-hidden="true" />;
}
