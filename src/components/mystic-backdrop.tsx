export function MysticBackdrop({ contained = false }: { contained?: boolean } = {}) {
  if (contained) return (
    <div className="mystic-backdrop mystic-backdrop-contained" aria-hidden="true">
      <div className="chat-aurora chat-aurora-one" />
      <div className="chat-aurora chat-aurora-two" />
      <svg className="chat-constellation" viewBox="0 0 960 720" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path className="chat-current chat-current-one" d="M-50 572C124 482 192 617 358 525S572 308 721 361 908 455 1010 294" />
        <path className="chat-current chat-current-two" d="M-40 156C117 250 181 91 324 159S493 350 655 249 866 84 1012 167" />
        <path className="chat-thread-line" d="m91 532 81-49 106 31 80-72m246-159 88-55 86 36 100-74" />
        <circle className="chat-star chat-star-one" cx="91" cy="532" r="3" />
        <circle className="chat-star chat-star-two" cx="278" cy="514" r="3" />
        <circle className="chat-star chat-star-three" cx="604" cy="283" r="3" />
        <circle className="chat-star chat-star-four" cx="878" cy="190" r="3" />
        <g className="chat-sigil">
          <path d="M760 345c-46 13-79 55-79 105 0 61 49 110 110 110 49 0 91-33 105-79-16 15-38 24-62 24-50 0-91-41-91-91 0-26 11-50 29-67l-12-2Z" />
          <path d="M790 337v42m-21-21h42m49 195v30m-15-15h30" />
        </g>
      </svg>
      <span className="chat-wisp chat-wisp-one" />
      <span className="chat-wisp chat-wisp-two" />
      <span className="chat-wisp chat-wisp-three" />
    </div>
  );

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
