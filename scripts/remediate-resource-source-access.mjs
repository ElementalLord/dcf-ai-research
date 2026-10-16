import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const checkedAt = new Date().toISOString();
const fail = (result) => { if (result.error) throw result.error; return result.data; };

async function main() {
  const sources = fail(await db.from("sources")
    .select("id,title,url,metadata,rights_or_access_note,source_status,approval_note")
    .or("url.ilike.%valmiki.iitk.ac.in%,url.ilike.%gazetteers.maharashtra.gov.in%,url.is.null")
    .limit(100));
  const iitk = sources.filter((source) => source.url?.includes("valmiki.iitk.ac.in"));
  const chapters = [...new Set(iitk.map((source) => Number(new URL(source.url).searchParams.get("field_sarga_value"))))];
  if (iitk.length < 30 || chapters.some((chapter) => !Number.isInteger(chapter) || chapter < 1 || chapter > 77))
    throw new Error("Unexpected IITK source set; no records changed.");
  const copies = new Map();
  for (const chapter of chapters) {
    const url = `https://www.valmikiramayan.net/utf8/baala/sarga${chapter}/bala_${chapter}_prose.htm`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok || !(await response.text()).toLowerCase().includes(`sarga ${chapter}`))
      throw new Error(`Parallel chapter ${chapter} could not be verified; no records changed.`);
    copies.set(chapter, url);
  }
  for (const source of iitk) {
    const chapter = Number(new URL(source.url).searchParams.get("field_sarga_value"));
    fail(await db.from("sources").update({
      metadata: { ...source.metadata, resourceAudit: {
        checkedAt, access: "original_tls_certificate_mismatch", parallelUrl: copies.get(chapter),
        parallelLabel: "Same chapter in a different translation; wording may differ from the cited IITK edition.",
      } },
      rights_or_access_note: "The original IITK link has a TLS certificate mismatch. A readable parallel translation of the same Bala Kanda chapter is linked below; compare editions before using a quotation.",
      updated_at: checkedAt,
    }).eq("id", source.id).select("id").single());
  }
  const gazetteers = sources.filter((source) => source.url?.includes("gazetteers.maharashtra.gov.in"));
  for (const source of gazetteers) {
    fail(await db.from("sources").update({
      metadata: { ...source.metadata, resourceAudit: { checkedAt, access: "original_tls_certificate_expired" } },
      rights_or_access_note: "The Maharashtra Gazetteers page currently presents an expired TLS certificate. Its original link is retained for provenance, but direct access cannot be guaranteed until the publisher repairs it.",
      updated_at: checkedAt,
    }).eq("id", source.id).select("id").single());
  }
  const framework = sources.find((source) => source.title === "DCF — Parameters to study Rishis" && !source.url);
  if (!framework?.metadata?.testing_only) throw new Error("Expected internal test source was not found; refusing to change claim review status.");
  const claimLinks = fail(await db.from("claim_sources").select("claim_id").eq("source_id", framework.id));
  const claimIds = [...new Set(claimLinks.map((link) => link.claim_id))];
  for (const claimId of claimIds) {
    const other = fail(await db.from("claim_sources").select("source_id").eq("claim_id", claimId).neq("source_id", framework.id));
    if (other.length) throw new Error(`Claim ${claimId} has other evidence; review manually.`);
  }
  fail(await db.from("sources").update({
    source_status: "rejected", approved_at: null, approved_by_label: null,
    approval_note: "Removed from approved research sources during source access audit: internal testing framework, no inspectable original URL, and not an external source about Vishvamitra.",
    rights_or_access_note: "Internal test framework; no public original source link.", updated_at: checkedAt,
  }).eq("id", framework.id).select("id").single());
  for (const claimId of claimIds) {
    fail(await db.from("claims").update({
      review_status: "needs_review", approved_at: null, approved_by_label: null,
      approval_note: "Returned to review during source access audit: its sole linked source is an internal test framework with no inspectable original URL.",
      updated_at: checkedAt,
    }).eq("id", claimId).select("id").single());
  }
  console.log(JSON.stringify({ iitkParallelLinks: iitk.length, distinctChapters: chapters.length,
    gazetteerWarnings: gazetteers.length, rejectedInternalTestSources: 1, claimsReturnedToReview: claimIds.length }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
