export function MysticBackdrop({ contained = false }: { contained?: boolean } = {}) {
  if (contained) return (
    <div className="mystic-backdrop mystic-backdrop-contained" aria-hidden="true">
      <svg className="chat-constellation chat-constellation-one" viewBox="0 0 460 280" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path className="chat-constellation-guide" d="M35 205 119 142 207 163 269 65 354 107 424 38 M207 163 285 230 379 209 424 38 M119 142 93 57 269 65" />
        <path className="chat-constellation-line chat-constellation-line-one" pathLength="1" d="M35 205 119 142 207 163 269 65 354 107 424 38" />
        <path className="chat-constellation-line chat-constellation-line-two" pathLength="1" d="M207 163 285 230 379 209 424 38" />
        <path className="chat-constellation-line chat-constellation-line-three" pathLength="1" d="M119 142 93 57 269 65" />
        {[ [35, 205], [119, 142], [207, 163], [269, 65], [354, 107], [424, 38], [285, 230], [379, 209], [93, 57] ].map(([cx, cy], index) => (
          <circle key={index} className="chat-constellation-star" cx={cx} cy={cy} r={index === 3 ? 3.3 : 2.2} style={{ animationDelay: `${index * .42}s` }} />
        ))}
      </svg>
      <svg className="chat-constellation chat-constellation-two" viewBox="0 0 390 260" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path className="chat-constellation-guide" d="M29 171 90 94 174 116 215 45 320 69 363 166 M174 116 226 202 363 166 M90 94 37 43 215 45" />
        <path className="chat-constellation-line chat-constellation-line-one" pathLength="1" d="M29 171 90 94 174 116 215 45 320 69 363 166" />
        <path className="chat-constellation-line chat-constellation-line-two" pathLength="1" d="M174 116 226 202 363 166" />
        <path className="chat-constellation-line chat-constellation-line-three" pathLength="1" d="M90 94 37 43 215 45" />
        {[ [29, 171], [90, 94], [174, 116], [215, 45], [320, 69], [363, 166], [226, 202], [37, 43] ].map(([cx, cy], index) => (
          <circle key={index} className="chat-constellation-star" cx={cx} cy={cy} r={index === 2 ? 3.3 : 2.2} style={{ animationDelay: `${index * .48 - 3}s` }} />
        ))}
      </svg>
      <span className="chat-meteor chat-meteor-one" />
      <span className="chat-meteor chat-meteor-two" />
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
