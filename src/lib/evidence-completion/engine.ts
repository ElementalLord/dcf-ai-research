import "server-only";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "@/lib/corpus/errors";
import { ingestSections } from "@/lib/corpus/ingest";
import { extractUrl } from "@/lib/corpus/source-extract";
import { loadPersonalityCoverage } from "@/lib/corpus/onboarding";
import { loadPersonalityConfiguration } from "@/lib/corpus/personality-context";
import { evaluateDepth } from "@/lib/live-research/depth";
import { isExactSupportLink } from "@/lib/live-research/provenance-link";
import { loadActiveSourceRules } from "@/lib/live-research/source-registry";
import { cachedWebSearch } from "@/lib/live-research/web-search";
import type { DocumentSection } from "@/lib/corpus/types";
import { inferLocatorTemplates, sameWorkTitle, siblingPageConfirmed, siblingUrl } from "./alternate";
import { pageLabel, selectCitedPages, type DocumentPage } from "./document-pages";
import { archiveCatalogueCandidates, archiveRecord, archiveScanPages, fetchCorpusDocument, pdfPages, type CachedDocument } from "./documents";
import { inlineVerseMarkers, parseLocator, type Locator } from "./locator";
import { assessCitedPassage, excludedStems, passageLocators, stems, type CitedAssessment, type PassageIdentity } from "./passage-match";
import { STABLE_FAILURES, classifyFailure, missingEvidenceItems, prioritizeLocations, workTitleOf, type EvidenceLocation, type FailureReason, type ParameterStanding, type QueueClaim, type QueueSource } from "./queue";

const PROVENANCE_REASONS = new Set(["Approved claims lack exact passage links", "Core claims lack exact passage links", "Too many claims lack exact or strong passage support"]);

type SourceRow = { id: string; title: string; url: string | null; author: string | null; publisher_or_institution: string | null; source_type: string | null;
  citation: string | null; source_status: string; ingestion_status: string; last_ingestion_error: string | null; textual_layer: string | null; metadata: Record<string, unknown> | null };
type StoredChunk = { id: string; sourceId: string; text: string; pageOrSection: string | null; sectionTitle: string | null; sourceTitle: string; work: string; locators: Locator[]; chapters: Set<string> };
/** `parts` is set when consecutive verse-level chunks were assembled into the cited span. */
type Passage = { chunkId: string; sourceId: string; text: string; locators: Locator[]; identity: PassageIdentity; parts?: Array<{ chunkId: string; text: string }> };
type AccessCopy = { original_source_id: string; access_source_id: string; relation: string };

/** A cited source that was itself rejected never supplies passages. */
const sourceRejected = (rows: SourceRow[], id: string) => rows.some((row) => row.id === id && row.source_status !== "approved");

async function pages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new CorpusError("DATABASE_FAILED", "Evidence completion state could not be loaded.", 500, { cause: error });
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

function chapterKeys(locators: Locator[], text: string, scheme: string | undefined): Set<string> {
  const keys = new Set(locators.filter((locator) => locator.kind === "canonical" && locator.path)
    .map((locator) => `${locator.scheme}:${locator.path!.join(".")}`));
  if (scheme) for (const marker of inlineVerseMarkers(text)) keys.add(`${scheme}:${marker.path.join(".")}`);
  return keys;
}

/** Everything the queue and linker need, read once. */
async function loadState(personalityId: string) {
  const configuration = await loadPersonalityConfiguration(personalityId);
  const aliases = [configuration.canonicalName, ...configuration.aliases.filter((item) => !item.isAmbiguous).map((item) => item.alias)];
  const [claims, parameters, mapped, copies, coverage] = await Promise.all([
    pages((from, to) => supabaseAdmin.from("claims")
      .select("id,claim_text,certainty,parameter_field_id,claim_sources(id,source_id,page_or_section,evidence_excerpt),claim_chunks(chunk_id,relationship,confidence,link_method,metadata)")
      .eq("personality_id", personalityId).eq("review_status", "approved").order("id").range(from, to)),
    supabaseAdmin.from("parameters").select("code,parameter_fields(id)").eq("category_id", configuration.categoryId),
    pages((from, to) => supabaseAdmin.from("source_personalities").select("source_id").eq("personality_id", personalityId).order("source_id").range(from, to)),
    supabaseAdmin.from("source_access_copies").select("original_source_id,access_source_id,relation"),
    loadPersonalityCoverage(personalityId),
  ]);
  if (parameters.error || copies.error) throw new CorpusError("DATABASE_FAILED", "Evidence completion state could not be loaded.", 500, { cause: parameters.error || copies.error });
  const sourceIds = [...new Set(claims.flatMap((claim) => (claim.claim_sources || []).map((link) => link.source_id)))];
  const sourceRows: SourceRow[] = [];
  for (let index = 0; index < sourceIds.length; index += 100) {
    const { data, error } = await supabaseAdmin.from("sources")
      .select("id,title,url,author,publisher_or_institution,source_type,citation,source_status,ingestion_status,last_ingestion_error,textual_layer,metadata")
      .in("id", sourceIds.slice(index, index + 100));
    if (error) throw new CorpusError("DATABASE_FAILED", "Cited sources could not be loaded.", 500, { cause: error });
    sourceRows.push(...(data || []) as SourceRow[]);
  }
  const fieldParameter = new Map((parameters.data || []).flatMap((parameter) => (parameter.parameter_fields || []).map((field) => [field.id, parameter.code] as [string, string])));
  const depth = evaluateDepth(coverage.coverage.parameters);
  const standings = new Map<string, ParameterStanding>();
  for (const [fieldId, code] of fieldParameter) {
    const area = depth.areas.find((item) => item.code === code);
    if (area) standings.set(fieldId, { fieldId, parameterCode: code, state: area.state,
      closeToGood: area.state !== "GOOD" && area.state !== "DEEP" && area.reasons.length > 0 && area.reasons.every((reason) => PROVENANCE_REASONS.has(reason)) });
  }
  // Passages are found by source, not by personality tag: a cited work's passage may not mention the personality by name.
  const passageSources = [...new Set([...sourceIds, ...mapped.map((row) => row.source_id),
    ...(copies.data || []).map((copy) => copy.access_source_id)])];
  const sourceMeta = new Map<string, { title: string; metadata: Record<string, unknown> | null }>(sourceRows.map((row) => [row.id, row]));
  const missingMeta = passageSources.filter((id) => !sourceMeta.has(id));
  for (let index = 0; index < missingMeta.length; index += 100) {
    const { data, error } = await supabaseAdmin.from("sources").select("id,title,metadata").eq("source_status", "approved").in("id", missingMeta.slice(index, index + 100));
    if (error) throw new CorpusError("DATABASE_FAILED", "Passage sources could not be loaded.", 500, { cause: error });
    for (const row of data || []) sourceMeta.set(row.id, row);
  }
  const chunks: StoredChunk[] = [];
  const approvedPassageSources = passageSources.filter((id) => sourceMeta.has(id) && (!sourceRejected(sourceRows, id)));
  for (let index = 0; index < approvedPassageSources.length; index += 50) {
    const batch = approvedPassageSources.slice(index, index + 50);
    const rows = await pages((from, to) => supabaseAdmin.from("source_chunks").select("id,source_id,chunk_text,page_or_section,section_title")
      .in("source_id", batch).eq("is_active", true).order("id").range(from, to));
    for (const chunk of rows) {
      const source = sourceMeta.get(chunk.source_id)!;
      const work = workTitleOf(source);
      const locators = passageLocators({ pageOrSection: chunk.page_or_section, sectionTitle: chunk.section_title, sourceTitle: source.title, work });
      const scheme = locators.find((locator) => locator.kind === "canonical")?.scheme;
      chunks.push({ id: chunk.id, sourceId: chunk.source_id, text: chunk.chunk_text, pageOrSection: chunk.page_or_section, sectionTitle: chunk.section_title,
        sourceTitle: source.title, work, locators, chapters: chapterKeys(locators, chunk.chunk_text, scheme) });
    }
  }
  return { configuration, aliases, claims, sources: new Map(sourceRows.map((row) => [row.id, row])), fieldParameter, standings, chunks,
    copies: (copies.data || []) as AccessCopy[], coverage: coverage.coverage, depth };
}

