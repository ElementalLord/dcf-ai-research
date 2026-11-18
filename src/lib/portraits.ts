import "server-only";

/**
 * Portraits come from the lead image of each person's English Wikipedia article (hosted on
 * Wikimedia Commons). The lookup runs on the server, is cached for a week, and every image keeps
 * its author, licence and Commons page so the site can credit it. When Wikipedia is unreachable
 * the site falls back to initials, so a failed lookup never breaks a page.
 */
export type Portrait = { src: string; author: string; license: string; source: string };

export const WIKIPEDIA_TITLES: Record<string, string> = {
  "a-p-j-abdul-kalam": "A. P. J. Abdul Kalam", "adi-shankaracharya": "Adi Shankara", agastya: "Agastya", ashoka: "Ashoka",
  "bhagat-singh": "Bhagat Singh", "c-v-raman": "C. V. Raman", "chhatrapati-shivaji-maharaj": "Shivaji", "guru-nanak": "Guru Nanak",
  "j-r-d-tata": "J. R. D. Tata", "jagadish-chandra-bose": "Jagadish Chandra Bose", "jamsetji-tata": "Jamsetji Tata",
  "m-s-subbulakshmi": "M. S. Subbulakshmi", "rabindranath-tagore": "Rabindranath Tagore", "rajaraja-chola-i": "Rajaraja I",
  "ramakrishna-paramahamsa": "Ramakrishna", "rani-lakshmibai-of-jhansi": "Rani of Jhansi", "satyajit-ray": "Satyajit Ray",
  "savitribai-phule": "Savitribai Phule", "srinivasa-ramanujan": "Srinivasa Ramanujan", "subhas-chandra-bose": "Subhas Chandra Bose",
  "swami-vivekananda": "Swami Vivekananda", vasistha: "Vasishtha", "verghese-kurien": "Verghese Kurien", vishvamitra: "Vishvamitra",
  yajnavalkya: "Yajnavalkya",
};

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
  try {
    const response = await fetch(`${API}?${new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params })}`,
      { headers: HEADERS, next: { revalidate: WEEK }, signal: AbortSignal.timeout(5000) });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

/** Portraits for the given profile slugs, keyed by slug. People without a usable image are left out. */
export async function getPortraits(slugs: string[], extraTitles: Record<string, string> = {}, photos: Record<string, Portrait> = {}): Promise<Record<string, Portrait>> {
  // A photo chosen in Resources always wins; Wikipedia is only asked about everyone else.
  const chosen = Object.fromEntries(slugs.filter((slug) => photos[slug]).map((slug) => [slug, photos[slug]]));
  const looked = await wikipediaPortraits(slugs.filter((slug) => !photos[slug]), extraTitles);
  return { ...looked, ...chosen };
}

async function wikipediaPortraits(slugs: string[], extraTitles: Record<string, string>): Promise<Record<string, Portrait>> {
  // Titles set in Resources override the built-in ones, so an editor can fix a wrong portrait.
  const titles: Record<string, string> = { ...WIKIPEDIA_TITLES, ...extraTitles };
  const wanted = [...new Set(slugs.filter((slug) => titles[slug]))];
  if (!wanted.length) return {};
  // Wikipedia answers at most 50 titles per query, so a larger collection is looked up in batches.
  if (wanted.length > 50) {
    const batches = await Promise.all(Array.from({ length: Math.ceil(wanted.length / 50) }, (_, index) => wikipediaPortraits(wanted.slice(index * 50, index * 50 + 50), extraTitles)));
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
