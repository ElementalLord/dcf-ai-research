import { INTERPRETIVE_CLAIM, normalizeTransliteration } from "@/lib/live-research/provenance-link";
import { citedVerseWindow, locatorCovers, parseLocator, type Locator } from "./locator";

/**
 * How the passage's source relates to the source the claim cites.
 * - same_source: the cited source itself.
 * - identical_document: a byte-identical copy of the cited document (checksum verified).
 * - same_catalogue_record: same repository record and work, file not byte-identical.
 * - same_work: another copy of the cited work addressed by an edition-independent locator.
 * - alternate_edition: same work, different or unknown edition; page numbers are not comparable.
 */
export type PassageIdentity = "same_source" | "identical_document" | "same_catalogue_record" | "same_work" | "alternate_edition";
export type CitedLevel = "EXACT" | "STRONG" | "PARTIAL" | "RELATED";
export type CitedAssessment = {
  level: CitedLevel; confidence: number; reason: string;
  identity: PassageIdentity; locatorFit: "exact" | "containing" | "none";
  matchedTerms: string[]; supportRatio: number; window: "cited_verses" | "passage";
};

/** English function words and citation vocabulary, removed BEFORE transliteration folding (which maps w→v). */
const STOP = new Set(("the and for with from that this were have has had his her him its their they them into also which when where while "
  + "after before about there these those being been than then thus such some many more most other others only even though although "
  + "over under upon onto very much what whom whose will would could should shall must may might does done doing made make makes "
  + "both each either neither between within without through throughout across again against among because since until unless "
  + "rather just like long here once part parts later early first final another same itself himself herself themselves away toward towards "
  + "text texts passage narrative narrates describes depicts presents portrays records explicitly according tradition traditional "
  + "account episode episodes story claim evidence source verse verses chapter sarga kanda parva adhyaya mandala sukta hymn hymns book "
  + "section bala includes including include shows show showing gives given give takes taken take").split(" "));

/** Strips English plural and tense endings so "wagon"/"wagons" and "cross"/"crossed" meet; no synonyms. */
export function inflection(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith("ies") && word.length > 5) return `${word.slice(0, -3)}y`;
  if (/(?:ss|us|is)$/.test(word)) return word;
  if (/(?:ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("ing") && word.length >= 7) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length >= 6) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/**
 * Each content word with its comparable forms: the inflection-stripped prefix and the raw prefix, both
 * transliteration-folded and cut to six letters. Function words are dropped first. Never a thesaurus.
 */
export function termForms(value: string, exclude: Set<string> = new Set()): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const words = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOP.has(word) && !/^\d+$/.test(word));
  for (const word of words) {
    const forms = new Set([inflection(word), word].flatMap((form) => normalizeTransliteration(form).split(" ")).filter(Boolean)
      .map((form) => form.slice(0, 6)).filter((form) => form.length >= 4));
    if (!forms.size || [...forms].some((form) => exclude.has(form))) continue;
    const key = [...forms][0];
    out.set(key, new Set([...(out.get(key) || []), ...forms]));
  }
  return out;
}

/** All comparable forms in a text (the passage side of a comparison). */
export function stems(value: string, exclude: Set<string> = new Set()): Set<string> {
  return new Set([...termForms(value, exclude).values()].flatMap((forms) => [...forms]));
}

/** Claim words whose forms appear in the passage. */
export function matchedWords(claim: Map<string, Set<string>>, passage: Set<string>): string[] {
  return [...claim].filter(([, forms]) => [...forms].some((form) => passage.has(form))).map(([key]) => key);
}

