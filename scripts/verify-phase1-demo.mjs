import { readFile } from "node:fs/promises";

const baseUrl = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const dataset = JSON.parse(await readFile(new URL("../data/exports/dcf-phase1-personalities.json", import.meta.url), "utf8"));
const slug = (name) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const failures = [];

if (dataset.personalities.length !== 25) failures.push(`Expected 25 personalities; found ${dataset.personalities.length}.`);
if (dataset.phase1Presentation.categories.length !== 5) failures.push(`Expected five presentation categories; found ${dataset.phase1Presentation.categories.length}.`);
if (dataset.phase1Presentation.categories.some((category) => category.personalityIds.length !== 5)) failures.push("Every presentation category must contain five personalities.");
if (new Set(dataset.personalities.map((person) => person.id)).size !== 25) failures.push("Duplicate public personality IDs found.");
if (new Set(dataset.personalities.map((person) => slug(person.name))).size !== 25) failures.push("Duplicate public profile slugs found.");

const routes = [
  { route: "/", contains: "Explore the collection" },
  { route: "/explore", contains: "Explore lives" },
  ...dataset.personalities.map((person) => ({ route: `/explore/${slug(person.name)}`, contains: person.name })),
];

const results = await Promise.all(routes.map(async ({ route, contains }) => {
  try {
    const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
    const body = await response.text();
    const passed = response.status === 200 && body.includes(contains);
    if (!passed) failures.push(`${route}: status ${response.status}; expected page text ${JSON.stringify(contains)}.`);
    return { route, status: response.status, passed };
  } catch (error) {
    failures.push(`${route}: ${error instanceof Error ? error.message : String(error)}`);
    return { route, status: 0, passed: false };
  }
}));

if (failures.length) {
  console.error(JSON.stringify({ passed: false, checkedRoutes: results.length, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed: true,
  personalities: dataset.personalities.length,
  presentationCategories: dataset.phase1Presentation.categories.length,
  checkedRoutes: results.length,
  profileRoutes: results.filter((result) => result.route.startsWith("/explore/")).length,
}, null, 2));
