export function stageTimer(stage: string): () => number {
  const started = performance.now();
  return () => {
    const duration = Math.round(performance.now() - started);
    if (process.env.NODE_ENV !== "test") console.info(`${stage}: ${duration}ms`);
    return duration;
  };
}

export function logStage(stage: string, details: Record<string, string | number | boolean | null>): void {
  if (process.env.NODE_ENV === "test") return;
  const safe = Object.entries(details)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.info(`${stage}: ${safe}`);
}
