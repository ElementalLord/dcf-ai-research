import { normalizeTransliteration } from "@/lib/live-research/provenance-link";

/**
 * Structured citation locators. A locator says WHERE in a work a claim's evidence sits.
 *
 * - canonical: an edition-independent address inside a numbered textual tradition
 *   (book.chapter[.verse]); the scheme name is the tradition, e.g. "ramayana:1.65".
 * - page: printed pages inside one specific edition; only comparable within that edition.
 * - doi: a registered publication identifier.
 * - section: a named heading or narrative unit inside a work.
 * - note: a reviewer remark ("Methodological note", "Review rule") that names no passage.
 *
 * Schemes are table driven so a new tradition is one entry, never a new code path.
 */
export type LocatorKind = "canonical" | "page" | "doi" | "section" | "note";
export type Locator = {
  kind: LocatorKind;
  raw: string;
  /** Stable grouping key: the same key means the same requested passage. */
  key: string;
  scheme?: string;
  /** Book/chapter path for canonical locators, e.g. [1, 65]. */
  path?: number[];
  /** Inclusive verse range for canonical locators when the citation is verse level. */
  verses?: [number, number];
  pages?: [number, number];
  doi?: string;
  /** Distinctive heading terms for section locators. */
  terms?: string[];
  /** True when the locator names one bounded passage that acquisition can target. */
  specific: boolean;
};

type CanonicalScheme = {
  scheme: string;
  /** Matches the work name inside a citation, source title, or claim. */
  work: RegExp;
  /** Named first-level divisions mapped to their number, e.g. a named book or parva. */
  books?: Array<[RegExp, number]>;
  maxBook?: number;
};

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
function romanOrNumber(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const letters = value.toUpperCase().split("");
  return letters.reduce((sum, letter, index) => {
    const current = ROMAN[letter] || 0;
    const next = ROMAN[letters[index + 1]] || 0;
    return sum + (current < next ? -current : current);
  }, 0);
}

/** Numbered textual traditions present in the corpus. Extend by adding a row. */
export const CANONICAL_SCHEMES: CanonicalScheme[] = [
  { scheme: "rv", work: /\b(?:r[.]?v\b[.]?|rig\s?veda|rgveda|r̥gveda|mandala|maṇḍala)/i, maxBook: 10 },
  { scheme: "ramayana", work: /ramayan|kanda\b|kāṇḍa|sarga/i, maxBook: 7, books: [
    [/\bbala\s*kanda|\bbaala|\bbāla/i, 1], [/ayodhya\s*kanda/i, 2], [/aranya\s*kanda/i, 3], [/kishkindha\s*kanda/i, 4],
    [/sundara\s*kanda/i, 5], [/yuddha\s*kanda/i, 6], [/uttara\s*kanda/i, 7]] },
  { scheme: "mahabharata", work: /mahabharat|parva\b|adhyaya/i, maxBook: 18, books: [
    [/\badi\s*parva/i, 1], [/sabha\s*parva/i, 2], [/vana\s*parva|aranyaka\s*parva/i, 3], [/virata\s*parva/i, 4],
    [/udyoga\s*parva/i, 5], [/bhishma\s*parva/i, 6], [/drona\s*parva/i, 7], [/karna\s*parva/i, 8], [/shalya\s*parva/i, 9],
    [/sauptika\s*parva/i, 10], [/stri\s*parva/i, 11], [/shanti\s*parva/i, 12], [/anushasana\s*parva/i, 13],
    [/ashvamedhika\s*parva/i, 14], [/ashramavasika\s*parva/i, 15], [/mausala\s*parva/i, 16],
    [/mahaprasthanika\s*parva/i, 17], [/svargarohana\s*parva/i, 18]] },
];

