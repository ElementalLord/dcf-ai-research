import type { SVGProps } from "react";

/**
 * A small set of line symbols drawn for this site (no emoji, no icon font). Each is a 24×24
 * outline that inherits the current text colour, so they sit naturally inside keys and chips.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };
const r2 = (value: number) => value.toFixed(2);
const base = ({ size = 18, ...props }: IconProps) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...props,
});

export const Lotus = (props: IconProps) => <svg {...base(props)}>
  <path d="M12 19c-2.6-1.8-3.9-4.4-3.9-7.3C8.1 9 9.6 6.6 12 5c2.4 1.6 3.9 4 3.9 6.7 0 2.9-1.3 5.5-3.9 7.3Z" />
  <path d="M8.3 17.6C5.6 17 3.7 15.3 3 12.6c1.8-.6 3.6-.5 5.2.3" /><path d="M15.7 17.6c2.7-.6 4.6-2.3 5.3-5-1.8-.6-3.6-.5-5.2.3" />
  <path d="M5 20h14" />
</svg>;

export const Diya = (props: IconProps) => <svg {...base(props)}>
  <path d="M12 3.5c1.6 1.9 2.2 3.3 2.2 4.5a2.2 2.2 0 0 1-4.4 0c0-1.2.6-2.6 2.2-4.5Z" />
  <path d="M3.5 13.5h17c-.7 3.5-4.1 6-8.5 6s-7.8-2.5-8.5-6Z" /><path d="M20.5 13.5 22 12" /><path d="M12 10.5v3" />
</svg>;

export const Trishula = (props: IconProps) => <svg {...base(props)}>
  <path d="M12 2.5v19" /><path d="M12 2.5 10.6 5h2.8L12 2.5Z" />
  <path d="M5.5 4.5c0 4 2.4 6.5 6.5 6.5s6.5-2.5 6.5-6.5" /><path d="M5.5 4.5 4.6 6.4" /><path d="M18.5 4.5l.9 1.9" />
  <path d="M10 14h4" /><path d="M10.5 16.5h3" />
</svg>;

export const Chakra = (props: IconProps) => <svg {...base(props)}>
  <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="1.6" />
  {Array.from({ length: 12 }, (_, index) => { const a = (index * Math.PI) / 6; return <path key={index} d={`M${r2(12 + 1.6 * Math.cos(a))} ${r2(12 + 1.6 * Math.sin(a))}L${r2(12 + 8.5 * Math.cos(a))} ${r2(12 + 8.5 * Math.sin(a))}`} strokeWidth={1.1} />; })}
</svg>;

export const Shankha = (props: IconProps) => <svg {...base(props)}>
  <path d="M5 15.5c-1.4-4.6 1.6-10 7-11 4.6-.8 8 2.3 7.4 6-.5 3-3.4 4.6-6.1 3.9" />
  <path d="M13.3 14.4c-1.9-.6-2.4-2.9-1-4.1 1.3-1.1 3.3-.3 3.2 1.4" /><path d="M5 15.5 3 20l4.5-1.6c2.2 1.3 5 1.4 7.5.2" />
</svg>;

export const Orbit = (props: IconProps) => <svg {...base(props)}>
  <circle cx="12" cy="12" r="1.8" /><ellipse cx="12" cy="12" rx="9" ry="3.6" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
  <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
</svg>;

export const Veena = (props: IconProps) => <svg {...base(props)}>
  <circle cx="17" cy="17" r="3.8" /><circle cx="5.5" cy="6.5" r="2.2" /><path d="M7 8 14.3 14.3" />
  <path d="M8.5 6.6 15.6 13" /><path d="M4 4 2.6 2.6" />
</svg>;

export const Manuscript = (props: IconProps) => <svg {...base(props)}>
  <rect x="2.5" y="7" width="19" height="10" rx="2" /><circle cx="7" cy="12" r=".9" /><circle cx="17" cy="12" r=".9" />
  <path d="M9.5 10.5h5M9.5 13.5h5" /><path d="M7 4.5v2.5M17 17v2.5" />
</svg>;

export const Sun = (props: IconProps) => <svg {...base(props)}>
  <circle cx="12" cy="12" r="4" />{Array.from({ length: 8 }, (_, index) => { const a = (index * Math.PI) / 4; return <path key={index} d={`M${r2(12 + 6.5 * Math.cos(a))} ${r2(12 + 6.5 * Math.sin(a))}L${r2(12 + 9 * Math.cos(a))} ${r2(12 + 9 * Math.sin(a))}`} />; })}
</svg>;

export const Seeds = (props: IconProps) => <svg {...base(props)}>
  <path d="M12 21V11" /><path d="M12 11c0-3.5 2.3-6 6-6 0 3.5-2.4 6-6 6Z" /><path d="M12 14c0-3-2-5-5-5 0 3 2 5 5 5Z" />
</svg>;

export const Footsteps = (props: IconProps) => <svg {...base(props)}>
  <path d="M7 4.5c1.5 0 2.4 1.6 2.2 3.6-.2 1.8-1.1 3.2-2.4 3.2S4.6 10 4.6 8c0-2 1-3.5 2.4-3.5Z" />
  <path d="M5.3 13.3h3.4" /><path d="M16.8 10c1.5 0 2.4 1.6 2.2 3.6-.2 1.8-1.1 3.2-2.4 3.2s-2.2-1.3-2.2-3.3c0-2 1-3.5 2.4-3.5Z" /><path d="M15 18.8h3.4" />
</svg>;

export const Mountain = (props: IconProps) => <svg {...base(props)}>
  <path d="M2.5 19.5 9 8l4 7 2.5-4 6 8.5Z" /><path d="M7.4 10.8 9 12l1.5-1.2" />
</svg>;

export const Quill = (props: IconProps) => <svg {...base(props)}>
  <path d="M20 3.5C12 4 6.5 9.6 5.5 18.5" /><path d="M20 3.5c-.4 5.7-4.4 10.4-10.6 11.3" /><path d="M9.5 9.5 12 12" /><path d="M4 21l1.5-2.5" />
</svg>;

export const Compass = (props: IconProps) => <svg {...base(props)}>
  <circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
</svg>;

export const Search = (props: IconProps) => <svg {...base(props)}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>;
export const Close = (props: IconProps) => <svg {...base(props)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const Chevron = (props: IconProps) => <svg {...base(props)}><path d="m6 9 6 6 6-6" /></svg>;
export const Arrow = (props: IconProps) => <svg {...base(props)}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>;
export const ListLines = (props: IconProps) => <svg {...base(props)}><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r=".8" /><circle cx="4" cy="12" r=".8" /><circle cx="4" cy="18" r=".8" /></svg>;
export const Check = (props: IconProps) => <svg {...base(props)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

/** The symbol used for each Explore field. */
export const CATEGORY_ICONS: Record<string, (props: IconProps) => React.JSX.Element> = {
  sages: Lotus, spiritual: Diya, scientists: Orbit, rulers: Chakra, cultural: Veena,
};
