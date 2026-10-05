import * as cheerio from "cheerio";
import { canonicalResearchUrl, type SourceAccessRule, selectSourceAuthorization } from "./source-policy";

export type VerificationStatus = "VERIFIED_WORK" | "APPROVED_FOR_EVIDENCE" | "BIBLIOGRAPHIC_ONLY" | "REJECTED_LOW_QUALITY" | "REJECTED_UNVERIFIABLE" | "REJECTED_SECURITY" | "REJECTED_DUPLICATE";
export type Verification = {
  candidate_url: string; canonical_url: string; domain: string; title: string | null; author: string | null;
  editor: string | null; translator: string | null; institution: string | null; publisher: string | null;
  journal: string | null; publication_year: string | null; doi: string | null; isbn: string | null;
  edition: string | null; work_title: string | null; source_family: string | null; source_type: string | null;
  textual_layer: string | null; full_text_status: string; independent_work_key: string | null;
  access_notes: string | null;
  credibility_signals: string[]; credibility_failures: string[]; verification_status: VerificationStatus;
  verification_reason: string; approval_origin: "verified_auto" | null; verified_at: string;
};

function familyPath(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  // Never promote an entire host or a root-level section.
  return parts.length >= 3 ? `/${parts.slice(0, 2).join("/")}/` : null;
}

export function inheritedInstitutionForUrl(rawUrl: string, families: Array<{ domain: string; path_prefix: string; institution: string }>): string | null {
  const url = new URL(canonicalResearchUrl(rawUrl));
  const family = families.find((item) => item.domain === url.hostname && item.path_prefix.startsWith("/")
    && item.path_prefix.endsWith("/") && item.path_prefix.split("/").filter(Boolean).length >= 2
    && url.pathname.startsWith(item.path_prefix));
  return family?.institution || null;
}

export function relevantChildLinks(html: string, parentUrl: string, aliases: string[]): string[] {
  const parent = new URL(canonicalResearchUrl(parentUrl));
  const $ = cheerio.load(html);
  const out = new Set<string>();
  const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  $("a[href]").each((_, element) => {
    if (out.size >= 2) return false;
    const label = normalized($(element).text());
    if (!aliases.some((alias) => alias.length >= 5 && label.includes(normalized(alias)))) return;
    try {
      const child = new URL($(element).attr("href") || "", parent);
      if (child.protocol !== "https:" || child.hostname !== parent.hostname || child.username || child.password) return;
      if (!child.pathname.startsWith(parent.pathname.endsWith("/") ? parent.pathname : `${parent.pathname}/`)) return;
      const canonical = canonicalResearchUrl(child.toString());
      if (canonical !== parent.toString()) out.add(canonical);
    } catch { /* Invalid links are never candidates. */ }
  });
  return [...out];
}

export function scopedNavigationLinks(html: string, pageUrl: string, scope: { domain: string; path_prefix: string }, aliases: string[], max = 8): string[] {
  const page = new URL(canonicalResearchUrl(pageUrl));
  if (page.hostname !== scope.domain || !page.pathname.startsWith(scope.path_prefix)
    || scope.path_prefix.split("/").filter(Boolean).length < 2) return [];
  const $ = cheerio.load(html);
  const out = new Set<string>();
  const terms = aliases.map((alias) => alias.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()).filter((alias) => alias.length >= 5);
  $("a[href]").each((_, element) => {
    if (out.size >= max) return false;
    const label = $(element).text().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!terms.some((term) => label.includes(term)) && !/mandala|sukta|hymn|kanda|sarga|chapter|verse|contents|index/i.test(label)) return;
    try {
      const url = new URL($(element).attr("href") || "", page);
      if (url.protocol !== "https:" || url.hostname !== scope.domain || url.username || url.password
        || !url.pathname.startsWith(scope.path_prefix)) return;
      const canonical = canonicalResearchUrl(url.toString());
      if (canonical !== page.toString()) out.add(canonical);
    } catch { /* Invalid links are never candidates. */ }
  });
  return [...out];
}

export function duplicateWorkOf(candidate: Verification, admitted: Array<{ canonical_url: string; independent_work_key: string | null }>): string | null {
  if (!candidate.independent_work_key) return null;
  return admitted.find((item) => item.independent_work_key === candidate.independent_work_key
    && canonicalResearchUrl(item.canonical_url) !== candidate.canonical_url
    && (new URL(item.canonical_url).hostname !== candidate.domain
      || familyPath(new URL(item.canonical_url)) !== familyPath(new URL(candidate.canonical_url))))?.canonical_url || null;
}

