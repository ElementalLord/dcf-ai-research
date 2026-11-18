/**
 * The DCF mark: an open lotus drawn in a single fine line, a bindu at its heart, resting on the
 * thread (sutra) that runs through the site. No badge or fill, so it reads as a drawn emblem
 * rather than an app icon, and it takes the theme's accent colour.
 * The same drawing, thicker and on a tile, is the browser icon (src/app/icon.svg).
 */
export const DCF_MARK_PATHS = {
  centre: "M20 5.5C24.6 10.6 26.4 15.6 25 20.4 24.1 23.4 22.3 25.8 20 27.6 17.7 25.8 15.9 23.4 15 20.4 13.6 15.6 15.4 10.6 20 5.5Z",
  left: "M18.2 28.4C11.6 28.2 6.6 24.2 4.6 16.8 10.4 16.6 15 19.4 17.2 24",
  right: "M21.8 28.4C28.4 28.2 33.4 24.2 35.4 16.8 29.6 16.6 25 19.4 22.8 24",
  outerLeft: "M16 30.6C10.2 31.4 5.2 29.8 2.4 26",
  outerRight: "M24 30.6C29.8 31.4 34.8 29.8 37.6 26",
  sutra: "M8 35H32",
};

export function DcfMark({ size = 36, className = "", title }: { size?: number; className?: string; title?: string }) {
  return <svg className={`dcf-mark ${className}`} width={size} height={size} viewBox="0 0 40 40" fill="none" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
    <g className="dcf-mark-line" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={DCF_MARK_PATHS.centre} />
      <path d={DCF_MARK_PATHS.left} />
      <path d={DCF_MARK_PATHS.right} />
      <path d={DCF_MARK_PATHS.outerLeft} />
      <path d={DCF_MARK_PATHS.outerRight} />
      <path d={DCF_MARK_PATHS.sutra} />
    </g>
    <circle cx="20" cy="18.6" r="2" className="dcf-mark-dot" />
  </svg>;
}
