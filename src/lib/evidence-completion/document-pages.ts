import { normalizeTransliteration } from "@/lib/live-research/provenance-link";
import type { Locator } from "./locator";
import { matchedWords, namesTerm, stems, termForms } from "./passage-match";

export type DocumentPage = { index: number; printed: string | null; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => entity[0] === "#"
    ? String.fromCodePoint(entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)))
    : ENTITIES[entity.toLowerCase()] ?? whole);
}

/**
 * Pages of an OCR'd scan from its DjVu XML: one OBJECT per scanned leaf, lines kept, paragraphs
 * separated. `printedPages` is the repository's leaf → printed page map; leaf N is the Nth OBJECT counting
 * from 0 (a cover leaf 0 carries no number), so the 1-based scan page is leaf + 1.
 */
export function djvuXmlPages(xml: string, printedPages: Map<number, string> = new Map()): DocumentPage[] {
  const pages: DocumentPage[] = [];
  const objects = xml.split(/<OBJECT\b/).slice(1);
  objects.forEach((object, position) => {
    const body = object.slice(0, object.indexOf("</OBJECT>") >= 0 ? object.indexOf("</OBJECT>") : undefined);
    const paragraphs = body.split(/<PARAGRAPH\b/).slice(1).map((paragraph) => paragraph.split(/<LINE\b/).slice(1)
      .map((line) => [...line.matchAll(/<WORD\b[^>]*>([\s\S]*?)<\/WORD>/g)].map((word) => decode(word[1]).trim()).filter(Boolean).join(" "))
      .filter(Boolean).join("\n")).filter(Boolean);
    pages.push({ index: position + 1, printed: printedPages.get(position) || null, text: paragraphs.join("\n\n") });
  });
  return pages;
}

/** Repository page-number map, trusted only when the repository's own confidence is reasonable. */
export function printedPageMap(record: { confidence?: number; pages?: Array<{ leafNum: number; pageNumber: string }> } | null): Map<number, string> {
  const map = new Map<number, string>();
  if (!record?.pages || (record.confidence ?? 0) < 50) return map;
  for (const page of record.pages) if (/^\d{1,4}$/.test(page.pageNumber || "")) map.set(page.leafNum, page.pageNumber);
  return map;
}

export function pageLabel(page: DocumentPage): string {
  return page.printed ? `p. ${page.printed} (scan page ${page.index})` : `Scan page ${page.index}`;
}

function romanNumeral(value: number): string {
  const table: Array<[number, string]> = [[100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let rest = value;
  let out = "";
  for (const [amount, letters] of table) while (rest >= amount) { out += letters; rest -= amount; }
  return out;
}

/**
 * Picks only the pages that answer one citation, so a 500-page scan yields a handful of passages.
 * Printed page citations select those pages directly. Section and canonical citations score each page
 * by the citation's own heading terms and locator forms first, then the requesting claims' wording.
 */
export function selectCitedPages(pages: DocumentPage[], request: {
  locator: Locator; claimTexts: string[]; aliases: string[]; workTitle: string; maxPages?: number;
}): Array<DocumentPage & { score: number }> {
  const max = request.maxPages ?? 3;
  const { locator } = request;
  if (locator.kind === "page" && locator.pages) {
    const [first, last] = locator.pages;
    return pages.filter((page) => page.printed && Number(page.printed) >= first && Number(page.printed) <= last)
      .slice(0, Math.max(max, last - first + 1)).map((page) => ({ ...page, score: 100 }));
  }
  const workTerms = new Set(normalizeTransliteration(request.workTitle).split(" "));
  const headingTerms = (locator.terms || []).filter((term) => !workTerms.has(term));
  const locatorForms = locator.kind === "canonical" && locator.path
    ? [`${romanNumeral(locator.path[0])}. ${locator.path[1]}`, `${locator.path[0]}.${locator.path[1]}`, `${locator.path[0]}, ${locator.path[1]}`]
      .map((form) => form.toLowerCase()) : [];
  const claimWords = new Map(request.claimTexts.flatMap((text) => [...termForms(text)]));
  const aliasForms = request.aliases.map(normalizeTransliteration).filter((alias) => alias.length >= 5);
  const scored = pages.map((page) => {
    const normalized = normalizeTransliteration(page.text);
    const heading = headingTerms.filter((term) => namesTerm(normalized, term)).length;
    const located = locatorForms.some((form) => page.text.toLowerCase().includes(form)) ? 1 : 0;
    const pageStems = stems(page.text);
    const wording = matchedWords(claimWords, pageStems).length;
    const named = aliasForms.some((alias) => normalized.includes(alias)) ? 1 : 0;
    return { ...page, score: heading * 6 + located * 6 + wording + named * 3, heading, located };
  });
  // A section citation must at least name its heading on the page; a canonical one must carry its locator or the name.
  const eligible = scored.filter((page) => locator.kind === "section"
    ? page.heading > 0 && page.heading >= Math.ceil(headingTerms.length / 2)
    : page.located > 0 || page.score >= 10);
  const chosen = eligible.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, max);
  // A section starts on its heading page and runs on; OCR may garble the name on the continuation pages.
  const continuation = locator.kind === "section" && chosen.length
    ? scored.filter((page) => page.index > chosen[0].index && page.index <= chosen[0].index + 2) : [];
  return [...new Map([...chosen, ...continuation].map((page) => [page.index, page])).values()]
    .sort((a, b) => a.index - b.index).map((page) => ({ index: page.index, printed: page.printed, text: page.text, score: page.score }));
}