type State = Awaited<ReturnType<typeof loadState>>;

function supportNow(links: Array<{ relationship: string; confidence: number | null; link_method: string | null; metadata: { supportLevel?: string } | null }>) {
  if (links.some((link) => link.metadata?.supportLevel === "STRONG")) return "STRONG" as const;
  if (links.some((link) => link.metadata?.supportLevel === "PARTIAL")) return "PARTIAL" as const;
  return "NONE" as const;
}

export function buildQueueFromState(personalityId: string, state: State) {
  const missing: QueueClaim[] = state.claims.filter((claim) => !(claim.claim_chunks || []).some(isExactSupportLink)).map((claim) => ({
    id: claim.id, text: claim.claim_text, certainty: claim.certainty, parameterFieldId: claim.parameter_field_id,
    support: supportNow(claim.claim_chunks || []),
    citations: (claim.claim_sources || []).map((link) => ({ claimSourceId: link.id, sourceId: link.source_id, locator: link.page_or_section, excerpt: link.evidence_excerpt })),
  }));
  const sources = new Map<string, QueueSource>([...state.sources].map(([id, row]) => [id, {
    id, title: row.title, url: row.url, approved: row.source_status === "approved", ingestionStatus: row.ingestion_status,
    lastError: row.last_ingestion_error, workTitle: workTitleOf(row),
  }]));
  const items = missingEvidenceItems({ personalityId, claims: missing, sources, fieldParameter: state.fieldParameter });
  const storedChapters = new Set(state.chunks.flatMap((chunk) => [...chunk.chapters]));
  const locations = prioritizeLocations(items, state.standings, storedChapters);
  return { missingClaims: missing, items, locations };
}

async function persistQueue(personalityId: string, queue: ReturnType<typeof buildQueueFromState>) {
  const priority = new Map(queue.locations.flatMap((location) => location.items.map((item) => [item.claimSourceId, location.priority])));
  const rows = queue.items.map((item) => ({
    personality_id: personalityId, claim_id: item.claimId, claim_source_id: item.claimSourceId, source_id: item.sourceId,
    location_key: item.locationKey, locator_raw: item.locator.raw || null, locator: item.locator, locator_kind: item.locator.kind,
    work_title: item.work, parameter_field_id: item.parameterFieldId, certainty: item.certainty, support_level: item.support,
    source_availability: item.availability, priority: priority.get(item.claimSourceId) ?? 0,
    status: item.locator.specific ? "open" : "not_addressable", updated_at: new Date().toISOString(),
  }));
  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await supabaseAdmin.from("evidence_requirements").upsert(rows.slice(index, index + 200), { onConflict: "claim_source_id" });
    if (error) throw new CorpusError("DATABASE_FAILED", "The missing-evidence queue could not be saved.", 500, { cause: error });
  }
  // Requirements whose claims gained exact support elsewhere leave the open queue.
  const open = new Set(rows.map((row) => row.claim_source_id));
  const existing = await pages((from, to) => supabaseAdmin.from("evidence_requirements").select("id,claim_source_id,status")
    .eq("personality_id", personalityId).order("id").range(from, to));
  const closed = existing.filter((row) => !open.has(row.claim_source_id) && row.status === "open").map((row) => row.id);
  if (closed.length) await supabaseAdmin.from("evidence_requirements").update({ status: "linked_exact" }).in("id", closed);
}

export async function previewEvidenceQueue(personalityId: string, limit = 30) {
  const state = await loadState(personalityId);
  const queue = buildQueueFromState(personalityId, state);
  return { approvedClaims: state.claims.length, missingClaims: queue.missingClaims.length, requirements: queue.items.length,
    addressable: queue.items.filter((item) => item.locator.specific).length, locations: queue.locations.length,
    top: queue.locations.slice(0, limit).map(summarizeLocation) };
}

function summarizeLocation(location: EvidenceLocation) {
  return { key: location.key, work: location.work, locator: location.locator.raw, kind: location.locator.kind, priority: location.priority,
    claims: location.claims.length, coreClaims: location.claims.filter((claim) => claim.core).length,
    parameters: [...new Set(location.claims.map((claim) => claim.parameterCode).filter(Boolean))],
    availability: location.availability, storedAlternate: location.storedAlternate, factors: location.factors };
}

/* ---------------------------------- acquisition ---------------------------------- */

type RunContext = {
  personalityId: string; state: State; rules: Awaited<ReturnType<typeof loadActiveSourceRules>>;
  braveBudget: number; braveCalls: number; log: Array<Record<string, unknown>>; largePdfs: Set<string>; alternates: Array<Record<string, unknown>>;
  /** Cited sources whose original access already failed in this run, so later locations skip straight to alternates. */
  failedOriginals: Map<string, string>;
  /** Locations whose exact-work Brave lookup already ran in an earlier run; never re-spent. */
  priorBrave: Set<string>;
  braveLocations: Set<string>;
};

