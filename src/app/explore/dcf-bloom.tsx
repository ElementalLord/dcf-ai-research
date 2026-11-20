import { DCF_MARK_PATHS } from "@/components/dcf-logo";

/**
 * The DCF lotus as a living emblem for the top of the home page. On a slow loop the petals curl in toward the
 * centre and unfurl again, outer leaves last, while two tendrils wind out from the ends of the sutra and back.
 * Built from the same paths as the logo (src/components/dcf-logo.tsx), so it is always recognisably the mark.
 * The open lotus is the resting state: with reduced motion it simply stays open. Styles: .db-* in explore.css.
 */

/** A spiral tendril starting at the sutra's end and winding inward around `cx, cy`. */
function tendril(x0: number, y0: number, cx: number, cy: number, mirror: boolean) {
  const start = Math.atan2(y0 - cy, x0 - cx);
  const r0 = Math.hypot(x0 - cx, y0 - cy);
  const turns = 1.55;
  const points: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const angle = start + t * turns * Math.PI * 2;
    const r = r0 * (1 - 0.84 * t);
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${(mirror ? 40 - x : x).toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${points.join("L")}`;
}

const LEFT_TENDRIL = tendril(8, 35, 5.2, 33.1, false);
const RIGHT_TENDRIL = tendril(8, 35, 5.2, 33.1, true);
const SEEDS = Array.from({ length: 12 }, (_, i) => i * 30);

export function DcfBloom({ className = "" }: { className?: string }) {
  return (
    <svg className={`db ${className}`} viewBox="-6 -4 52 50" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="db-glow">
          <stop offset="0" stopColor="var(--brand-accent)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--brand-accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="db-glow" cx="20" cy="21" r="24" fill="url(#db-glow)" />
      {/* two dotted orbits turning in opposite directions, and a ring of seeds that opens with the flower */}
      <circle className="db-orbit db-orbit-a" cx="20" cy="21" r="22.5" />
      <circle className="db-orbit db-orbit-b" cx="20" cy="21" r="19.6" />
      <g className="db-seeds">
        {SEEDS.map((r) => <circle key={r} cx="20" cy="-0.6" r={r % 90 ? 0.32 : 0.55} transform={`rotate(${r} 20 21)`} />)}
      </g>

      <g className="db-line" strokeLinecap="round" strokeLinejoin="round">
        <path className="db-outer db-outer-l" d={DCF_MARK_PATHS.outerLeft} />
        <path className="db-outer db-outer-r" d={DCF_MARK_PATHS.outerRight} />
        <path className="db-petal db-petal-l" d={DCF_MARK_PATHS.left} />
        <path className="db-petal db-petal-r" d={DCF_MARK_PATHS.right} />
        <path className="db-centre" d={DCF_MARK_PATHS.centre} />
        <path className="db-sutra" d={DCF_MARK_PATHS.sutra} />
        <path className="db-tendril" d={LEFT_TENDRIL} pathLength={1} />
        <path className="db-tendril" d={RIGHT_TENDRIL} pathLength={1} />
      </g>
      <circle className="db-bindu" cx="20" cy="18.6" r="1.25" />
    </svg>
  );
}
