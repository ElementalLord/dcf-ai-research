import { normalizeForMatch } from "@/lib/corpus/text";

export type SupportLevel = "EXACT" | "STRONG" | "PARTIAL" | "RELATED" | "UNRESOLVED";
export type LinkAssessment = { level: SupportLevel; confidence: number; reason: string };
type Claim = { text: string; locator?: string | null; excerpt?: string | null; sourceId?: string | null; work?: string | null };
type Passage = { text: string; locator?: string | null; section?: string | null; work?: string | null; sourceId?: string | null };

/** Normative or interpretive claims are never EXACT from a passage, however close the wording. */
export const INTERPRETIVE_CLAIM = /\b(?:should|must|securely|better understood|not independent|reduced to|rather than|cannot be|value statement)\b/i;

/** The one rule for a claim→passage link counting as exact provenance in coverage and depth. */
export function isExactSupportLink(link: { relationship?: string | null; link_method?: string | null; confidence?: number | null; metadata?: { supportLevel?: string } | null }): boolean {
  return link.relationship === "supports" && (link.metadata?.supportLevel === "EXACT"
    || (!String(link.link_method || "").startsWith("adaptive_") && (link.confidence == null || link.confidence >= 0.72)));
}

/** Printed page numbers ("p. 52", "pp. 52–54"); a bare PDF index such as "Page 2" is not a printed page. */
export function printedPages(value: string): number[] {
  const match = value.match(/\bpp?\.\s*(\d{1,4})(?:\s*[–-]\s*(\d{1,4}))?/i);
  if (!match) return [];
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  return end >= start && end - start <= 20 ? Array.from({ length: end - start + 1 }, (_, index) => start + index) : [];
}

export function normalizeTransliteration(value: string): string {
  return normalizeForMatch(value).replace(/vishw/g, "visv").replace(/vishv/g, "visv")
    .replace(/sh/g, "s").replace(/sth/g, "st").replace(/w/g, "v").replace(/h(?=s)/g, "");
}

export function normalizeTextReference(value: string, workHint = ""): string | null {
  const plain = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[Ⅲ]/g, "III");
  const context = `${plain} ${workHint}`;
  const explicitRigveda = /\b(?:r[.]?v[.]?|rigveda|rgveda|mandala)\b/i.test(plain);
  const epic = explicitRigveda ? null : /ramayana|kanda|sarga|bala kanda/i.test(context) ? "ramayana"
    : /mahabharata|parva/i.test(context) ? "mahabharata" : null;
  if (epic) {
    const numeric = plain.match(/\b([1-9]\d?)\s*[.]\s*(\d{1,3})(?:\s*[.]\s*(\d{1,3}))?/);
    const book = numeric?.[1] || (/bala kanda/i.test(context) ? "1" : null);
    const sarga = numeric?.[2] || plain.match(/sarga\s*(\d{1,3})/i)?.[1];
    const verse = numeric?.[3] || plain.match(/verse\s*(\d{1,3})/i)?.[1];
    if (book && sarga) return `${epic}:${Number(book)}.${Number(sarga)}${verse ? `.${Number(verse)}` : ""}`;
    return null;
  }
  const roman = (part: string) => /^[ivxlcdm]+$/i.test(part) ? [...part.toUpperCase()].reduce((sum, letter, index, array) => {
    const current = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }[letter as "I"] || 0;
    const next = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }[array[index + 1] as "I"] || 0;
    return sum + (current < next ? -current : current);
  }, 0) : Number(part);
  const rv = plain.match(/(?:\b(?:r[.]?v[.]?|rigveda|rgveda|mandala)\s*)?\b([ivxlcdm]+|\d{1,3})\s*(?:,\s*sukta\s*|[.\s]+(?:sukta\s*)?)(\d{1,3})(?:\s*[.\s]+(\d{1,3}))?/i);
  if (!rv) return null;
  const book = roman(rv[1]);
  if (book < 1 || book > 10) return null;
  return `rv:${book}.${Number(rv[2])}${rv[3] ? `.${Number(rv[3])}` : ""}`;
}

