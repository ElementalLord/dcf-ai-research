const chatGlints = [
  [12, 19, 1, 11, -2],
  [86, 15, 1.5, 16, -9],
  [75, 39, 1, 13, -7],
  [8, 54, 1, 17, -12],
  [91, 67, 1, 12, -5],
  [31, 76, 1.5, 15, -10],
  [65, 82, 1, 19, -15],
  [48, 47, 1, 14, -4],
] as const;

const pageGlints = [
  [18, 28, 1, 15, -6],
  [83, 12, 1.5, 19, -11],
  [94, 53, 1, 13, -3],
  [9, 79, 1, 17, -14],
  [78, 88, 1.5, 21, -8],
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
