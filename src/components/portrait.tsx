"use client";
import { useState } from "react";

export type PortraitData = { src: string; author: string; license: string; source: string };

function initials(name: string) {
  const words = name.replace(/\./g, " ").split(/\s+/).filter((word) => word && !["of", "the"].includes(word.toLowerCase()));
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/**
 * A round portrait with a category-coloured ring. Falls back to initials when there is no image or
 * the image fails to load. Images come from Wikimedia Commons; credit is shown on the profile page.
 */
export function Portrait({ name, portrait, category, size = 56, className = "" }: { name: string; portrait?: PortraitData | null; category?: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = portrait && !failed;
  return <span className={`portrait${category ? ` cat-${category}` : ""}${showImage ? "" : " portrait-empty"} ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
    {showImage
      // eslint-disable-next-line @next/next/no-img-element -- Wikimedia thumbnails are already sized; no optimiser needed.
      ? <img src={portrait.src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : initials(name)}
  </span>;
}
