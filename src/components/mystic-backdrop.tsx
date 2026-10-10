export function MysticBackdrop({ contained = false }: { contained?: boolean } = {}) {
  if (contained) return (
    <div className="mystic-backdrop mystic-backdrop-contained" aria-hidden="true">
      <svg className="chat-wisp chat-wisp-one" viewBox="0 0 560 380" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path className="chat-wisp-halo" d="M-35 269 C83 277 99 188 179 205 C262 224 236 83 357 115 C444 138 440 25 594 5" />
        <path className="chat-wisp-thread" pathLength="1" d="M-35 269 C83 277 99 188 179 205 C262 224 236 83 357 115 C444 138 440 25 594 5" />
        <path className="chat-wisp-thread chat-wisp-thread-fine" pathLength="1" d="M-16 335 C74 307 145 302 198 249 C268 178 324 247 385 169 C438 102 497 124 582 61" />
        <circle className="chat-wisp-spark" r="2.2">
          <animateMotion dur="9s" begin="-2s" repeatCount="indefinite" path="M-35 269 C83 277 99 188 179 205 C262 224 236 83 357 115 C444 138 440 25 594 5" />
        </circle>
      </svg>
      <svg className="chat-wisp chat-wisp-two" viewBox="0 0 520 360" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path className="chat-wisp-halo" d="M-25 327 C104 279 45 175 152 190 C237 201 186 84 293 101 C392 118 358 24 542 31" />
        <path className="chat-wisp-thread" pathLength="1" d="M-25 327 C104 279 45 175 152 190 C237 201 186 84 293 101 C392 118 358 24 542 31" />
        <path className="chat-wisp-thread chat-wisp-thread-fine" pathLength="1" d="M-9 274 C99 246 124 264 179 165 C236 61 305 169 365 85 C396 43 473 109 537 77" />
        <circle className="chat-wisp-spark" r="1.8">
          <animateMotion dur="12s" begin="-7s" repeatCount="indefinite" path="M-25 327 C104 279 45 175 152 190 C237 201 186 84 293 101 C392 118 358 24 542 31" />
        </circle>
      </svg>
    </div>
  );

  return (
    <div className="mystic-backdrop" aria-hidden="true">
      <div className="mystic-stars" />
      <svg className="mystic-veil" viewBox="0 0 640 850" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path className="mystic-veil-haze" d="M650 -56 C378 84 674 161 429 302 C243 410 501 502 257 654 C144 725 108 817 -25 908" />
        <path className="mystic-veil-thread" pathLength="1" d="M650 -56 C378 84 674 161 429 302 C243 410 501 502 257 654 C144 725 108 817 -25 908" />
        <path className="mystic-veil-thread mystic-veil-thread-two" pathLength="1" d="M717 51 C482 164 577 277 355 393 C229 459 428 597 185 719 C64 780 75 830 -32 905" />
        <path className="mystic-veil-thread mystic-veil-thread-three" pathLength="1" d="M559 -67 C306 71 548 216 326 334 C153 427 396 519 164 641 C46 704 52 792 -40 859" />
      </svg>
    </div>
  );
}
