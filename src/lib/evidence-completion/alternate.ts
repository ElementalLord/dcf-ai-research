import { normalizeTransliteration } from "@/lib/live-research/provenance-link";
import type { Locator } from "./locator";

/**
 * A repository that already holds approved, locator-addressed pages of one work usually addresses
 * its other chapters the same way. Given at least three stored pages whose URLs carry their own
 * chapter number, infer the template and derive the URL for the cited chapter of the same book.
 * The derived page is still fetched, content-checked, and recorded as a sibling access copy.
 */
export type LocatorTemplate = { host: string; scheme: string; book: number; template: string; examples: number };

export function inferLocatorTemplates(examples: Array<{ url: string; locator: Locator }>, minimumExamples = 3): LocatorTemplate[] {
  const groups = new Map<string, LocatorTemplate>();
  for (const example of examples) {
    const { locator } = example;
    if (locator.kind !== "canonical" || !locator.path || locator.path.length !== 2) continue;
    let url: URL;
    try { url = new URL(example.url); } catch { continue; }
    if (url.protocol !== "https:" || url.search) continue;
    const chapter = String(locator.path[1]);
    const host = url.hostname.replace(/^www\./, "");
    const pathname = url.pathname;
    // Every digit run equal to the chapter number becomes the slot; other digit runs stay literal.
    const pattern = new RegExp(`(?<!\\d)${chapter}(?!\\d)`, "g");
    if (!pattern.test(pathname)) continue;
    const template = `https://${url.hostname}${pathname.replace(pattern, "{chapter}")}`;
    const key = `${host}|${locator.scheme}|${locator.path[0]}|${template.replace(/^https:\/\/(?:www\.)?/, "")}`;
    const current = groups.get(key);
    groups.set(key, { host, scheme: locator.scheme!, book: locator.path[0], template: current?.template || template, examples: (current?.examples || 0) + 1 });
  }
  return [...groups.values()].filter((group) => group.examples >= minimumExamples).sort((a, b) => b.examples - a.examples);
}

export function siblingUrl(templates: LocatorTemplate[], requested: Locator, excludeHosts: string[] = []): Array<{ url: string; template: LocatorTemplate }> {
  if (requested.kind !== "canonical" || !requested.path) return [];
  return templates.filter((template) => template.scheme === requested.scheme && template.book === requested.path![0]
    && !excludeHosts.includes(template.host))
    .map((template) => ({ url: template.template.replaceAll("{chapter}", String(requested.path![1])), template }));
}

/** A fetched sibling page must name its own chapter and the personality before it can stand in for a citation. */
export function siblingPageConfirmed(text: string, requested: Locator, aliases: string[]): boolean {
  if (requested.kind !== "canonical" || !requested.path) return false;
  const [book, chapter] = requested.path;
  const head = text.slice(0, 4000);
  const namesChapter = new RegExp(`(?:sarga|chapter|adhyaya|sukta|hymn)\\s*${chapter}(?!\\d)|\\b${book}[-.]${chapter}[-.]\\d`, "i").test(head)
    || new RegExp(`\\[\\s*${book}-${chapter}-\\d`).test(text);
  const normalized = normalizeTransliteration(text);
  return namesChapter && aliases.some((alias) => alias.length >= 5 && normalized.includes(normalizeTransliteration(alias)));
}

/** Title overlap between a catalogue record and the cited work, ignoring volume and edition words. */
export function sameWorkTitle(recordTitle: string, workTitle: string): boolean {
  const words = (value: string) => new Set(normalizeTransliteration(value).split(" ")
    .filter((word) => word.length >= 4 && !["volume", "part", "with", "edition", "translated", "translation"].includes(word)));
  const work = words(workTitle);
  const record = words(recordTitle);
  const shared = [...work].filter((word) => record.has(word)).length;
  return work.size > 0 && shared >= Math.min(2, work.size);
}
