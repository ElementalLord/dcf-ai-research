export function MysticBackdrop() {
  return (
    <div className="mystic-backdrop" aria-hidden="true">
      <div className="mystic-glow mystic-glow-one" />
      <div className="mystic-glow mystic-glow-two" />
      <div className="mystic-stars" />
      <svg className="mystic-chart" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="320" cy="320" r="254" className="chart-ring chart-ring-outer" />
        <circle cx="320" cy="320" r="219" className="chart-ring" />
        <circle cx="320" cy="320" r="151" className="chart-ring chart-ring-inner" />
        <circle cx="320" cy="320" r="67" className="chart-ring" />
        <path d="M320 69v502M69 320h502M142.5 142.5l355 355m0-355-355 355" className="chart-axis" />
        <path d="m320 169 131 226H189l131-226Zm0 302L189 245h262L320 471Z" className="chart-geometry" />
        <path d="M320 34v22m0 528v22M34 320h22m528 0h22M118 118l16 16m372 372 16 16m0-404-16 16M134 506l-16 16" className="chart-ticks" />
        <circle cx="320" cy="66" r="3" className="chart-point" />
        <circle cx="574" cy="320" r="3" className="chart-point" />
        <circle cx="320" cy="574" r="3" className="chart-point" />
        <circle cx="66" cy="320" r="3" className="chart-point" />
        <circle cx="320" cy="320" r="8" className="chart-core" />
      </svg>
    </div>
  );
}