function storedPassages(context: RunContext, location: EvidenceLocation): Passage[] {
  const { state } = context;
  const cited = new Set(location.sourceIds);
  const copies = new Map(state.copies.filter((copy) => cited.has(copy.original_source_id)).map((copy) => [copy.access_source_id, copy.relation]));
  const chapter = location.locator.kind === "canonical" && location.locator.path ? `${location.locator.scheme}:${location.locator.path.join(".")}` : null;
  const singles: Passage[] = state.chunks.flatMap((chunk) => {
    let identity: PassageIdentity | null = null;
    if (cited.has(chunk.sourceId)) identity = "same_source";
    else if (copies.has(chunk.sourceId)) {
      const relation = copies.get(chunk.sourceId);
      identity = relation === "identical_document" ? "identical_document" : relation === "same_catalogue_record" ? "same_catalogue_record"
        : relation === "same_work_sibling_page" ? "same_work" : "alternate_edition";
    } else if (chapter && chunk.chapters.has(chapter)) identity = "same_work";
    if (!identity) return [];
    // Canonical requests only consider passages that carry the cited chapter.
    if (chapter && !chunk.chapters.has(chapter)) return [];
    return [{ chunkId: chunk.id, sourceId: chunk.sourceId, text: chunk.text, locators: chunk.locators, identity }];
  });
  return [...singles, ...assembleVerseSpans(singles, location.locator)];
}

/**
 * A source that stores one verse per chunk cannot answer a verse-range or whole-chapter citation from any
 * single chunk. Assemble that source's verse chunks inside the cited span, in verse order, as one passage.
 */
function assembleVerseSpans(passages: Passage[], requested: Locator): Passage[] {
  if (requested.kind !== "canonical" || !requested.path) return [];
  const bySource = new Map<string, Array<{ passage: Passage; verse: number }>>();
  for (const passage of passages) {
    const verse = passage.locators.find((locator) => locator.kind === "canonical" && locator.verses
      && locator.path?.join(".") === requested.path!.join("."))?.verses?.[0];
    if (verse == null) continue;
    if (requested.verses && (verse < requested.verses[0] || verse > requested.verses[1])) continue;
    bySource.set(passage.sourceId, [...(bySource.get(passage.sourceId) || []), { passage, verse }]);
  }
  return [...bySource.values()].filter((group) => group.length >= 2).map((group) => {
    const ordered = group.sort((a, b) => a.verse - b.verse).slice(0, 60);
    const [first, last] = [ordered[0].verse, ordered.at(-1)!.verse];
    const span = parseLocator(`${requested.path!.join(".")}.${first}${last !== first ? `-${last}` : ""}`, requested.scheme || "");
    return { chunkId: ordered[0].passage.chunkId, sourceId: ordered[0].passage.sourceId, identity: ordered[0].passage.identity,
      text: ordered.map((item) => item.passage.text).join("\n\n"), locators: [{ ...span, scheme: requested.scheme }],
      parts: ordered.map((item) => ({ chunkId: item.passage.chunkId, text: item.passage.text })) };
  });
}

async function ingestLocationPassages(context: RunContext, location: EvidenceLocation, sourceId: string, sections: DocumentSection[], textualLayer: string | null) {
  const fieldIds = [...new Set(location.items.map((item) => item.parameterFieldId).filter((id): id is string => Boolean(id)))];
  const tagged = sections.map((section) => ({ ...section, metadata: { ...(section.metadata || {}), evidenceLocation: location.key, acquisition: "citation_first" } }));
  await ingestSections({ sourceId, personalityIds: [context.personalityId], parameterFieldIds: fieldIds, sections: tagged,
    textualLayer, language: "English", append: true });
  const { data, error } = await supabaseAdmin.from("source_chunks").select("id,source_id,chunk_text,page_or_section,section_title")
    .eq("source_id", sourceId).eq("is_active", true).contains("metadata", { evidenceLocation: location.key }).limit(100);
  if (error) throw new CorpusError("DATABASE_FAILED", "Acquired passages could not be read back.", 500, { cause: error });
  const source = await supabaseAdmin.from("sources").select("title,metadata").eq("id", sourceId).single();
  const work = workTitleOf({ title: source.data?.title || "", metadata: source.data?.metadata });
  const stored = (data || []).map((chunk) => {
    const locators = passageLocators({ pageOrSection: chunk.page_or_section, sectionTitle: chunk.section_title, sourceTitle: source.data?.title || "", work });
    return { id: chunk.id, sourceId, text: chunk.chunk_text, pageOrSection: chunk.page_or_section, sectionTitle: chunk.section_title,
      sourceTitle: source.data?.title || "", work, locators, chapters: chapterKeys(locators, chunk.chunk_text, locators.find((item) => item.kind === "canonical")?.scheme) };
  });
  // Later locations in the same run see these passages without a reload.
  const known = new Set(context.state.chunks.map((chunk) => chunk.id));
  context.state.chunks.push(...stored.filter((chunk) => !known.has(chunk.id)));
  return stored.length;
}

function pageSections(selected: DocumentPage[], meta: Record<string, string | null>): DocumentSection[] {
  return selected.map((page) => ({ title: meta.title, pageOrSection: pageLabel(page), text: page.text,
    metadata: Object.fromEntries(Object.entries({ ...meta, scanPage: String(page.index), printedPage: page.printed }).filter(([, value]) => value != null)) as Record<string, string> }));
}

function claimTexts(context: RunContext, location: EvidenceLocation): string[] {
  const ids = new Set(location.claims.map((claim) => claim.id));
  return context.state.claims.filter((claim) => ids.has(claim.id)).map((claim) => claim.claim_text);
}