/** Stems of words capitalized mid-sentence in the claim: names of people, places, and named concepts. */
export function nameStems(claimText: string): Set<string> {
  const names = [...claimText.matchAll(/(?<![.!?:;]\s|^)(?<=\s|[("'“‘])([A-Z][a-zA-Z\u00C0-\u024F'’-]+)/g)].map((match) => match[1]);
  return new Set(names.flatMap((name) => [...termForms(name).keys()]));
}

/**
 * A claim that joins several propositions is only EXACT when every proposition finds its own wording
 * in the located text. Sentences and semicolon clauses are the propositions; one passage supporting
 * one of them leaves the whole claim below EXACT.
 */
export function propositions(claimText: string): string[] {
  return claimText.split(/(?<=[.;:])\s+(?=[A-Z])|;\s+/).map((part) => part.trim()).filter((part) => part.split(/\s+/).length >= 4);
}

/** Edit distance with an early exit, for OCR-tolerant heading lookup only (never for support wording). */
function withinEdits(left: string, right: string, limit: number): boolean {
  if (Math.abs(left.length - right.length) > limit) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++)
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    if (Math.min(...current) > limit) return false;
    previous = current;
  }
  return previous[right.length] <= limit;
}

/**
 * Whether a normalized text names a heading term. Long names tolerate OCR noise (one edit from 7
 * letters, two from 11), because scanned editions garble exactly the proper names a citation uses.
 */
export function namesTerm(normalizedText: string, term: string): boolean {
  if (normalizedText.includes(term)) return true;
  if (term.length < 7) return false;
  const limit = term.length >= 11 ? 2 : 1;
  return normalizedText.split(" ").some((token) => withinEdits(token, term, limit));
}

/** Names say who a passage is about, and work titles say where it is; neither is support. */
export function excludedStems(aliases: string[], workTitles: string[]): Set<string> {
  return new Set([...aliases, ...workTitles].flatMap((value) => [...stems(value)]));
}

function fit(requested: Locator, passage: { text: string; locators: Locator[] }, exclude: Set<string>): { fit: "exact" | "containing" | "none"; window: string | null } {
  if (requested.kind === "section") {
    // Work-title and personality words locate the work, not the heading inside it.
    const terms = (requested.terms || []).filter((term) => !exclude.has(term.slice(0, 6)));
    if (!terms.length) return { fit: "containing", window: null };
    const normalized = normalizeTransliteration(passage.text);
    const present = terms.filter((term) => namesTerm(normalized, term));
    if (!present.length) return { fit: "none", window: null };
    // One distinctive name designates an episode wherever the page names it; a multi-word title is a heading,
    // so it must dominate a line (a running head or heading), not merely occur in body text.
    const phrase = terms.join(" ");
    const headed = terms.length === 1 ? terms[0].length >= 6 && present.length === 1
      : passage.text.split(/\n/).some((line) => {
        const words = normalizeTransliteration(line).split(" ").filter((word) => word && !/^\d+$/.test(word));
        return normalizeTransliteration(line).includes(phrase) && terms.length / Math.max(1, words.length) >= 0.5;
      });
    return { fit: headed ? "exact" : "containing", window: null };
  }
  const window = citedVerseWindow(passage.text, requested);
  if (window) return { fit: "exact", window };
  const fits = passage.locators.map((locator) => locatorCovers(requested, locator));
  return { fit: fits.includes("exact") ? "exact" : fits.includes("containing") ? "containing" : "none", window: null };
}

/**
 * Citation-first assessment. The order is fixed: source identity, then locator, then direct wording.
 * EXACT needs all three: a passage from the cited source or a verified copy of the cited work, a
 * locator at least as specific as the citation, and the atomic claim's own content terms in that
 * located text. Interpretive or normative claims are never EXACT. Alternate editions cap at STRONG
 * because their page or section boundaries are not the cited edition's.
 */
export function assessCitedPassage(input: {
  claimText: string;
  requested: Locator;
  identity: PassageIdentity;
  passage: { text: string; locators: Locator[] };
  exclude: Set<string>;
}): CitedAssessment {
  const { requested, identity } = input;
  const located = fit(requested, input.passage, input.exclude);
  const claimTerms = termForms(input.claimText, input.exclude);
  const passageTerms = stems(located.window || input.passage.text, input.exclude);
  const matchedTerms = matchedWords(claimTerms, passageTerms);
  const ratio = Number((matchedTerms.length / Math.max(1, claimTerms.size)).toFixed(2));
  const base = { identity, locatorFit: located.fit, matchedTerms, supportRatio: ratio,
    window: located.window ? "cited_verses" as const : "passage" as const };
  if (located.fit === "none") return { ...base, level: "RELATED", confidence: 0.2, reason: "Cited work found but not the cited location" };
  const interpretive = INTERPRETIVE_CLAIM.test(input.claimText);
  // Page and section boundaries belong to one document: only the cited source or a byte-identical copy keeps them.
  // A canonical (edition-independent) locator found in another copy of the same work is stable; an alternate edition never is.
  const editionStable = identity === "same_source" || identity === "identical_document"
    || (requested.kind === "canonical" && (identity === "same_work" || identity === "same_catalogue_record"));
  // Names say who and where, not what happened: EXACT also needs the claim's other words — three of them,
  // or at least half of them (two, or the only one) for a short claim.
  const names = nameStems(input.claimText);
  const substantive = matchedTerms.filter((term) => !names.has(term)).length;
  const otherWords = [...claimTerms.keys()].filter((term) => !names.has(term)).length;
  const actionShown = substantive >= 3 || substantive >= Math.min(2, otherWords) && substantive > 0 && substantive / Math.max(1, otherWords) >= 0.5;
  const direct = matchedTerms.length >= 3 && ratio >= 0.5;
  const parts = propositions(input.claimText);
  const everyProposition = parts.length <= 1 || parts.every((part) => {
    const terms = termForms(part, input.exclude);
    const hits = matchedWords(terms, passageTerms).length;
    return hits >= 2 && hits / Math.max(1, terms.size) >= 0.4;
  });
  if (located.fit === "exact" && editionStable && !interpretive && direct && everyProposition && actionShown)
    return { ...base, level: "EXACT", confidence: 0.95, reason: "Cited source identity, cited locator, and the claim's own wording in the located text" };
  if (direct || matchedTerms.length >= 2 && ratio >= 0.3)
    return { ...base, level: "STRONG", confidence: 0.78, reason: interpretive && direct ? "Located passage supports the content; the claim adds interpretation"
      : located.fit !== "exact" ? "Passage contains the cited location but is broader than the citation"
        : direct && !everyProposition ? "Compound claim: the located text supports only some of its propositions"
          : direct && !actionShown ? "Matched wording is mostly names; the claim's action is not shown in the located text"
        : !editionStable ? "Alternate edition; the cited edition's boundaries are not verified"
          : "Located passage supports part of the claim's wording" };
  if (matchedTerms.length >= 2 || matchedTerms.length >= 1 && ratio >= 0.2)
    return { ...base, level: "PARTIAL", confidence: 0.55, reason: "Located passage supports only part of the claim" };
  return { ...base, level: "RELATED", confidence: 0.3, reason: "Cited location found; its wording does not support the claim" };
}

/** Locators a stored passage carries in its labels, its source title, or its inline verse markers. */
export function passageLocators(chunk: { pageOrSection: string | null; sectionTitle: string | null; sourceTitle: string; work: string }): Locator[] {
  return [chunk.pageOrSection, chunk.sectionTitle, chunk.sourceTitle]
    .filter((value): value is string => Boolean(value))
    .map((value) => parseLocator(value, chunk.work))
    .filter((locator) => locator.kind === "canonical" || locator.kind === "page" || locator.kind === "doi");
}
