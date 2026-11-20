/**
 * The closing ornament of the front page: a lotus-vine frieze. A small mandala turns at the centre and two
 * strands braid outward from it in both directions, crossing at diamond knots, with petals blooming along the
 * way in a slow ripple while a thread of light travels out to the edges. Everything is drawn from a few numbers
 * below, so it can be retuned without redrawing. Pure SVG + CSS (see .fz-* in explore.css); it takes the theme's
 * accent and gold, and sits still under prefers-reduced-motion.
 */

const W = 2400; // drawing width; the SVG crops (slice) to the screen, always centred on the mandala
const H = 150;
const CX = W / 2;
const CY = H / 2;
const AMP = 17; // how far the strands swing from the centre line
const HALF = 38; // horizontal distance between a strand's peak and its next trough
const START = 74; // where the strands leave the mandala
const STEPS = Math.floor((CX - START - 20) / HALF);

const f = (n: number) => +n.toFixed(2);

/** A pointed petal on the vertical axis, from radius r0 out to r1, w wide at its belly. */
const petal = (r0: number, r1: number, w: number) => {
  const mid = r0 + (r1 - r0) * 0.5;
  return `M0 ${-r0}C${w} ${-mid} ${w} ${-mid} 0 ${-r1}C${-w} ${-mid} ${-w} ${-mid} 0 ${-r0}Z`;
};

/** One strand as a chain of S-curves, outward from the mandala. `flip` picks which strand swings up first. */
function strand(dir: 1 | -1, flip: 1 | -1) {
  let d = `M${f(CX + dir * START)} ${f(CY - flip * AMP)}`;
  for (let k = 0; k < STEPS; k++) {
    const x0 = CX + dir * (START + k * HALF);
    const x1 = CX + dir * (START + (k + 1) * HALF);
    const y0 = CY - flip * AMP * (k % 2 ? -1 : 1);
    const y1 = CY + flip * AMP * (k % 2 ? -1 : 1);
    const xm = (x0 + x1) / 2;
    d += `C${f(xm)} ${f(y0)} ${f(xm)} ${f(y1)} ${f(x1)} ${f(y1)}`;
  }
  return d;
}

const steps = Array.from({ length: STEPS }, (_, k) => k);

function Side({ dir }: { dir: 1 | -1 }) {
  const a = strand(dir, 1);
  const b = strand(dir, -1);
  return (
    <g>
      <path className="fz-line fz-line-a" d={a} />
      <path className="fz-line fz-line-b" d={b} />
      {/* a thread of light that travels outward along each strand */}
      <path className="fz-glint fz-glint-a" d={a} pathLength={1000} />
      <path className="fz-glint fz-glint-b" d={b} pathLength={1000} />
      {steps.map((k) => {
        const x = CX + dir * (START + k * HALF);
        const knot = CX + dir * (START + (k + 0.5) * HALF); // where the two strands cross
        const up = k % 2 ? 1 : -1; // the strand that peaks at this x
        const big = k % 4 === 1; // every fourth crossing is a small flower
        return (
          <g key={k} className="fz-bloom" style={{ ["--i" as string]: k }}>
            {/* petals sprouting away from each peak and trough */}
            <path className="fz-petal" transform={`translate(${f(x)} ${CY + up * AMP}) scale(1 ${-up})`} d={petal(2, 15, 4.2)} />
            <path className="fz-petal fz-petal-soft" transform={`translate(${f(x)} ${CY - up * AMP}) scale(1 ${up})`} d={petal(2, 11, 3.4)} />
            <circle className="fz-seed" cx={f(x)} cy={CY} r={1.5} />
            {big ? (
              <g transform={`translate(${f(knot)} ${CY})`}>
                {[0, 90].map((r) => <path key={r} className="fz-flower" transform={`rotate(${r})`} d={petal(2, 11, 3.6)} />)}
                {[0, 90].map((r) => <path key={r + 180} className="fz-flower" transform={`rotate(${r + 180})`} d={petal(2, 11, 3.6)} />)}
                <circle className="fz-bindu" r={2} />
              </g>
            ) : (
              <path className="fz-knot" d={`M${f(knot)} ${CY - 4.5}L${f(knot + 3.2)} ${CY}L${f(knot)} ${CY + 4.5}L${f(knot - 3.2)} ${CY}Z`} />
            )}
          </g>
        );
      })}
    </g>
  );
}

export function FooterFrieze() {
  const ring = Array.from({ length: 16 }, (_, i) => i * 22.5);
  const inner = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);
  const sparks = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg className="fz" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        {/* the whole frieze dissolves toward both edges */}
        <linearGradient id="fz-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.22" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#fff" />
          <stop offset="0.78" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="fz-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect width={W} height={H} fill="url(#fz-fade)" />
        </mask>
      </defs>

      <g mask="url(#fz-mask)">
        {/* dotted rails above and below, like the margins of a manuscript */}
        <line className="fz-rail" x1="0" x2={W} y1={CY - AMP - 22} y2={CY - AMP - 22} />
        <line className="fz-rail" x1="0" x2={W} y1={CY + AMP + 22} y2={CY + AMP + 22} />
        <line className="fz-axis" x1="0" x2={W} y1={CY} y2={CY} />

        <Side dir={1} />
        <Side dir={-1} />

        {/* the mandala: two counter-turning rings of petals around a breathing bindu */}
        <g transform={`translate(${CX} ${CY})`}>
          <circle className="fz-halo" r={50} />
          <circle className="fz-orbit" r={62} />
          <g className="fz-turn-a">
            {ring.map((r) => <path key={r} className="fz-petal" transform={`rotate(${r})`} d={petal(26, 58, 12)} />)}
          </g>
          <g className="fz-turn-b">
            {inner.map((r) => <path key={r} className="fz-flower" transform={`rotate(${r})`} d={petal(10, 36, 9)} />)}
          </g>
          <g className="fz-turn-a">
            {sparks.map((r) => <circle key={r} className="fz-spark" cx={0} cy={-66} r={r % 45 ? 0.9 : 1.6} transform={`rotate(${r})`} />)}
          </g>
          <circle className="fz-core" r={7} />
          <circle className="fz-bindu fz-bindu-main" r={3.2} />
        </g>
      </g>
    </svg>
  );
}