/** Registers a verified access copy of a cited source: its own source row, an ingest-only rule, and the relationship. */
async function registerAccessCopy(context: RunContext, original: SourceRow, copy: {
  url: string; title: string; relation: "identical_document" | "same_catalogue_record" | "same_work_alternate_edition" | "same_work_sibling_page";
  rulePrefix?: string; edition?: string | null; verification: Record<string, unknown>;
}): Promise<string> {
  const existing = await supabaseAdmin.from("sources").select("id").eq("url", copy.url).maybeSingle();
  let sourceId = existing.data?.id as string | undefined;
  const underlyingWork = workTitleOf(original);
  if (!sourceId) {
    const inserted = await supabaseAdmin.from("sources").insert({
      title: copy.title, url: copy.url, author: original.author, publisher_or_institution: original.publisher_or_institution,
      source_type: original.source_type, citation: original.citation, source_status: "approved", ingestion_status: "not_ingested",
      approval_origin: "citation_alternate", approved_at: new Date().toISOString(), approved_by_label: "citation_first_evidence_completion",
      approval_note: `Access copy of approved source ${original.id} (${copy.relation}); identity verified before ingestion.`,
      notes: `Access copy of "${original.title}". Relation: ${copy.relation}.`,
      metadata: { underlyingWork, accessCopyOf: original.id, accessRelation: copy.relation, edition: copy.edition || null, verification: copy.verification },
    }).select("id").single();
    if (inserted.error) throw new CorpusError("DATABASE_FAILED", "The access copy could not be registered.", 500, { cause: inserted.error });
    sourceId = inserted.data.id as string;
  }
  const url = new URL(copy.url);
  const rule = copy.rulePrefix
    ? { scope_type: "PATH_PREFIX", allowed_path_prefix: copy.rulePrefix, exact_url: null }
    : { scope_type: "EXACT_URL", allowed_path_prefix: null, exact_url: copy.url };
  const ruleExists = context.rules.some((item) => item.domain === url.hostname && item.scope_type === rule.scope_type
    && (rule.scope_type === "EXACT_URL" ? item.exact_url === rule.exact_url : item.allowed_path_prefix === rule.allowed_path_prefix));
  if (!ruleExists) {
    // Ingest only: Ask's live fetch can never pull an administrative access copy.
    const inserted = await supabaseAdmin.from("approved_source_access").insert({
      display_name: `Access copy — ${copy.title}`.slice(0, 200), domain: url.hostname, ...rule, include_subdomains: false,
      allow_live_search: false, allow_live_fetch: false, allow_ingestion: true, evidence_use_status: "approved",
      approval_origin: "citation_alternate", priority: 50, default_textual_layer: original.textual_layer, default_source_type: original.source_type,
      cache_ttl_hours: 720, is_active: true,
    }).select("id, display_name, domain, scope_type, allowed_path_prefix, exact_url, include_subdomains, allow_live_search, allow_live_fetch, allow_ingestion, evidence_use_status, approval_origin, priority, default_textual_layer, default_source_type, cache_ttl_hours, is_active").single();
    if (inserted.error) throw new CorpusError("DATABASE_FAILED", "The access copy rule could not be registered.", 500, { cause: inserted.error });
    context.rules.push(inserted.data as (typeof context.rules)[number]);
  }
  await supabaseAdmin.from("source_access_copies").upsert({ original_source_id: original.id, access_source_id: sourceId, relation: copy.relation,
    underlying_work: underlyingWork, edition_note: copy.edition || null, verification: copy.verification }, { onConflict: "original_source_id,access_source_id" });
  if (!context.state.copies.some((item) => item.original_source_id === original.id && item.access_source_id === sourceId))
    context.state.copies.push({ original_source_id: original.id, access_source_id: sourceId, relation: copy.relation });
  context.alternates.push({ original: original.title, access: copy.url, relation: copy.relation, edition: copy.edition || null });
  return sourceId;
}

const fileStem = (url: string) => path.basename(new URL(url).pathname).replace(/\.[a-z0-9]+$/i, "") || null;

/** C: a repository mirror of the cited document. Identity is a checksum match, or the same catalogue file name and work title. */
async function acquireFromArchiveMirror(context: RunContext, location: EvidenceLocation, original: SourceRow, localSha1: string | null): Promise<number> {
  const stem = fileStem(original.url!);
  const work = workTitleOf(original);
  for (const identifier of await archiveCatalogueCandidates(original.url!, stem, work)) {
    const record = await archiveRecord(identifier).catch(() => null);
    if (!record) continue;
    const pdfs = record.files.filter((file) => file.name.toLowerCase().endsWith(".pdf") && !file.name.endsWith("_text.pdf"));
    const identical = localSha1 ? pdfs.find((file) => file.sha1 === localSha1) : undefined;
    const sameName = pdfs.find((file) => stem && file.name === `${stem}.pdf`);
    const match = identical || sameName;
    const scanStem = match?.name.replace(/\.pdf$/i, "");
    if (!match || !scanStem || !record.files.some((file) => file.name === `${scanStem}_djvu.xml`)) continue;
    const title = String(record.metadata.title || "");
    const relation = identical ? "identical_document" : "same_catalogue_record";
    if (!identical && !sameWorkTitle(title, work) && !sameWorkTitle(title, original.title)) continue;
    // A byte-identical copy carries the cited document's own approval; any other copy needs its own rights evidence.
    const year = Number(String(record.metadata.date || "").match(/\b(1[5-9]\d\d)\b/)?.[1] || 0);
    const rightsText = [record.metadata["possible-copyright-status"], record.metadata.rights, record.metadata.licenseurl].filter(Boolean).join(" ");
    const rightsClear = /not_in_copyright|public domain|publicdomain|creativecommons/i.test(rightsText) || (year > 0 && year <= 1929);
    if (!identical && !rightsClear) {
      context.log.push({ location: location.key, step: "archive_mirror", identifier, result: "RIGHTS_UNCLEAR" });
      continue;
    }
    const accessUrl = `https://archive.org/details/${identifier}`;
    const edition = [record.metadata.creator, record.metadata.title, record.metadata.date].filter(Boolean).join(", ") || null;
    const sourceId = await registerAccessCopy(context, original, {
      url: accessUrl, title: `${title || work} — repository scan copy (${identifier})`, relation, edition,
      rulePrefix: `/download/${identifier}/`,
      verification: { method: identical ? "sha1_match" : "catalogue_file_name_and_title", sha1: match.sha1 || null, citedSha1: localSha1,
        checksumRelation: identical ? "identical" : localSha1 ? "different" : "original_not_hashed",
        reason: "Cited original is an image-only scan or unreachable; the repository copy carries an OCR text layer",
        repositoryFile: match.name, repositoryTitle: title, repositoryCreator: record.metadata.creator || null, repositoryDate: record.metadata.date || null,
        scanningCenter: record.metadata.scanningcenter || null, contributor: record.metadata.contributor || null,
        rights: rightsText || null, rightsBasis: identical ? "identical to approved cited document" : "public domain by date or explicit rights metadata",
        ocr: { file: `${scanStem}_djvu.xml`, pageNumbers: `${scanStem}_page_numbers.json`, engine: record.metadata.ocr || null } },
    });
    const scan = await archiveScanPages(record, context.rules, scanStem);
    const selected = selectCitedPages(scan, { locator: location.locator, claimTexts: claimTexts(context, location), aliases: context.state.aliases, workTitle: work });
    context.log.push({ location: location.key, step: "archive_mirror", identifier, relation, pages: selected.map((page) => pageLabel(page)) });
    if (!selected.length) return 0;
    return ingestLocationPassages(context, location, sourceId, pageSections(selected, { title: title || work, edition, accessCopyOf: original.id }), original.textual_layer);
  }
  return 0;
}