/** Reviewer and methodology remarks: they describe how a claim was reviewed, not where its evidence is. */
const NOTE = /\b(?:review|rule|note|caution|synthesis|recommendation|application|lens|flag|statement|inference|chronology|framing|harmonization|wording|overview|portal|contents|attribution (?:map|table)|comparative|interpretation|commentary layer|layer|reception|methodolog\w*)\b|\bvs\.?\s|\bversus\b/i;
const STOP = new Set(["the", "and", "of", "in", "on", "a", "an", "to", "with", "passage", "section", "narrative", "cycle", "discussion", "edition", "related", "text", "chapter"]);

function plain(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-");
}

function verseRange(start: string | undefined, end: string | undefined): [number, number] | undefined {
  if (!start) return undefined;
  const first = Number(start);
  const last = end ? Number(end) : first;
  return last >= first && last - first <= 60 ? [first, last] : [first, first];
}

function canonical(raw: string, context: string): Locator | null {
  const text = plain(raw);
  const hint = plain(context);
  // The citation's own wording names the tradition first; the work hint only fills in a bare "1.65".
  const scheme = CANONICAL_SCHEMES.find((item) => item.work.test(text))
    || CANONICAL_SCHEMES.find((item) => item.work.test(hint));
  if (!scheme) return null;
  const named = scheme.books?.find(([pattern]) => pattern.test(text))?.[1]
    ?? scheme.books?.find(([pattern]) => pattern.test(hint))?.[1];
  const dotted = text.match(/\b([ivxlcdm]+|\d{1,3})\s*[.]\s*(\d{1,3})(?:\s*[.]\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?/i);
  const spelled = text.match(/(?:sukta|sarga|adhyaya|chapter|hymn)\s*(\d{1,3})(?:\s*(?:,|\.)?\s*(?:verse|sloka|shloka)?\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?/i);
  const mandala = text.match(/mandala\s*([ivxlcdm]+|\d{1,2})/i)?.[1];
  // "Kanda 1 Sarga 64", "Parva 5, Adhyaya 104", "Book 3 Hymn 33": a numbered division then a numbered unit.
  const divided = text.match(/\b(?:kanda|parva|book|mandala)\s*([ivxlcdm]+|\d{1,2})\s*,?\s*(?:sarga|adhyaya|chapter|sukta|hymn)\s*(\d{1,3})(?:\s*[.,]?\s*(?:verse|sloka|shloka)\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?/i);
  let path: number[] | null = null;
  let verses: [number, number] | undefined;
  if (divided) {
    path = [romanOrNumber(divided[1]), Number(divided[2])];
    verses = verseRange(divided[3], divided[4]);
  } else if (dotted) {
    path = [romanOrNumber(dotted[1]), Number(dotted[2])];
    verses = verseRange(dotted[3], dotted[4]);
  } else if (spelled && (named || mandala)) {
    path = [named ?? romanOrNumber(mandala!), Number(spelled[1])];
    verses = verseRange(spelled[2], spelled[3]);
  }
  if (!path || path[0] < 1 || (scheme.maxBook && path[0] > scheme.maxBook) || path[1] < 1) return null;
  // "1.64.14 onward" asks for a starting verse, not the whole chapter.
  const key = `${scheme.scheme}:${path.join(".")}${verses ? `.${verses[0]}${verses[1] !== verses[0] ? `-${verses[1]}` : ""}` : ""}`;
  return { kind: "canonical", raw, key, scheme: scheme.scheme, path, verses, specific: true };
}

/** Parses one citation locator. `context` is the cited work's title or the claim text. */
export function parseLocator(rawValue: string | null | undefined, context = ""): Locator {
  const raw = (rawValue || "").trim();
  if (!raw) return { kind: "note", raw, key: "note:", specific: false };
  const doi = raw.match(/\b(10\.\d{4,9}\/[^\s"<>]+)/i)?.[1];
  if (doi) return { kind: "doi", raw, key: `doi:${doi.toLowerCase().replace(/[.,;]+$/, "")}`, doi, specific: true };
  const page = plain(raw).match(/\b(?:pp?\.|pages?)\s*(\d{1,4})(?:\s*-\s*(\d{1,4}))?/i);
  if (page) {
    const start = Number(page[1]);
    const end = page[2] && Number(page[2]) >= start ? Number(page[2]) : start;
    return { kind: "page", raw, key: `page:${start}${end !== start ? `-${end}` : ""}`, pages: [start, end], specific: end - start <= 20 };
  }
  const located = canonical(raw, context);
  if (located) return located;
  if (NOTE.test(raw)) return { kind: "note", raw, key: `note:${normalizeTransliteration(raw)}`, specific: false };
  const terms = [...new Set(normalizeTransliteration(raw).split(" ").filter((term) => term.length >= 4 && !STOP.has(term)))];
  return { kind: "section", raw, key: `section:${terms.join(" ")}`, terms, specific: terms.length > 0 };
}

/** True when `passage` covers at least the requested passage (equal or more specific). */
export function locatorCovers(requested: Locator, passage: Locator): "exact" | "containing" | "none" {
  if (requested.kind === "canonical" && passage.kind === "canonical") {
    if (requested.scheme !== passage.scheme || !requested.path || !passage.path) return "none";
    if (requested.path.join(".") !== passage.path.join(".")) return "none";
    if (!requested.verses) return "exact";
    if (!passage.verses) return "containing";
    return passage.verses[0] <= requested.verses[1] && passage.verses[1] >= requested.verses[0] ? "exact" : "none";
  }
  if (requested.kind === "page" && passage.kind === "page" && requested.pages && passage.pages)
    return passage.pages[0] <= requested.pages[1] && passage.pages[1] >= requested.pages[0] ? "exact" : "none";
  if (requested.kind === "doi" && passage.kind === "doi") return requested.doi === passage.doi ? "containing" : "none";
  return "none";
}

/**
 * Inline verse-marker syntaxes. Each yields book, chapter, first verse, and optional further verses.
 * In these conventions a marker closes the verse text before it, and one marker may close several
 * verses ("[1-65-15b, 16a]"). A new tradition's marker syntax is one more row here.
 */
export const INLINE_MARKER_SYNTAXES: Array<{ name: string; pattern: RegExp }> = [
  { name: "bracketed book-chapter-verse", pattern: /\[\s*(\d{1,2})-(\d{1,3})-(\d{1,3})[a-z]?((?:\s*,\s*\d{1,3}[a-z]?)*)\s*\]/g },
  { name: "double-danda book-chapter-verse (Latin or Devanagari digits)", pattern: /\|\|\s*([०-९\d]{1,2})-([०-९\d]{1,3})-([०-९\d]{1,3})()/g },
];

export function inlineVerseMarkers(text: string): Array<{ index: number; end: number; path: number[]; verses: [number, number] }> {
  const digits = (value: string) => Number(value.replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966)));
  const out: Array<{ index: number; end: number; path: number[]; verses: [number, number] }> = [];
  for (const syntax of INLINE_MARKER_SYNTAXES) for (const match of text.matchAll(syntax.pattern)) {
    const first = digits(match[3]);
    const more = (match[4] || "").match(/\d{1,3}/g)?.map(Number) || [];
    const last = Math.max(first, ...more.filter((value) => value > first && value - first <= 10));
    out.push({ index: match.index!, end: match.index! + match[0].length, path: [digits(match[1]), digits(match[2])], verses: [first, last] });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** The text of the cited verses inside a passage, using its inline markers; null when unmarked. */
export function citedVerseWindow(text: string, requested: Locator): string | null {
  if (requested.kind !== "canonical" || !requested.verses || !requested.path) return null;
  const markers = inlineVerseMarkers(text).filter((marker) => marker.path.join(".") === requested.path!.join("."));
  if (!markers.length) return null;
  const [first, last] = requested.verses;
  let start = -1;
  let end = -1;
  markers.forEach((marker, index) => {
    if (marker.verses[0] <= last && marker.verses[1] >= first) {
      if (start < 0) start = index > 0 ? markers[index - 1].end : 0;
      end = marker.end;
    }
  });
  return start < 0 ? null : text.slice(start, end).trim() || null;
}
