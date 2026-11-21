import "server-only";
import titlesFile from "../../data/portrait-titles.json";
import snapshot from "../../data/portrait-snapshot.json";

/**
 * Portraits come from the lead image of each person's English Wikipedia article (hosted on
 * Wikimedia Commons). The lookup runs on the server, is cached for a week, and every image keeps
 * its author, licence and Commons page so the site can credit it. When Wikipedia is unreachable
 * the site falls back to initials, so a failed lookup never breaks a page.
 *
 * Every page asks for the whole collection in one identical request, so all pages share one cached
 * answer and always show the same photo for a person. If Wikipedia is unreachable, the built-in
 * people fall back to data/portrait-snapshot.json (refresh it with scripts/refresh-portrait-snapshot.mjs).
 */
export type Portrait = { src: string; author: string; license: string; source: string };

/** Wikipedia article for each built-in person, by profile slug. */
export const WIKIPEDIA_TITLES: Record<string, string> = titlesFile;

const API = "https://en.wikipedia.org/w/api.php";
const WEEK = 60 * 60 * 24 * 7;
const HEADERS = { "User-Agent": "dcf-inspiring-personalities/1.0 (portrait lookup with attribution)" };
const strip = (html = "") => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

type PageImagesResponse = { query?: {
  normalized?: Array<{ from: string; to: string }>;
  redirects?: Array<{ from: string; to: string }>;
  pages?: Array<{ title: string; pageimage?: string; thumbnail?: { source: string } }>;
} };
type ImageInfoResponse = { query?: { pages?: Array<{ title: string; imageinfo?: Array<{ descriptionurl: string; extmetadata?: Record<string, { value?: string }> }> }> } };

async function wiki<T>(params: Record<string, string>): Promise<T | null> {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params })}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS, next: { revalidate: WEEK }, signal: AbortSignal.timeout(8000) });
      if (response.ok) return await response.json() as T;
    } catch { /* retried below */ }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return null;
}

const SNAPSHOT = snapshot as Record<string, Portrait>;
const MEMO_MS = 10 * 60 * 1000;
let memo: { key: string; at: number; result: Promise<Record<string, Portrait>> } | null = null;

/** Portraits for every person with a Wikipedia title. One shared request, reused for ten minutes. */
function collectionPortraits(titles: Record<string, string>) {
  const sorted = Object.fromEntries(Object.entries(titles).sort(([a], [b]) => a.localeCompare(b)));
  const key = JSON.stringify(sorted);
  if (memo && memo.key === key && Date.now() - memo.at < MEMO_MS) return memo.result;
  const result = wikipediaPortraits(Object.keys(sorted), sorted);
  const entry = { key, at: Date.now(), result };
  memo = entry;
  // Only keep a complete answer; a partial one is retried on the next request.
  result.then((found) => { if (memo === entry && Object.keys(found).length < Object.keys(sorted).length) memo = null; }, () => { if (memo === entry) memo = null; });
  return result;
}

/** Portraits for the given profile slugs, keyed by slug. People without a usable image are left out. */
export async function getPortraits(slugs: string[], extraTitles: Record<string, string> = {}, photos: Record<string, Portrait> = {}): Promise<Record<string, Portrait>> {
  // A photo chosen in Resources always wins; Wikipedia is only asked about everyone else.
  const chosen = Object.fromEntries(slugs.filter((slug) => photos[slug]).map((slug) => [slug, photos[slug]]));
  const titles = { ...WIKIPEDIA_TITLES, ...extraTitles };
  const looked = slugs.some((slug) => !photos[slug] && titles[slug]) ? await collectionPortraits(titles) : {};
  // The snapshot only stands in for a built-in person whose Wikipedia title hasn't been changed.
  const saved = (slug: string) => (!extraTitles[slug] || extraTitles[slug] === WIKIPEDIA_TITLES[slug]) ? SNAPSHOT[slug] : undefined;
  return Object.fromEntries(slugs.flatMap((slug) => {
    const portrait = chosen[slug] ?? looked[slug] ?? saved(slug);
    return portrait ? [[slug, portrait]] : [];
  }));
}

async function wikipediaPortraits(slugs: string[], titles: Record<string, string>): Promise<Record<string, Portrait>> {
  // Titles set in Resources override the built-in ones (merged by the caller), so an editor can fix a wrong portrait.
  const wanted = [...new Set(slugs.filter((slug) => titles[slug]))];
  if (!wanted.length) return {};
  // Wikipedia answers at most 50 titles per query, so a larger collection is looked up in batches.
  if (wanted.length > 50) {
    const batches = await Promise.all(Array.from({ length: Math.ceil(wanted.length / 50) }, (_, index) => wikipediaPortraits(wanted.slice(index * 50, index * 50 + 50), titles)));
    return Object.assign({}, ...batches);
  }
  const pages = await wiki<PageImagesResponse>({ action: "query", prop: "pageimages", piprop: "thumbnail|name", pithumbsize: "400", redirects: "1", titles: wanted.map((slug) => titles[slug]).join("|") });
  if (!pages?.query?.pages) return {};
  // Follow Wikipedia's title normalisation and redirects back to the title each slug asked for.
  const resolve = (title: string) => {
    const normalized = pages.query?.normalized?.find((item) => item.from === title)?.to ?? title;
    return pages.query?.redirects?.find((item) => item.from === normalized)?.to ?? normalized;
  };
  const byTitle = new Map(pages.query.pages.map((page) => [page.title, page]));
  const found = wanted.flatMap((slug) => {
    const page = byTitle.get(resolve(titles[slug]));
    return page?.pageimage && page.thumbnail?.source ? [{ slug, file: `File:${page.pageimage}`, src: page.thumbnail.source }] : [];
  });
  if (!found.length) return {};
  const info = await wiki<ImageInfoResponse>({ action: "query", prop: "imageinfo", iiprop: "url|extmetadata", titles: found.map((item) => item.file).join("|") });
  const fileInfo = new Map((info?.query?.pages ?? []).map((page) => [page.title.replace(/_/g, " "), page.imageinfo?.[0]]));
  return Object.fromEntries(found.map(({ slug, file, src }) => {
    const details = fileInfo.get(file.replace(/_/g, " "));
    const meta = details?.extmetadata ?? {};
    return [slug, {
      src,
      author: strip(meta.Artist?.value) || "Unknown author",
      license: strip(meta.LicenseShortName?.value) || "See source",
      source: details?.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(file.replace(/ /g, "_"))}`,
    } satisfies Portrait];
  }));
}

/** Profile slug for a display name, matching how the dataset builds slugs. */
export function slugForName(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