/** C2: a sibling page of the same work from a repository that already holds approved locator-addressed pages of it. */
async function acquireFromSiblingTemplate(context: RunContext, location: EvidenceLocation, original: SourceRow): Promise<number> {
  if (location.locator.kind !== "canonical") return 0;
  const examples = [...context.state.sources.values()].filter((source) => source.url && source.ingestion_status === "ready" && source.source_status === "approved")
    .map((source) => ({ url: source.url!, locator: parseLocator(source.title, workTitleOf(source)) }));
  const blocked = location.sourceIds.flatMap((id) => { const url = context.state.sources.get(id)?.url; return url ? [new URL(url).hostname.replace(/^www\./, "")] : []; });
  for (const candidate of siblingUrl(inferLocatorTemplates(examples), location.locator, blocked)) {
    const known = await supabaseAdmin.from("sources").select("id,source_status,approval_origin,last_ingestion_error").eq("url", candidate.url).maybeSingle();
    // A page this engine already rejected on content stays rejected; a transient fetch failure is retried.
    if (known.data && (known.data.approval_origin !== "citation_alternate" || /content confirmation/i.test(known.data.last_ingestion_error || ""))) continue;
    if (known.data) await supabaseAdmin.from("sources").update({ source_status: "approved", ingestion_status: "not_ingested", last_ingestion_error: null }).eq("id", known.data.id);
    const sourceId = await registerAccessCopy(context, original, {
      url: candidate.url, title: `${workTitleOf(original)} ${location.locator.raw} — sibling page (${candidate.template.host})`,
      relation: "same_work_sibling_page", edition: `${candidate.template.host} edition; not verified identical to the cited edition`,
      verification: { method: "repository_locator_template", template: candidate.template.template, examples: candidate.template.examples },
    });
    try {
      const extracted = await extractUrl(candidate.url);
      // Chapter headings often live in the section title (page heading), not the body text.
      const text = extracted.sections.map((section) => [section.title, section.pageOrSection, section.text].filter(Boolean).join("\n")).join("\n\n");
      if (!siblingPageConfirmed(text, location.locator, context.state.aliases)) {
        context.log.push({ location: location.key, step: "sibling_template", url: candidate.url, result: "page did not confirm its chapter and personality" });
        await supabaseAdmin.from("sources").update({ source_status: "rejected", ingestion_status: "failed", last_ingestion_error: "Sibling page failed content confirmation" }).eq("id", sourceId);
        continue;
      }
      const sections = extracted.sections.map((section) => ({ ...section, title: `${workTitleOf(original)}, ${location.locator.raw}` }));
      context.log.push({ location: location.key, step: "sibling_template", url: candidate.url, result: "acquired" });
      return ingestLocationPassages(context, location, sourceId, sections, original.textual_layer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.log.push({ location: location.key, step: "sibling_template", url: candidate.url, error: message });
      await supabaseAdmin.from("sources").update({ source_status: "rejected", ingestion_status: "failed", last_ingestion_error: message.slice(0, 500) }).eq("id", sourceId);
    }
  }
  return 0;
}

/** D/E: only when the cited work is otherwise unreachable, ask Brave for the exact work and locator. Results are never trusted directly. */
async function acquireViaBrave(context: RunContext, location: EvidenceLocation, original: SourceRow): Promise<number> {
  if (context.braveCalls >= context.braveBudget) return 0;
  const work = workTitleOf(original);
  // The exact cited work and its own locator words; never the personality.
  const titleLocator = original.title.slice(work.length).replace(/[^\p{L}\p{N}. ]+/gu, " ").replace(/\s+/g, " ").trim();
  const query = `"${work}" ${titleLocator || location.locator.raw}`.slice(0, 160);
  const result = await cachedWebSearch(query).catch((error) => ({ results: [], calls: 0, cacheHits: 0, error }));
  context.braveCalls += result.calls;
  const identifiers = [...new Set(result.results.flatMap((item) => {
    try { const url = new URL(item.url); return url.hostname === "archive.org" ? [url.pathname.match(/^\/details\/([A-Za-z0-9._-]+)/)?.[1]].filter(Boolean) as string[] : []; }
    catch { return []; }
  }))];
  context.braveLocations.add(location.key);
  context.log.push({ location: location.key, step: "brave", query, calls: result.calls, results: result.results.length,
    urls: result.results.slice(0, 10).map((item) => item.url), repositoryItems: identifiers });
  for (const identifier of identifiers.slice(0, 3)) {
    const record = await archiveRecord(identifier).catch(() => null);
    const title = String(record?.metadata.title || "");
    const year = Number(String(record?.metadata.date || "").match(/\b(1[5-9]\d\d)\b/)?.[1] || 0);
    const scan = record?.files.find((file) => file.name.endsWith("_djvu.xml"));
    // A different copy found by search is only an alternate edition, and only if its own record shows it is public domain by age.
    if (!record || !scan || !sameWorkTitle(title, work) || !year || year > 1929) continue;
    const scanStem = scan.name.replace(/_djvu\.xml$/, "");
    const sourceId = await registerAccessCopy(context, original, {
      url: `https://archive.org/details/${identifier}`, title: `${title} — alternate edition (${identifier})`, relation: "same_work_alternate_edition",
      edition: [record.metadata.creator, title, record.metadata.date].filter(Boolean).join(", "), rulePrefix: `/download/${identifier}/`,
      verification: { method: "brave_exact_work_query", query, repositoryTitle: title, repositoryDate: record.metadata.date, publicDomainByDate: true },
    });
    const pagesFound = selectCitedPages(await archiveScanPages(record, context.rules, scanStem), {
      locator: location.locator, claimTexts: claimTexts(context, location), aliases: context.state.aliases, workTitle: work });
    if (pagesFound.length) return ingestLocationPassages(context, location, sourceId, pageSections(pagesFound, { title, accessCopyOf: original.id }), original.textual_layer);
  }
  return 0;
}

/** B: the cited source itself. HTML is fetched normally; PDFs take the administrative large-document path. */
async function acquireFromCitedSource(context: RunContext, location: EvidenceLocation, original: SourceRow): Promise<{ added: number; sha1: string | null; scanOnly: boolean }> {
  const url = original.url!;
  const isPdf = /\.pdf($|\?)|downloadpdf/i.test(url) || /pdf|exceeds|parse/i.test(original.last_ingestion_error || "");
  if (!isPdf) {
    const extracted = await extractUrl(url);
    const added = await ingestLocationPassages(context, location, original.id, extracted.sections, original.textual_layer);
    return { added, sha1: null, scanOnly: false };
  }
  const document: CachedDocument = await fetchCorpusDocument(url, context.rules);
  context.largePdfs.add(url);
  const { pages: documentPages, textLayer, pageCount } = await pdfPages(document);
  context.log.push({ location: location.key, step: "large_pdf", url, megabytes: Number((document.bytes / 1048576).toFixed(1)), pageCount, textLayer });
  if (!textLayer) return { added: 0, sha1: document.sha1, scanOnly: true };
  const selected = selectCitedPages(documentPages, { locator: location.locator, claimTexts: claimTexts(context, location), aliases: context.state.aliases, workTitle: workTitleOf(original) });
  if (!selected.length) return { added: 0, sha1: document.sha1, scanOnly: false };
  const added = await ingestLocationPassages(context, location, original.id, pageSections(selected, { title: original.title }), original.textual_layer);
  return { added, sha1: document.sha1, scanOnly: false };
}

type Acquisition = { method: string; detail: string; failureReason?: FailureReason };

async function acquireLocation(context: RunContext, location: EvidenceLocation, force = false): Promise<Acquisition> {
  if (!force && storedPassages(context, location).length) return { method: "stored", detail: "Passage already stored in the cited source or a verified copy of the cited work" };
  const attempts: string[] = [];
  const reasons: FailureReason[] = [];
  for (const sourceId of location.sourceIds) {
    const original = context.state.sources.get(sourceId);
    if (!original?.url || original.source_status !== "approved") continue;
    let sha1: string | null = null;
    let scanOnly = false;
    const priorFailure = context.failedOriginals.get(sourceId);
    if (priorFailure) { attempts.push(`original: ${priorFailure}`); reasons.push(priorFailure as FailureReason); }
    else try {
      const direct = await acquireFromCitedSource(context, location, original);
      sha1 = direct.sha1;
      scanOnly = direct.scanOnly;
      if (direct.added) return { method: "cited_source", detail: original.url };
      attempts.push(scanOnly ? "original: scan without a text layer" : "original: cited location not found in the document");
      reasons.push(scanOnly ? "OCR_UNAVAILABLE" : "PASSAGE_NOT_FOUND");
      if (scanOnly) context.failedOriginals.set(sourceId, "OCR_UNAVAILABLE");
    } catch (error) {
      const reason = classifyFailure(error);
      attempts.push(`original: ${reason}: ${error instanceof Error ? error.message : String(error)}`);
      reasons.push(reason);
      context.failedOriginals.set(sourceId, reason);
    }
    if (location.locator.kind !== "canonical") {
      const mirrored = await acquireFromArchiveMirror(context, location, original, sha1).catch((error) => {
        attempts.push(`mirror: ${error instanceof Error ? error.message : String(error)}`); return 0; });
      if (mirrored) return { method: "repository_mirror", detail: original.url };
    }
    const sibling = await acquireFromSiblingTemplate(context, location, original).catch(() => 0);
    if (sibling) return { method: "sibling_page", detail: original.url };
    if (storedPassages(context, location).length) return { method: "stored", detail: "Acquired for an earlier location" };
  }
  const original = location.sourceIds.map((id) => context.state.sources.get(id)).find((source) => source?.url && source.source_status === "approved");
  if (original && !context.priorBrave.has(location.key)) {
    const found = await acquireViaBrave(context, location, original).catch((error) => {
      attempts.push(`brave: ${error instanceof Error ? error.message : String(error)}`); return 0; });
    if (found) return { method: "brave_alternate_edition", detail: original.url! };
  }
  // The original's own failure explains why an alternate was needed; with none found, record both.
  const primary = reasons.find((reason) => reason !== "PASSAGE_NOT_FOUND") || reasons[0];
  return { method: "inaccessible", detail: [attempts.join("; ") || "No approved accessible copy of the cited work", "no verified alternate copy found"].join("; "),
    failureReason: primary === "OCR_UNAVAILABLE" || primary === "PASSAGE_NOT_FOUND" ? primary : primary ? "ALTERNATE_NOT_FOUND" : "SOURCE_NOT_VERIFIED" };
}

/* ------------------------------------ linking ------------------------------------ */

/** For an assembled verse span, the verse chunks that carry the matched wording (at most four, by hits). */
function supportingChunks(passage: Passage, assessment: CitedAssessment, exclude: Set<string>): string[] {
  if (!passage.parts) return [passage.chunkId];
  const matched = new Set(assessment.matchedTerms);
  const ranked = passage.parts.map((part) => ({ id: part.chunkId, hits: [...stems(part.text, exclude)].filter((term) => matched.has(term)).length }))
    .filter((part) => part.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 4).map((part) => part.id);
  return ranked.length ? ranked : [passage.chunkId];
}

const RANK = { EXACT: 4, STRONG: 3, PARTIAL: 2, RELATED: 1 } as const;

async function linkLocation(context: RunContext, location: EvidenceLocation) {
  const passages = storedPassages(context, location);
  const claimsById = new Map(context.state.claims.map((claim) => [claim.id, claim]));
  const out = { exact: 0, strong: 0, partial: 0, proposals: [] as Array<Record<string, unknown>> };
  const statuses: Array<{ claimSourceId: string; status: string; resolution: Record<string, unknown> }> = [];
  for (const claimId of new Set(location.items.map((item) => item.claimId))) {
    const claim = claimsById.get(claimId);
    if (!claim) continue;
    const items = location.items.filter((item) => item.claimId === claimId);
    const exclude = excludedStems(context.state.aliases, [location.work, ...items.map((item) => item.work)]);
    let best: { passage: Passage; assessment: CitedAssessment } | null = null;
    for (const item of items) for (const passage of passages) {
      // Identity is relative to this citation's own source.
      const identity: PassageIdentity = passage.sourceId === item.sourceId ? "same_source" : passage.identity === "same_source" ? "same_work" : passage.identity;
      const assessment = assessCitedPassage({ claimText: claim.claim_text, requested: item.locator, identity, passage, exclude });
      if (!best || RANK[assessment.level] > RANK[best.assessment.level]
        || RANK[assessment.level] === RANK[best.assessment.level] && assessment.supportRatio > best.assessment.supportRatio)
        best = { passage, assessment };
    }
    const level = best?.assessment.level;
    const resolution = best ? { claimId, chunkId: best.passage.chunkId, level, reason: best.assessment.reason, identity: best.assessment.identity,
      locatorFit: best.assessment.locatorFit, supportRatio: best.assessment.supportRatio, matchedTerms: best.assessment.matchedTerms } : { claimId, reason: "No passage" };
    const status = level === "EXACT" ? "linked_exact" : level === "STRONG" ? "linked_strong" : level === "PARTIAL" ? "linked_partial" : "unresolved";
    for (const item of items) statuses.push({ claimSourceId: item.claimSourceId, status, resolution });
    if (!best || level === "RELATED") continue;
    const prior = (claim.claim_chunks || []).find((link) => link.chunk_id === best!.passage.chunkId && !best!.passage.parts);
    const priorLevel = prior?.metadata?.supportLevel as keyof typeof RANK | undefined;
    if (prior && (!String(prior.link_method || "").match(/^(adaptive_|citation_)/) || priorLevel && RANK[priorLevel] >= RANK[level!])) continue;
    for (const chunkId of supportingChunks(best.passage, best.assessment, exclude)) out.proposals.push({ claim_id: claim.id, chunk_id: chunkId, relationship: level === "EXACT" ? "supports" : "context",
      confidence: best.assessment.confidence, link_method: `citation_${level!.toLowerCase()}`,
      metadata: { supportLevel: level, reason: best.assessment.reason, identity: best.assessment.identity, locatorFit: best.assessment.locatorFit,
        window: best.assessment.window, supportRatio: best.assessment.supportRatio, matchedTerms: best.assessment.matchedTerms,
        citedSourceIds: items.map((item) => item.sourceId), passageSourceId: best.passage.sourceId, evidenceLocation: location.key,
        assembledSpan: best.passage.parts ? best.passage.locators[0]?.key : undefined } });
    if (level === "EXACT") out.exact++; else if (level === "STRONG") out.strong++; else out.partial++;
  }
  return { ...out, statuses };
}

/** Writes citation links and tags the passage to the personality and the claim's parameter field (STRONG or better). */
async function writeLinks(context: RunContext, proposals: Array<Record<string, unknown>>) {
  for (let index = 0; index < proposals.length; index += 100) {
    const { error } = await supabaseAdmin.from("claim_chunks").upsert(proposals.slice(index, index + 100), { onConflict: "claim_id,chunk_id" });
    if (error) throw new CorpusError("DATABASE_FAILED", "Citation-first links could not be saved.", 500, { cause: error });
  }
  const supported = proposals.filter((link) => ["EXACT", "STRONG"].includes((link.metadata as { supportLevel: string }).supportLevel));
  const fieldOf = new Map(context.state.claims.map((claim) => [claim.id, claim.parameter_field_id]));
  const personalityTags = supported.map((link) => ({ chunk_id: link.chunk_id, personality_id: context.personalityId, relationship: "mentions",
    relevance_score: link.confidence, tagging_method: "rule", confidence: link.confidence }));
  const fieldTags = supported.flatMap((link) => { const field = fieldOf.get(String(link.claim_id));
    return field ? [{ chunk_id: link.chunk_id, parameter_field_id: field, confidence: link.confidence, tagging_method: "rule" }] : []; });
  const sourceTags = [...new Set(supported.map((link) => String((link.metadata as { passageSourceId: string }).passageSourceId)))]
    .map((sourceId) => ({ source_id: sourceId, personality_id: context.personalityId, relationship: "supports_claims", confidence: 1, mapping_method: "claim_link" }));
  // Existing tags (manual or earlier rules) are kept; only missing ones are added.
  for (const [table, rows, conflict] of [["chunk_personalities", personalityTags, "chunk_id,personality_id"],
    ["chunk_parameter_fields", fieldTags, "chunk_id,parameter_field_id"], ["source_personalities", sourceTags, "source_id,personality_id"]] as const) {
    if (!rows.length) continue;
    const { error } = await supabaseAdmin.from(table).upsert(rows as never[], { onConflict: conflict, ignoreDuplicates: true });
    if (error) throw new CorpusError("DATABASE_FAILED", `Passage tags (${table}) could not be saved.`, 500, { cause: error });
  }
}

/* ------------------------------------- run --------------------------------------- */

/**
 * Removes only this engine's own citation_* links for one personality, so a changed matcher re-decides them
 * from stored passages. Curated, manual, and adaptive links are never touched.
 */
async function clearEngineLinks(personalityId: string) {
  const claimIds = (await pages((from, to) => supabaseAdmin.from("claims").select("id").eq("personality_id", personalityId).order("id").range(from, to))).map((row) => row.id);
  for (let index = 0; index < claimIds.length; index += 200) {
    const { error } = await supabaseAdmin.from("claim_chunks").delete().in("claim_id", claimIds.slice(index, index + 200)).like("link_method", "citation_%");
    if (error) throw new CorpusError("DATABASE_FAILED", "Engine links could not be reassessed.", 500, { cause: error });
  }
}



function depthSummary(state: { coverage: State["coverage"]; depth: State["depth"] }) {
  return {
    approvedClaims: state.coverage.overall.approvedClaims, exactClaims: state.coverage.overall.claimsWithExactPassages,
    parameters: state.coverage.parameters.map((parameter) => ({ code: parameter.code, name: parameter.name,
      exact: parameter.claimsWithExactPassages, approved: parameter.approvedClaims,
      coreExact: parameter.coreClaimsWithExactPassages, core: parameter.coreClaims,
      depth: state.depth.areas.find((area) => area.code === parameter.code)?.state,
      reasons: state.depth.areas.find((area) => area.code === parameter.code)?.reasons })),
  };
}

export async function runEvidenceCompletion(input: { personalityId: string; maxLocations?: number; braveBudget?: number; dryRun?: boolean; retryStableFailures?: boolean; refreshAcquired?: boolean; reassessLinks?: boolean }) {
  if (input.reassessLinks && !input.dryRun) await clearEngineLinks(input.personalityId);
  const state = await loadState(input.personalityId);
  const before = depthSummary(state);
  const queue = buildQueueFromState(input.personalityId, state);
  // Earlier runs' outcomes drive resume: stable failures are not re-fetched, Brave lookups are never repeated.
  const prior = await pages((from, to) => supabaseAdmin.from("evidence_requirements").select("claim_source_id,location_key,status,resolution,attempts")
    .eq("personality_id", input.personalityId).order("claim_source_id").range(from, to));
  // A dry run reads and assesses only; the persisted queue changes only on a real run.
  if (!input.dryRun) await persistQueue(input.personalityId, queue);
  const priorByLocation = new Map<string, Array<{ status: string; resolution: Record<string, unknown>; attempts: number }>>();
  const priorAttempts = new Map(prior.map((row) => [row.claim_source_id, row.attempts || 0]));
  for (const row of prior) priorByLocation.set(row.location_key, [...(priorByLocation.get(row.location_key) || []), row]);
  const priorBrave = new Set(prior.filter((row) => (row.resolution as { braveQueried?: boolean })?.braveQueried).map((row) => row.location_key));
  const context: RunContext = { personalityId: input.personalityId, state, rules: await loadActiveSourceRules(),
    braveBudget: Math.max(0, Math.min(8, input.braveBudget ?? 0)), braveCalls: 0, log: [], largePdfs: new Set(), alternates: [],
    failedOriginals: new Map(), priorBrave, braveLocations: new Set() };
  const selected = queue.locations.slice(0, Math.max(1, Math.min(60, input.maxLocations ?? 30)));
  const results: Array<Record<string, unknown>> = [];
  const allLinks: Array<Record<string, unknown>> = [];
  const metrics = { storedReused: 0, originalAcquisitions: 0, alternateCopies: 0, siblingPages: 0, braveAlternates: 0, skippedStableFailures: 0, failed: 0 };
  for (const location of selected) {
    const previous = priorByLocation.get(location.key) || [];
    const stableFailure = previous.length > 0 && previous.every((row) => row.status === "inaccessible"
      && STABLE_FAILURES.has((row.resolution as { failureReason?: FailureReason })?.failureReason as FailureReason));
    let acquisition: Acquisition;
    const stored = storedPassages(context, location);
    const accessCopyIds = new Set(context.state.copies.map((copy) => copy.access_source_id));
    // Passages this engine itself acquired may be re-selected when page selection improves (documents come from cache).
    const refreshable = Boolean(input.refreshAcquired && !input.dryRun && stored.length && stored.every((passage) => accessCopyIds.has(passage.sourceId)));
    if (refreshable) acquisition = await acquireLocation(context, location, true).catch((error) => ({ method: "error", detail: error instanceof Error ? error.message : String(error), failureReason: classifyFailure(error) }));
    else if (stored.length) acquisition = { method: "stored", detail: "Passage already stored in the cited source or a verified copy of the cited work" };
    else if (input.dryRun) acquisition = { method: "not_attempted", detail: "dry run" };
    else if (stableFailure && !input.retryStableFailures) {
      const reason = (previous[0].resolution as { failureReason?: FailureReason }).failureReason;
      acquisition = { method: "inaccessible", detail: "Skipped: earlier run recorded a stable failure", failureReason: reason };
      metrics.skippedStableFailures++;
    } else acquisition = await acquireLocation(context, location).catch((error) => ({ method: "error", detail: error instanceof Error ? error.message : String(error), failureReason: classifyFailure(error) }));
    if (acquisition.method === "stored") metrics.storedReused++;
    else if (acquisition.method === "cited_source") metrics.originalAcquisitions++;
    else if (acquisition.method === "repository_mirror") metrics.alternateCopies++;
    else if (acquisition.method === "sibling_page") metrics.siblingPages++;
    else if (acquisition.method === "brave_alternate_edition") metrics.braveAlternates++;
    else if (acquisition.method !== "not_attempted") metrics.failed++;
    const linked = await linkLocation(context, location);
    allLinks.push(...linked.proposals);
    results.push({ ...summarizeLocation(location), acquisition, exact: linked.exact, strong: linked.strong, partial: linked.partial,
      passagesConsidered: storedPassages(context, location).length,
      assessments: [...new Map(linked.statuses.map((status) => [status.resolution.claimId ?? status.claimSourceId, status])).values()]
        .map((status) => ({ status: status.status, ...status.resolution })) });
    if (input.dryRun) continue;
    await writeLinks(context, linked.proposals);
    const inaccessible = acquisition.method === "inaccessible" || acquisition.method === "error";
    for (const status of linked.statuses) {
      const level = status.resolution.level as string | undefined;
      const failureReason: FailureReason | undefined = status.status === "linked_exact" ? undefined
        : inaccessible && status.status === "unresolved" ? acquisition.failureReason
          : level === "STRONG" && /edition/i.test(String(status.resolution.reason)) ? "EDITION_MISMATCH"
            : status.status === "unresolved" && status.resolution.chunkId ? "PASSAGE_DOES_NOT_SUPPORT_CLAIM"
              : status.status === "unresolved" ? "PASSAGE_NOT_FOUND" : undefined;
      await supabaseAdmin.from("evidence_requirements").update({
        status: inaccessible && status.status === "unresolved" ? "inaccessible" : status.status,
        resolution: { ...status.resolution, acquisition, failureReason: failureReason || null,
          braveQueried: context.braveLocations.has(location.key) || priorBrave.has(location.key) },
        attempts: (priorAttempts.get(status.claimSourceId) || 0) + 1, last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("claim_source_id", status.claimSourceId);
    }
  }
  const afterCoverage = await loadPersonalityCoverage(input.personalityId);
  const after = depthSummary({ coverage: afterCoverage.coverage, depth: evaluateDepth(afterCoverage.coverage.parameters) });
  return {
    dryRun: Boolean(input.dryRun), queue: { missingClaims: queue.missingClaims.length, requirements: queue.items.length,
      addressableRequirements: queue.items.filter((item) => item.locator.specific).length, locations: queue.locations.length },
    attempted: results.length, results, links: input.dryRun ? allLinks : allLinks.length,
    exactAdded: allLinks.filter((link) => (link.metadata as { supportLevel: string }).supportLevel === "EXACT").length,
    strongAdded: allLinks.filter((link) => (link.metadata as { supportLevel: string }).supportLevel === "STRONG").length,
    partialAdded: allLinks.filter((link) => (link.metadata as { supportLevel: string }).supportLevel === "PARTIAL").length,
    metrics, alternates: context.alternates, largePdfs: [...context.largePdfs], braveCalls: context.braveCalls, geminiCalls: 0,
    before, after, log: context.log,
  };
}
