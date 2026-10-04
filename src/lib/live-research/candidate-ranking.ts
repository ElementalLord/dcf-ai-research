import type { SourceTarget } from "./expansion-plan";

/** Search result ordering only. This score never grants provenance or evidence access. */
export function rankCandidateUrls(urls: string[], target: SourceTarget): string[] {
  const score = (raw: string) => {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    let value = /(?:\.edu|\.ac\.[a-z]{2}|\.gov|\.gov\.[a-z]{2})$/.test(host) ? 5 : 0;
    if (/journal|press|university|repository|archive|library/.test(host)) value += 2;
    if (/\.pdf$/.test(path)) value -= 2; // Current candidate preview verifies HTML metadata.
    if (/blogspot|wordpress|fandom|quora|reddit|pinterest/.test(host)) value -= 8;
    if (target === "institutional_repository" && /repository|archive|library|project|texts/.test(path)) value += 2;
    if (target === "peer_reviewed_scholarship" && /article|journal|doi|research/.test(path)) value += 2;
    if (target === "primary_edition" && /text|edition|rigveda|ramayana|samhita/.test(path)) value += 2;
    return value;
  };
  return [...urls].sort((a, b) => score(b) - score(a));
}
