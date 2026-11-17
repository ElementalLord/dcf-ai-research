/**
 * The DCF mark: a lotus whose centre petal is a flame, resting on the thread (sutra) that runs
 * through the site. Colours follow the theme: accent disc, page-coloured petals.
 * The same drawing, in fixed colours, is the browser icon (src/app/icon.svg).
 */
export const DCF_MARK_PATHS = {
  flame: "M32 11.5c5.3 6.7 7.9 12.6 7.9 17.9 0 5.7-3.4 9.8-7.9 11.7-4.5-1.9-7.9-6-7.9-11.7 0-5.3 2.6-11.2 7.9-17.9z",
  core: "M32 22.6c2.1 2.9 3.2 5.4 3.2 7.6 0 2.4-1.3 4.2-3.2 5-1.9-.8-3.2-2.6-3.2-5 0-2.2 1.1-4.7 3.2-7.6z",
  left: "M29.2 41.8C20.3 41.2 14.6 35.3 13.5 28.3c6.1-.6 11.8 2.7 14.4 7.6z",
  right: "M34.8 41.8c8.9-.6 14.6-6.5 15.7-13.5-6.1-.6-11.8 2.7-14.4 7.6z",
};

export function DcfMark({ size = 36, className = "", title }: { size?: number; className?: string; title?: string }) {
  return <svg className={`dcf-mark ${className}`} width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
    <circle cx="32" cy="32" r="32" className="dcf-mark-disc" />
    <path d={DCF_MARK_PATHS.flame} className="dcf-mark-petal" />
    <path d={DCF_MARK_PATHS.core} className="dcf-mark-disc" />
    <path d={DCF_MARK_PATHS.left} className="dcf-mark-petal" />
    <path d={DCF_MARK_PATHS.right} className="dcf-mark-petal" />
    <rect x="15" y="45" width="34" height="3.2" rx="1.6" className="dcf-mark-petal" />
    <rect x="21" y="50.6" width="22" height="2.6" rx="1.3" className="dcf-mark-petal" opacity="0.7" />
  </svg>;
}