const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "were", "have", "his", "her", "their", "rigveda", "mandala", "hymn", "verse", "text", "according"]);
function terms(value: string): Set<string> {
  return new Set(normalizeTransliteration(value).split(" ").filter((part) => part.length >= 4 && !stop.has(part)));
}
const conceptAliases: Record<string, string> = {
  rivers: "river", streams: "river", stream: "river",
  crossed: "cross", crossing: "cross", across: "cross", traverse: "cross", traversed: "cross",
  car: "wagon", wain: "wagon", wagons: "wagon",
  ask: "request", asks: "request", asking: "request", crave: "request", bidding: "request",
  answer: "answer", answers: "answer", listen: "answer", yield: "answer",
  lower: "lower", low: "lower", bow: "lower", bend: "lower",
  bharatas: "bharata", vipash: "vipas", vipasha: "vipas", shutudri: "sutudri",
  kushika: "kusika", savitr: "savitar", stimulate: "impel", impels: "impel", guide: "impel",
};
function concepts(value: string): Set<string> {
  return new Set(normalizeForMatch(value).split(" ").map((term) => conceptAliases[term] || term)
    .filter((term) => term.length >= 4 && !stop.has(term)));
}
function locatorMatches(left: string | null, right: string | null): boolean {
  return Boolean(left && right && (left === right || right.startsWith(`${left}.`) || left.startsWith(`${right}.`)));
}
export function assessClaimPassage(claim: Claim, passage: Passage, aliases: string[] = []): LinkAssessment {
  // A bare "1.65.1" belongs to the cited source's work, never to whichever passage is being compared.
  const hint = claim.text.match(/rigveda|ramayana|mahabharata/i)?.[0] || claim.work || passage.work || "";
  const claimRef = normalizeTextReference(claim.locator || "", hint) || normalizeTextReference(claim.text, hint);
  // A single-sukta or single-sarga source page carries its locator in the title when chunk labels are generic.
  const passageRef = normalizeTextReference(passage.locator || passage.section || "", passage.work || "")
    || normalizeTextReference(passage.work || "");
  // Page locators are only comparable inside the same cited source.
  const passagePages = printedPages(passage.locator || "");
  const samePage = Boolean(claim.sourceId && claim.sourceId === passage.sourceId)
    && printedPages(claim.locator || "").some((page) => passagePages.includes(page));
  const located = locatorMatches(claimRef, passageRef) || samePage;
  // Personality names say who a passage is about, not what it supports.
  const names = new Set(aliases.flatMap((alias) => [...terms(alias)]));
  const claimTerms = new Set([...terms(claim.excerpt || claim.text)].filter((term) => !names.has(term)));
  const passageTerms = terms(passage.text);
  const matches = [...claimTerms].filter((term) => passageTerms.has(term));
  const ratio = matches.length / Math.max(1, claimTerms.size);
  const nameMatch = aliases.some((alias) => {
    const name = normalizeTransliteration(alias);
    return name.length >= 5 && normalizeTransliteration(passage.text).includes(name);
  });
  const quoted = [...claim.text.matchAll(/['“”"]([^'“”"]{5,80})['“”"]/g)]
    .map((match) => normalizeTransliteration(match[1]))
    .filter((phrase) => phrase.length >= 5);
  if (/\b(?:interpretation|commentary|metadata|portal records|scholarly analysis)\b/i.test(claim.text)
    && /\b(?:rigveda|rv|veda|ramayana|mahabharata)\b/i.test(passage.work || ""))
    return { level: "RELATED", confidence: 0.3, reason: "Primary passage cannot establish commentary or catalog metadata" };
  // EXACT needs a passage locator at least as specific as the citation; a whole-sarga page cannot
  // exactly support a verse-level claim, and interpretive or normative claims are never exact from a passage.
  const granular = samePage || Boolean(claimRef && passageRef && (passageRef === claimRef || passageRef.startsWith(`${claimRef}.`)));
  const interpretive = INTERPRETIVE_CLAIM.test(claim.text);
  if (granular && !interpretive && quoted.some((phrase) => normalizeTransliteration(passage.text).includes(phrase)))
    return { level: "EXACT", confidence: 0.96, reason: "Exact locator and quoted passage wording" };
  if (granular && !interpretive && matches.length >= 3 && ratio >= 0.5)
    return { level: "EXACT", confidence: 0.94, reason: "Matching exact locator and direct passage wording" };
  if (located && matches.length >= 2 && ratio >= 0.3)
    return { level: "STRONG", confidence: 0.78, reason: "Matching textual locator with entity or partial wording" };
  if (located) {
    const passageConcepts = concepts(passage.text);
    const shared = [...concepts(claim.text)].filter((term) => passageConcepts.has(term));
    const anchor = shared.some((term) => ["bharata", "vipas", "sutudri", "kusika", "savitar"].includes(term));
    if (shared.length >= 3 || shared.length >= 2 && anchor)
      return { level: "STRONG", confidence: 0.75, reason: "Matching textual locator and distinctive translated concepts" };
  }
  if (matches.length >= 3 && ratio >= 0.6 && nameMatch)
    return { level: "STRONG", confidence: 0.76, reason: "Strong independent wording and entity overlap" };
  if (matches.length >= 2 && ratio >= 0.35 && nameMatch)
    return { level: "PARTIAL", confidence: 0.55, reason: "Partial wording and entity overlap" };
  if (located || nameMatch && matches.length > 0)
    return { level: "RELATED", confidence: 0.3, reason: located ? "Locator matches but support is insufficient" : "Entity overlap without support" };
  return { level: "UNRESOLVED", confidence: 0, reason: claimRef && !located ? "Textual reference mismatch" : "No supported claim match" };
}

export function proposeDirectNameObservation(passage: Passage, canonicalName: string, aliases: string[], representedReferences: Set<string>): string | null {
  const locator = normalizeTextReference(passage.locator || "", passage.work || "");
  if (!locator || [...representedReferences].some((reference) => locator === reference || locator.startsWith(`${reference}.`))) return null;
  const normalized = normalizeTransliteration(passage.text);
  if (![canonicalName, ...aliases].some((alias) => {
    const name = normalizeTransliteration(alias);
    return name.length >= 5 && normalized.includes(name);
  })) return null;
  const work = locator.startsWith("rv:") ? "Rigveda" : locator.startsWith("ramayana:") ? "Ramayana" : "Mahabharata";
  return `${work} ${locator.split(":")[1]} explicitly names ${canonicalName}.`;
}

export function supportsStructuredRecord(passage: string, description: string, subjectAliases: string[], objectName: string): boolean {
  const normalized = normalizeTransliteration(passage);
  const subject = subjectAliases.some((alias) => {
    const name = normalizeTransliteration(alias);
    return name.length >= 5 && normalized.includes(name);
  });
  const object = normalizeTransliteration(objectName);
  if (!subject || object.length < 5 || !normalized.includes(object)) return false;
  const descriptionTerms = terms(description);
  const passageTerms = terms(passage);
  const overlap = [...descriptionTerms].filter((term) => passageTerms.has(term)).length;
  return overlap >= 3 && overlap / Math.max(1, descriptionTerms.size) >= 0.35;
}
