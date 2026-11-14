// Re-applies data/phase1-curation.json to the checked-in Phase 1 export and
// regenerates the Mentor review package. Needs no database access:
//
//   node scripts/apply-phase1-curation.mjs
//
// The live-database exporter applies the same curation, so the two paths agree.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyPhase1Curation, renderMentorReviewDocs } from "./lib/phase1-curation.mjs";

const ROOT = process.cwd();
const EXPORT_PATH = path.join(ROOT, "data/exports/dcf-phase1-personalities.json");
const CURATION_PATH = path.join(ROOT, "data/phase1-curation.json");
const REVIEW_DIR = path.join(ROOT, "docs/phase1/mentor-review");

const dataset = JSON.parse(await readFile(EXPORT_PATH, "utf8"));
const curation = JSON.parse(await readFile(CURATION_PATH, "utf8"));
applyPhase1Curation(dataset, curation);
await writeFile(EXPORT_PATH, `${JSON.stringify(dataset, null, 2)}\n`);

await rm(REVIEW_DIR, { recursive: true, force: true });
await mkdir(REVIEW_DIR, { recursive: true });
for (const [filename, content] of Object.entries(renderMentorReviewDocs(dataset))) {
  await writeFile(path.join(REVIEW_DIR, filename), content);
}

console.log(JSON.stringify({
  exportPath: path.relative(ROOT, EXPORT_PATH),
  personalities: dataset.personalities.length,
  limitedInformationSections: dataset.summary.limitedInformationSectionCount,
  studyFrameworkProfiles: dataset.summary.studyFrameworkProfiles,
}, null, 2));
