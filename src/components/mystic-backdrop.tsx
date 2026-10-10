const chatGlints = [
  [8, 18, 2, 8, -1],
  [88, 14, 2.5, 11, -7],
  [73, 27, 2, 9, -4],
  [16, 39, 2, 10, -6],
  [94, 43, 2, 7, -3],
  [62, 51, 2.5, 12, -9],
  [9, 61, 2, 9, -8],
  [82, 68, 2, 8, -5],
  [28, 75, 2.5, 11, -2],
  [54, 84, 2, 10, -10],
  [42, 29, 2, 7, -5],
  [71, 88, 2, 9, -1],
  [36, 55, 2, 12, -4],
  [95, 81, 2.5, 8, -7],
  [5, 87, 2, 10, -2],
  [56, 12, 2.5, 9, -6],
] as const;

const pageGlints = [
  [18, 28, 2, 10, -6],
  [83, 12, 2.5, 12, -3],
  [94, 53, 2, 9, -8],
  [9, 79, 2, 11, -4],
  [78, 88, 2.5, 13, -10],
  [63, 18, 2, 8, -1],
  [32, 91, 2, 10, -7],
  [98, 31, 2, 9, -5],
] as const;

function Glints({ contained }: { contained: boolean }) {
  const positions = contained ? chatGlints : pageGlints;

  return positions.map(([left, top, size, duration, delay], index) => (
    <span
      key={index}
      className="mystic-glint"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: size,
        height: size,
        animationDuration: `${duration}s`,
        animationDelay: `${delay}s`,
      }}
    />
  ));
}

export function MysticBackdrop({ contained = false }: { contained?: boolean } = {}) {
  return (
    <div className={`mystic-backdrop${contained ? " mystic-backdrop-contained" : ""}`} aria-hidden="true">
      {!contained && <div className="mystic-stars" />}
      <Glints contained={contained} />
    </div>
  );
}
