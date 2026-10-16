import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const audit = JSON.parse(fs.readFileSync(".corpus-cache/resource-source-audit-2026-10-10.json", "utf8"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const archiveText = {
  "in.gov.ignca.24136": "24136_djvu.txt",
  "in.gov.ignca.14189": "14189_djvu.txt",
  ancientindianhis00parguoft: "ancientindianhis00parguoft_djvu.txt",
};

async function main() {
  const linked = await db.from("source_personalities").select("source_id");
  if (linked.error) throw linked.error;
  const linkedIds = new Set(linked.data.map((row) => row.source_id));
  const scannedIds = new Set(audit.sources.map((row) => row.id));
  if (linkedIds.size !== scannedIds.size || [...linkedIds].some((id) => !scannedIds.has(id))) {
    throw new Error("Audit does not cover every source currently linked to a person; regenerate the full scan first.");
  }
  const rows = audit.sources.map((row) => {
    const checks = row.excerptChecks || [];
    const matched = checks.filter((check) => check.match === "full" || check.match?.startsWith("partial")).length;
    return {
      ...row,
      checkedExcerpts: checks.length,
      matchedExcerpts: matched,
      unmatchedExcerpts: checks.filter((check) => check.match === "missing").length,
      parallelUrl: row.url?.includes("valmiki.iitk.ac.in") ? `https://www.valmikiramayan.net/utf8/baala/sarga${new URL(row.url).searchParams.get("field_sarga_value")}/bala_${new URL(row.url).searchParams.get("field_sarga_value")}_prose.htm` :
        row.url?.startsWith("https://archive.org/details/") && archiveText[row.url.split("/").pop()] ? `https://archive.org/download/${row.url.split("/").pop()}/${archiveText[row.url.split("/").pop()]}` : "",
    };
  });
  const headers = ["people", "title", "status", "original_url", "access", "issue", "checked_excerpts", "matched_excerpts", "unmatched_excerpts", "readable_link"];
  const csv = [headers.join(","), ...rows.map((row) => [row.people.join("; "), row.title, row.sourceStatus, row.url, row.access, row.issue, row.checkedExcerpts, row.matchedExcerpts, row.unmatchedExcerpts, row.parallelUrl].map(quote).join(","))].join("\n") + "\n";
  fs.writeFileSync("docs/resource-source-audit-2026-10-10.csv", csv);

  const metadataById = new Map();
  for (let from = 0;; from += 500) {
    const page = await db.from("sources").select("id,metadata").range(from, from + 499);
    if (page.error) throw page.error;
    for (const source of page.data) metadataById.set(source.id, source.metadata || {});
    if (page.data.length < 500) break;
  }
  let annotated = 0;
  for (const row of rows) {
    const isArchive = row.url?.startsWith("https://archive.org/details/") && row.parallelUrl;
    const previous = metadataById.get(row.id) || {};
    const priorAudit = previous.resourceAudit || {};
    const knownAccessIssue = row.url?.includes("valmiki.iitk.ac.in") || row.url?.includes("gazetteers.maharashtra.gov.in");
    const evidenceNote = row.issue === "no_sample_passage_found"
      ? "Automated text matching found none of the attached evidence wording on this page. The wording may be a summary, translation, or OCR variant; verify the claim against the cited passage before relying on it."
      : row.access === "http_error" ? `Automated access returned HTTP ${row.httpStatus}; browser access may differ. Open the original and verify the cited passage.`
      : row.access === "fetch_error" ? `The automated source check failed (${row.issue}). Open the original and verify the cited passage.`
      : row.access === "no_url" ? "This record has no original source URL. It cannot independently support a research claim."
      : row.access !== "readable" ? `The original source was not fully readable by the automated checker (${row.issue}). Open it and verify the cited passage.`
      : undefined;
    const resourceAudit = {
      ...priorAudit,
      checkedAt: audit.generatedAt,
      access: knownAccessIssue ? priorAudit.access || `automated_${row.access}` : row.access === "readable" ? "readable" : `automated_${row.access}`,
      checkedExcerpts: row.checkedExcerpts,
      matchedExcerpts: row.matchedExcerpts,
      ...(isArchive ? { parallelUrl: row.parallelUrl, parallelLinkLabel: "Open full OCR text",
        parallelLabel: "This is OCR text from the same Internet Archive scan; check the page image for exact wording." } : {}),
    };
    if (knownAccessIssue) {
      if (!priorAudit.evidenceNote && evidenceNote) resourceAudit.evidenceNote = evidenceNote;
    } else if (evidenceNote) resourceAudit.evidenceNote = evidenceNote;
    else delete resourceAudit.evidenceNote;
    const update = await db.from("sources").update({ metadata: { ...previous, resourceAudit } }).eq("id", row.id).select("id").single();
    if (update.error) throw update.error;
    annotated++;
  }
  console.log(JSON.stringify({ csv: "docs/resource-source-audit-2026-10-10.csv", sources: rows.length, annotated }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
