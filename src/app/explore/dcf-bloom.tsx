import { DCF_MARK_PATHS } from "@/components/dcf-logo";

/**
 * The emblem at the top of the home page: a lotus mandala drawn in the site's fine coral-and-gold line, with the
 * DCF mark at its heart. On a slow loop its rings of petals unfurl outward from the centre, inner ring first,
 * and curl back in again, outer ring first, while the beaded rims turn. Each petal is double-contoured with a
 * centre vein and a drop at its tip, the way the timeline rosettes and footer frieze are drawn.
 *
 * Built from a few numbers below. The open mandala is the resting state; with reduced motion it stays open.
 * Styles: .md-* in explore.css.
 */

const f = (n: number) => +n.toFixed(2);
const around = (count: number, offset = 0) => Array.from({ length: count }, (_, i) => offset + (360 / count) * i);

/** A petal pointing outward (up the -y axis) from radius r0 to r1, `w` wide at its fullest. */
function petal(r0: number, r1: number, w: number) {
  const a = r0 + (r1 - r0) * 0.28;
  const b = r0 + (r1 - r0) * 0.72;
  return `M0 ${f(-r0)}C${f(w)} ${f(-a)} ${f(w * 0.72)} ${f(-b)} 0 ${f(-r1)}C${f(-w * 0.72)} ${f(-b)} ${f(-w)} ${f(-a)} 0 ${f(-r0)}Z`;
}

type Ring = { name: string; count: number; offset: number; r0: number; r1: number; w: number; inner: boolean; vein: boolean; drop: boolean; stagger: number };
// Inside out. `stagger` sets when the ring opens: the centre unfurls first.
const RINGS: Ring[] = [
  { name: "core", count: 8, offset: 22.5, r0: 15, r1: 42, w: 9, inner: false, vein: true, drop: false, stagger: 0 },
  { name: "inner", count: 8, offset: 0, r0: 19, r1: 58, w: 15, inner: true, vein: true, drop: true, stagger: 1 },
  { name: "outer", count: 16, offset: 11.25, r0: 40, r1: 82, w: 13, inner: true, vein: true, drop: true, stagger: 2 },
  { name: "rim", count: 32, offset: 0, r0: 76, r1: 89, w: 4.2, inner: false, vein: false, drop: false, stagger: 3 },
];

function PetalRing({ ring }: { ring: Ring }) {
  const { r0, r1, w } = ring;
  return (
    <g className={`md-ring md-${ring.name}`} style={{ ["--s" as string]: ring.stagger }}>
      {around(ring.count, ring.offset).map((angle) => (
        <g key={angle} transform={`rotate(${f(angle)})`}>
          <g className="md-petal">
            <path className="md-body" d={petal(r0, r1, w)} />
            {ring.inner && <path className="md-contour" d={petal(r0 + (r1 - r0) * 0.16, r1 - (r1 - r0) * 0.14, w * 0.56)} />}
            {ring.vein && <path className="md-vein" d={`M0 ${f(-r0 - (r1 - r0) * 0.1)}L0 ${f(-r1 + (r1 - r0) * 0.22)}`} />}
            {ring.drop && <path className="md-drop" d={`M0 ${f(-r1 - 2.2)}q1.3 -2.2 0 -4.6q-1.3 2.4 0 4.6Z`} />}
          </g>
        </g>
      ))}
    </g>
  );
}

export function DcfBloom({ className = "" }: { className?: string }) {
  return (
    <svg className={`md ${className}`} viewBox="-100 -100 200 200" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="md-wash">
          <stop offset="0" style={{ stopColor: "var(--brand-accent)", stopOpacity: 0.16 }} />
          <stop offset="0.6" style={{ stopColor: "var(--brand-accent)", stopOpacity: 0.05 }} />
          <stop offset="1" style={{ stopColor: "var(--brand-accent)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <circle className="md-wash" r="96" fill="url(#md-wash)" />

      {/* the turning rims: a fine dotted circle, a band of beads, and an inner dotted orbit */}
      <g className="md-spin md-spin-slow">
        <circle className="md-dots" r="97" />
        {around(48).map((a, i) => <circle key={a} className={i % 4 ? "md-bead" : "md-bead md-bead-big"} cy="-93" r={i % 4 ? 0.55 : 1.1} transform={`rotate(${a})`} />)}
      </g>
      <g className="md-spin md-spin-back"><circle className="md-dots md-dots-gold" r="72" /></g>

      <PetalRing ring={RINGS[3]} />
      <PetalRing ring={RINGS[2]} />
      {/* gold diamonds between the large petals */}
      <g className="md-ring md-gems" style={{ ["--s" as string]: 2 }}>
        {around(16).map((a) => <g key={a} transform={`rotate(${a})`}><path className="md-gem" d="M0 -66l1.6 2.6-1.6 2.6-1.6-2.6Z" /></g>)}
      </g>
      <PetalRing ring={RINGS[1]} />
      <PetalRing ring={RINGS[0]} />

      {/* the heart: a ring of stamens around the DCF lotus */}
      <g className="md-ring md-heart" style={{ ["--s" as string]: 0 }}>
        <circle className="md-heart-rim" r="16.5" />
        {around(32).map((a, i) => (
          <g key={a} transform={`rotate(${a})`}>
            <path className="md-stamen" d={`M0 -11L0 ${i % 2 ? -14.2 : -15.4}`} />
            <circle className="md-anther" cy={i % 2 ? -14.8 : -16} r={i % 2 ? 0.45 : 0.65} />
          </g>
        ))}
        <circle className="md-heart-fill" r="10.4" />
        <g className="md-mark" transform="translate(-7.6 -8.6) scale(0.38)" strokeLinecap="round" strokeLinejoin="round">
          {Object.values(DCF_MARK_PATHS).map((d) => <path key={d} d={d} />)}
          <circle className="md-bindu" cx="20" cy="18.6" r="2.1" />
        </g>
      </g>
    </svg>
  );
}
