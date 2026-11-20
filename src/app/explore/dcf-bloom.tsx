/**
 * The DCF lotus as a living emblem for the top of the home page: a painted lotus, seen from the side, that opens
 * from a closed bud and folds back on a slow loop. Three rings of petals (outer first, inner last) fan out from
 * one base point; each petal is shaded from a cream heart to a pink tip and carries faint veins. A golden seed pod
 * and stamens appear as it opens, and rings spread on the water beneath.
 *
 * Every petal stores its open and closed angle in CSS custom properties; one keyframe set (lb-petal in
 * explore.css) moves them all. The open flower is the resting state, so with reduced motion it simply stays open.
 */

const BASE = { x: 100, y: 128 };

type Ring = { name: string; angles: number[]; length: number; width: number; closed: number; squeeze: number; fill: string; delay: number };
// Back to front. `closed` is the fraction of the open angle a petal keeps while in bud.
const RINGS: Ring[] = [
  { name: "back", angles: [-82, -50, -17, 17, 50, 82], length: 60, width: 25, closed: 0.07, squeeze: 0.5, fill: "url(#lb-back)", delay: 0.9 },
  { name: "mid", angles: [-64, -32, 0, 32, 64], length: 66, width: 29, closed: 0.05, squeeze: 0.5, fill: "url(#lb-mid)", delay: 0.45 },
  { name: "front", angles: [-106, -72, -38, 38, 72, 106], length: 47, width: 30, closed: 0.12, squeeze: 0.58, fill: "url(#lb-front)", delay: 0 },
];

/** A lotus petal standing on its base at (0,0): full in the body, narrowing to a fine, slightly drawn-out tip. */
const petal = (l: number, w: number) =>
  `M0 0C${w * 0.42} ${-l * 0.06} ${w * 0.6} ${-l * 0.42} ${w * 0.36} ${-l * 0.72}C${w * 0.22} ${-l * 0.88} ${w * 0.06} ${-l * 0.97} 0 ${-l}`
  + `C${-w * 0.06} ${-l * 0.97} ${-w * 0.22} ${-l * 0.88} ${-w * 0.36} ${-l * 0.72}C${-w * 0.6} ${-l * 0.42} ${-w * 0.42} ${-l * 0.06} 0 0Z`;

/** Faint veins running from the base toward the tip. */
const veins = (l: number, w: number) =>
  [-0.5, -0.25, 0, 0.25, 0.5].map((k) => `M0 ${-l * 0.04}Q${k * w * 0.62} ${-l * 0.45} ${k * w * 0.2} ${-l * 0.9}`).join("");

const STAMENS = Array.from({ length: 13 }, (_, i) => -54 + i * 9);
const SEEDS = [[-6, -1], [0, -2.2], [6, -1], [-3, 1.4], [3, 1.4]];

export function DcfBloom({ className = "" }: { className?: string }) {
  const ring = (r: Ring) => (
    <g className={`lb-ring lb-${r.name}`} style={{ ["--lb-delay" as string]: `${r.delay}s` }}>
      {r.angles.map((a) => (
        <g key={a} className="lb-petal" style={{ ["--o" as string]: `${a}deg`, ["--o2" as string]: `${a * 1.05}deg`, ["--c" as string]: `${a * r.closed}deg`, ["--cs" as string]: r.squeeze }}>
          <path className="lb-petal-body" d={petal(r.length, r.width)} fill={r.fill} />
          <path className="lb-vein" d={veins(r.length, r.width)} />
        </g>
      ))}
    </g>
  );
  return (
    <svg className={`lb ${className}`} viewBox="0 0 200 165" aria-hidden="true" focusable="false">
      <defs>
        {/* each petal: cream heart at the base, blushing to pink at the tip; the back ring is a shade deeper */}
        <linearGradient id="lb-front" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff8f1" /><stop offset="0.45" stopColor="#fbd9d3" /><stop offset="1" stopColor="#ea8f96" />
        </linearGradient>
        <linearGradient id="lb-mid" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff3ea" /><stop offset="0.5" stopColor="#f6c2c0" /><stop offset="1" stopColor="#df7381" />
        </linearGradient>
        <linearGradient id="lb-back" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f6d9d2" /><stop offset="0.55" stopColor="#e9a3a8" /><stop offset="1" stopColor="#c95a6c" />
        </linearGradient>
        <radialGradient id="lb-pod" cx="0.45" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#fbe3a0" /><stop offset="0.7" stopColor="#e6b553" /><stop offset="1" stopColor="#bf8a33" />
        </radialGradient>
        <radialGradient id="lb-halo">
          <stop offset="0" stopColor="#f3a6a6" stopOpacity="0.3" /><stop offset="1" stopColor="#f3a6a6" stopOpacity="0" />
        </radialGradient>
        <filter id="lb-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" floodColor="#5a1f2a" floodOpacity="0.28" />
        </filter>
      </defs>

      <ellipse className="lb-halo" cx={BASE.x} cy={BASE.y - 40} rx="92" ry="78" fill="url(#lb-halo)" />

      {/* water: rings spreading out from the stem */}
      <g className="lb-water" transform={`translate(${BASE.x} ${BASE.y + 6})`}>
        {[0, 1, 2].map((i) => <ellipse key={i} className="lb-ripple" rx="40" ry="6" style={{ ["--i" as string]: i }} />)}
        <ellipse className="lb-still" rx="58" ry="5.5" />
      </g>

      <g transform={`translate(${BASE.x} ${BASE.y})`} filter="url(#lb-soft)">
        {ring(RINGS[0])}
        {ring(RINGS[1])}
        {/* the heart: stamens around a golden seed pod */}
        <g className="lb-heart">
          {STAMENS.map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <path className="lb-stamen" d="M0 -14Q1.2 -22 0 -30" />
              <circle className="lb-anther" cx="0" cy="-30.5" r="1.25" />
            </g>
          ))}
          <path className="lb-pod" d="M-12 -18Q-13 -26 0 -27.5Q13 -26 12 -18Q8 -12 0 -12Q-8 -12 -12 -18Z" fill="url(#lb-pod)" />
          <ellipse className="lb-pod-top" cy="-25" rx="10.5" ry="2.6" />
          {SEEDS.map(([x, y]) => <circle key={`${x},${y}`} className="lb-seed" cx={x} cy={-25 + y * 0.6} r="1" />)}
        </g>
        {ring(RINGS[2])}
      </g>
    </svg>
  );
}