export function scholarlyWorkKey(input: { doi?: string | null; isbn?: string | null; title?: string | null; author?: string | null; year?: string | null; publisher?: string | null; journal?: string | null }): string | null {
  const doi = input.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim().toLowerCase();
  if (doi) return doi;
  const isbn = input.isbn?.replace(/[^0-9x]/gi, "").toLowerCase();
  if (isbn && isbn.length >= 10) return `isbn:${isbn}`;
  const clean = (value?: string | null) => (value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const title = clean(input.title);
  const author = clean(input.author);
  if (title.length < 16 || !author) return null;
  return `work:${title}|${author}|${clean(input.year)}|${clean(input.publisher || input.journal)}`;
}

export function verifiedFamilyScope(items: Verification[]): { domain: string; path: string } | null {
  const eligible = items.filter((item) => item.verification_status === "APPROVED_FOR_EVIDENCE" && item.institution && item.source_family);
  if (eligible.length < 3) return null;
  const [first] = eligible;
  const matching = eligible.filter((item) => item.domain === first.domain && item.source_family === first.source_family
    && item.institution === first.institution);
  if (matching.length < 3 || new Set(matching.map((item) => item.canonical_url)).size < 3) return null;
  const parentSegments = matching.map((item) => new URL(item.canonical_url).pathname.split("/").filter(Boolean).slice(0, -1));
  const common = parentSegments[0].filter((segment, index) => parentSegments.every((parts) => parts[index] === segment));
  if (common.length < 2) return null;
  return { domain: first.domain, path: `/${common.join("/")}/` };
}

export function projectDescriptionEvidence(html: string, institution: string): boolean {
  const $ = cheerio.load(html);
  const text = normalizeProjectText($("body").text());
  const name = normalizeProjectText(institution);
  return Boolean(name.length >= 6 && text.includes(name)
    && /project|portal|digital edition|research initiative/.test(text)
    && /editor|method|translation|manuscript|textual|edition|scholar/.test(text));
}

function normalizeProjectText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function projectDescriptionLinks(html: string, pageUrl: string): string[] {
  const page = new URL(canonicalResearchUrl(pageUrl));
  const $ = cheerio.load(html);
  const out: string[] = [];
  $("a[href]").each((_, element) => {
    if (out.length >= 2 || !/about|method|editorial|project/i.test($(element).text())) return;
    try {
      const url = new URL($(element).attr("href") || "", page);
      if (url.protocol === "https:" && url.hostname === page.hostname && !url.username && !url.password)
        out.push(canonicalResearchUrl(url.toString()));
    } catch { /* Ignore invalid project links. */ }
  });
  return [...new Set(out)];
}

const empty = (candidateUrl: string, finalUrl: string, status: VerificationStatus, reason: string): Verification => {
  const url = new URL(canonicalResearchUrl(finalUrl));
  return { candidate_url: candidateUrl, canonical_url: url.toString(), domain: url.hostname, title: null, author: null,
    editor: null, translator: null, institution: null, publisher: null, journal: null, publication_year: null,
    doi: null, isbn: null, edition: null, work_title: null, source_family: null, source_type: null,
    textual_layer: null, full_text_status: "unavailable", independent_work_key: null,
    access_notes: null,
    credibility_signals: [], credibility_failures: [reason], verification_status: status,
    verification_reason: reason, approval_origin: null, verified_at: new Date().toISOString() };
};

export function rejectedVerification(url: string, status: VerificationStatus, reason: string): Verification {
  return empty(url, url, status, reason);
}

/** Item record from archive.org's metadata API plus a bounded search-inside count for the personality. */
export type ArchiveItemRecord = {
  identifier: string; title: string | null; creator: string | null; date: string | null; publisher: string | null;
  contributor: string | null; scanningCenter: string | null; copyrightStatus: string | null;
  licenseUrl: string | null; rights: string | null; nameMatches: number;
};

export function archiveItemIdentifier(rawUrl: string): string | null {
  const url = new URL(rawUrl);
  if (url.hostname !== "archive.org") return null;
  return url.pathname.match(/^\/details\/([A-Za-z0-9._-]+)\/?$/)?.[1] || null;
}

// Hosting on archive.org is never a rights signal; only the item's own rights metadata is.
const rightsClearStatement = /\bpublic domain\b|\bno known copyright\b|\bnot in copyright\b|rightsstatements\.org\/vocab\/(?:NoC-US|NKC)|creativecommons\.org\/publicdomain/i;
const openLicense = /creativecommons\.org\/licenses|\bcc[- ]by\b|\bcc0\b|\bopen access\b/i;

export function verifyCandidate(input: {
  candidateUrl: string; finalUrl: string; status: number; contentType: string; html: string;
  personalityAliases: string[]; rules: SourceAccessRule[]; autoAdmit: boolean; inheritedInstitution?: string | null;
  archiveItem?: ArchiveItemRecord | null;
}): Verification {
  const row = empty(input.candidateUrl, input.finalUrl, "REJECTED_UNVERIFIABLE", "Insufficient provenance");
  const url = new URL(row.canonical_url);
  if (url.protocol !== "https:") return { ...row, verification_status: "REJECTED_SECURITY", verification_reason: "HTTPS required", credibility_failures: ["HTTPS required"] };
  if (input.status === 401 || input.status === 403 || input.status === 402) return { ...row, verification_reason: "Restricted page without verifiable bibliography", full_text_status: "restricted" };
  if (input.status !== 200 || !input.html) return { ...row, verification_reason: `No inspectable HTML (HTTP ${input.status})`, credibility_failures: ["No inspectable original metadata"] };
  const $ = cheerio.load(input.html);
  const meta = (...names: string[]) => names.map((name) => $(`meta[name="${name}"],meta[property="${name}"]`).first().attr("content")?.trim()).find(Boolean) || null;
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const archiveId = archiveItemIdentifier(row.canonical_url);
  const item = archiveId && input.archiveItem?.identifier === archiveId ? input.archiveItem : null;
  const title = item?.title || meta("citation_title", "dc.title") || $("title").first().text().trim() || meta("og:title") || null;
  const author = item ? item.creator : meta("citation_author", "dc.creator", "author");
  const editor = meta("citation_editor", "dc.contributor.editor");
  const publicDomainAttribution = text.slice(0, 2500).match(/Translated by\s+([^,(]{5,90})\s*\((1[6789]\d{2})[^)]*public domain/i);
  const translator = meta("citation_translator") || publicDomainAttribution?.[1]?.trim() || null;
  const institution = item ? item.contributor
    : meta("citation_institution", "dc.publisher.institution", "institution") || input.inheritedInstitution || null;
  const publisher = item ? item.publisher : meta("citation_publisher", "dc.publisher", "publisher");
  const journal = meta("citation_journal_title", "citation_conference_title");
  const publication_year = (item ? item.date : meta("citation_date", "citation_publication_date", "dc.date"))?.match(/\b(?:1[5-9]|20)\d{2}\b/)?.[0] || publicDomainAttribution?.[2] || null;
  const doi = meta("citation_doi", "dc.identifier.doi") || null;
  const isbn = meta("citation_isbn") || null;
  const edition = meta("citation_edition", "dc.relation.ispartof") || null;
  const work_title = item?.title || meta("citation_book_title", "citation_journal_title") ||
    (title?.split(/\s+[—–|-]\s+/).slice(-2, -1)[0]?.trim() || null);
  const license = item ? item.licenseUrl || ""
    : $("link[rel='license']").attr("href") || meta("citation_license", "license") || "";
  const rightsStatement = item ? [item.rights, item.copyrightStatus === "NOT_IN_COPYRIGHT" ? "Not in copyright" : null].filter(Boolean).join("; ")
    : meta("dc.rights", "dcterms.rights", "dc.rights.uri") || "";
  // A: explicit acceptable open license.
  const explicitLicense = openLicense.test(license) || openLicense.test(rightsStatement)
    || /\b(open access|creative commons)\b/i.test($("a[rel='license']").text());
  // B: explicit public-domain or rights-clear metadata.
  const rightsClear = rightsClearStatement.test(`${license} ${rightsStatement}`)
    || /\bpublic domain\b/i.test($("a[rel='license']").text()) || Boolean(publicDomainAttribution);
  // C: the original publisher itself declares the full text freely readable.
  const publisherOpen = !item && (/^(?:yes|true|1)$/i.test(meta("citation_fulltext_world_readable") || "")
    || /\b(?:open|free|public)\b/i.test(meta("dcterms.accessRights", "dc.accessRights", "citation_access") || ""));
  // D: a scan whose item record names the work and its creator, date, scanning library, and rights.
  const scanProvenance = Boolean(item && item.title && item.creator && publication_year && (item.contributor || item.scanningCenter));
  const access = explicitLicense ? "explicit open license" : item ? (scanProvenance && rightsClear ? "rights-clear public-domain scan" : null)
    : rightsClear ? "explicit public-domain or rights-clear metadata" : publisherOpen ? "free full text declared by the original publisher" : null;
  const openAccess = Boolean(access);
  const relevant = item ? item.nameMatches > 0
    : input.personalityAliases.some((alias) => alias.length >= 5 && (title || "").toLowerCase().includes(alias.toLowerCase()))
    || input.personalityAliases.some((alias) => alias.length >= 5 && text.toLowerCase().includes(alias.toLowerCase()));
  const lowQuality = /(?:^|\.)(?:quora|reddit|facebook|pinterest|wikipedia)\.(?:com|org)$/.test(url.hostname)
    || /\b(blogspot|wordpress\.com|medium\.com)\b/.test(url.hostname)
    || /(?:ai.generated|written by ai|content farm)/i.test(text.slice(0, 2000));
  const signals: string[] = [];
  const failures: string[] = [];
  if (institution) signals.push(input.inheritedInstitution && !meta("citation_institution", "dc.publisher.institution", "institution")
    ? `Institution inherited from verified project: ${institution}` : `Named institution: ${institution}`); else failures.push("No named institution");
  if (publisher) signals.push(`Publisher: ${publisher}`);
  if (author) signals.push(`Named author: ${author}`); else if (editor) signals.push(`Named editor: ${editor}`);
  else if (translator) signals.push(`Named translator: ${translator}`); else failures.push("No named author, editor, or translator");
  if (doi) signals.push(`DOI: ${doi}`);
  if (journal) signals.push(`Journal: ${journal}`);
  if (edition) signals.push(`Edition: ${edition}`);
  if (access) signals.push(`Lawful access: ${access}`);
  else failures.push(item ? "Archive item lacks verifiable rights or scan provenance" : "No verifiable open-access or rights-clear status");
  if (item?.copyrightStatus) signals.push(`Archive item rights metadata: ${item.copyrightStatus}`);
  if (!relevant) failures.push(item ? "Personality not confirmed in the scanned text" : "Personality not present in original page");
  if (lowQuality) failures.push("Low-quality platform or content signal");
  const institutionHost = Boolean(institution && /\.(edu|ac\.[a-z]{2}|gov|gov\.[a-z]{2})$/.test(url.hostname));
  // A registered DOI with named author, journal, and year identifies the work even when the publisher tag is absent.
  const scholarlyRecord = Boolean(doi && author && journal && publication_year);
  const primary = Boolean(edition && editor && work_title && institutionHost);
  const publicDomainWork = Boolean(publicDomainAttribution && work_title && publication_year
    && /[\u0900-\u097f]/.test(text) && (text.match(/\b\d{1,3}\.\d{1,3}(?:\.\d{1,3})?\b/g) || []).length >= 10);
  if (publicDomainWork) signals.push(`Public-domain primary work with original script and verse references: ${work_title}`);
  const identifiedScan = Boolean(item && item.title && item.creator && publication_year && (publisher || institution));
  if (identifiedScan) signals.push(`Identified scanned work: ${item!.title} (${item!.creator}, ${publication_year})`);
  const credible = !lowQuality && relevant && (publicDomainWork || identifiedScan || ((institutionHost || scholarlyRecord)
    && (author || editor) && (doi || edition || (journal && publication_year))));
  // A scan's details page is a viewer, not the text; it is eligible but never auto-ingested from that page.
  const fullText = !item && text.length >= 1200 && openAccess;
  const prior = selectSourceAuthorization(row.canonical_url, input.rules, "fetch", true);
  const status: VerificationStatus = lowQuality ? "REJECTED_LOW_QUALITY"
    : !relevant ? "REJECTED_UNVERIFIABLE"
      : !credible ? "REJECTED_UNVERIFIABLE"
        : item && openAccess ? "VERIFIED_WORK"
          : fullText ? (input.autoAdmit ? "APPROVED_FOR_EVIDENCE" : "VERIFIED_WORK") : "BIBLIOGRAPHIC_ONLY";
  const reason = prior && status === "APPROVED_FOR_EVIDENCE" ? "Previously approved source; original metadata rechecked"
    : status === "APPROVED_FOR_EVIDENCE" ? `Independent provenance verified; ${access}`
      : status === "VERIFIED_WORK" && item ? "Rights-clear scan verified; eligible for evidence after full-text ingestion"
        : status === "VERIFIED_WORK" ? "Credible original verified; automatic admission disabled"
          : status === "BIBLIOGRAPHIC_ONLY" ? `Credible bibliographic record; ${access ? "full text not present on this page" : "access rights not verifiable"}`
            : failures.join("; ") || "Insufficient provenance";
  const identity = scholarlyWorkKey({ doi, isbn, title: title || work_title, author: editor || author || translator,
    year: publication_year, publisher: publisher || institution, journal }) || null;
  return { ...row, title, author, editor, translator, institution, publisher, journal, publication_year,
    doi, isbn, edition, work_title, source_family: institution || publisher || journal || publicDomainWork
      ? `${url.hostname}${familyPath(url) || url.pathname}` : null,
    source_type: primary || publicDomainWork ? "primary_text" : scholarlyRecord ? "scholarly_article" : "institutional_source",
    textual_layer: primary || publicDomainWork ? (work_title || edition) : null,
    full_text_status: fullText ? "open" : "bibliographic", independent_work_key: identity || null,
    access_notes: [license, rightsStatement, publicDomainAttribution?.[0]].filter(Boolean).join("; ") || null,
    credibility_signals: signals, credibility_failures: failures, verification_status: status,
    verification_reason: reason, approval_origin: status === "APPROVED_FOR_EVIDENCE" ? "verified_auto" : null };
}
