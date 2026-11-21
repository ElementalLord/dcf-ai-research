// Saves the current Wikipedia portrait (and its credit) for each built-in person to
// data/portrait-snapshot.json. The site uses the snapshot only when Wikipedia can't be reached,
// so a temporary outage never swaps a photo for initials. Re-run after changing
// data/portrait-titles.json, then commit the result:
//
//   node scripts/refresh-portrait-snapshot.mjs
import { readFile, writeFile } from "node:fs/promises";

const titles = JSON.parse(await readFile(new URL("../data/portrait-titles.json", import.meta.url), "utf8"));
const API = "https://en.wikipedia.org/w/api.php";
const HEADERS = { "User-Agent": "dcf-inspiring-personalities/1.0 (portrait lookup with attribution)" };
const strip = (html = "") => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const wiki = async (params) => {
  const response = await fetch(`${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`, { headers: HEADERS });
  if (!response.ok) throw new Error(`Wikipedia answered ${response.status}`);
  return response.json();
};

// Same query and settings as src/lib/portraits.ts, so the snapshot matches what the site shows.
const pages = await wiki({ action: "query", prop: "pageimages", piprop: "thumbnail|name", pithumbsize: "400", redirects: "1", titles: Object.values(titles).join("|") });
const resolve = (title) => {
  const normalized = pages.query.normalized?.find((item) => item.from === title)?.to ?? title;
  return pages.query.redirects?.find((item) => item.from === normalized)?.to ?? normalized;
};
const byTitle = new Map(pages.query.pages.map((page) => [page.title, page]));
const found = Object.entries(titles).flatMap(([slug, title]) => {
  const page = byTitle.get(resolve(title));
  return page?.pageimage && page.thumbnail?.source ? [{ slug, file: `File:${page.pageimage}`, src: page.thumbnail.source }] : [];
});
const info = await wiki({ action: "query", prop: "imageinfo", iiprop: "url|extmetadata", titles: found.map((item) => item.file).join("|") });
const fileInfo = new Map(info.query.pages.map((page) => [page.title.replace(/_/g, " "), page.imageinfo?.[0]]));

const snapshot = Object.fromEntries(found.map(({ slug, file, src }) => {
  const details = fileInfo.get(file.replace(/_/g, " "));
  const meta = details?.extmetadata ?? {};
  return [slug, {
    src,
    author: strip(meta.Artist?.value) || "Unknown author",
    license: strip(meta.LicenseShortName?.value) || "See source",
    source: details?.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(file.replace(/ /g, "_"))}`,
  }];
}));
await writeFile(new URL("../data/portrait-snapshot.json", import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`);
const missing = Object.keys(titles).filter((slug) => !snapshot[slug]);
console.log(`Saved ${Object.keys(snapshot).length} portraits.${missing.length ? ` No image on Wikipedia for: ${missing.join(", ")}` : ""}`);
