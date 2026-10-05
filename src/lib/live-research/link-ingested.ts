import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assessClaimPassage, isExactSupportLink, normalizeTextReference, proposeDirectNameObservation, supportsStructuredRecord, type LinkAssessment } from "./provenance-link";

export type IntegrationReport = { exact: number; strong: number; partial: number; unlinked: number; candidatesCreated: number; eventLinks: number; relationshipLinks: number; reasons: Record<string, number> };

export async function linkIngestedEvidence(sourceId: string, personalityId: string, aliases: string[]): Promise<IntegrationReport> {
  const [chunkResult, claimResult, sourceResult] = await Promise.all([
    supabaseAdmin.from("source_chunks").select("id,chunk_text,page_or_section,section_title").eq("source_id", sourceId).eq("is_active", true).limit(2000),
    supabaseAdmin.from("claims").select("id,claim_text,review_status,parameter_field_id,claim_sources(source_id,page_or_section,evidence_excerpt,sources(title))").eq("personality_id", personalityId).neq("review_status", "rejected").limit(2000),
    supabaseAdmin.from("sources").select("title,metadata").eq("id", sourceId).single(),
  ]);
  if (chunkResult.error || claimResult.error || sourceResult.error) throw chunkResult.error || claimResult.error || sourceResult.error;
  const source = sourceResult.data!;
  const work = String(source.metadata?.verification?.work_title || source.metadata?.underlyingWork || source.title || "");
  const chunks = chunkResult.data || [];
  const claims = claimResult.data || [];
  const existingLinks = new Map<string, string>();
  for (let index = 0; index < chunks.length; index += 100) {
    const ids = chunks.slice(index, index + 100).map((chunk) => chunk.id);
    if (!ids.length) continue;
    const previous = await supabaseAdmin.from("claim_chunks").select("claim_id,chunk_id,link_method").in("chunk_id", ids);
    if (previous.error) throw previous.error;
    for (const link of previous.data || []) existingLinks.set(`${link.claim_id}:${link.chunk_id}`, String(link.link_method || ""));
    const { error } = await supabaseAdmin.from("claim_chunks").delete().in("chunk_id", ids).like("link_method", "adaptive_%");
    if (error) throw error;
  }
  const report: IntegrationReport = { exact: 0, strong: 0, partial: 0, unlinked: 0, candidatesCreated: 0, eventLinks: 0, relationshipLinks: 0, reasons: {} };
  const links: Array<Record<string, unknown>> = [];
  const tags: Array<Record<string, unknown>> = [];
  for (const chunk of chunks) {
    const scored = claims.flatMap((claim) => {
      const sourceLinks = claim.claim_sources || [];
      const assessments = [null, ...sourceLinks].map((sourceLink) => assessClaimPassage({
        text: claim.claim_text,
        locator: sourceLink?.page_or_section,
        excerpt: sourceLink?.evidence_excerpt,
        sourceId: sourceLink?.source_id,
        work: (Array.isArray(sourceLink?.sources) ? sourceLink?.sources[0] : sourceLink?.sources)?.title,
      }, { text: chunk.chunk_text, locator: chunk.page_or_section, section: chunk.section_title, work, sourceId }, aliases));
      const rank = { EXACT: 5, STRONG: 4, PARTIAL: 3, RELATED: 2, UNRESOLVED: 1 };
      const assessment = assessments.sort((a, b) => rank[b.level] - rank[a.level])[0];
      return assessment.level === "UNRESOLVED" ? [] : [{ claim, assessment }];
    }).sort((a, b) => b.assessment.confidence - a.assessment.confidence);
    const best = scored[0];
    if (!best || best.assessment.level === "RELATED") {
      report.unlinked++;
      const reason = best?.assessment.reason || "No corresponding claim or wording match";
      report.reasons[reason] = (report.reasons[reason] || 0) + 1;
      continue;
    }
    const { claim, assessment } = best;
    const prior = existingLinks.get(`${claim.id}:${chunk.id}`);
    if (prior === undefined) {
      if (assessment.level === "EXACT") report.exact++;
      else if (assessment.level === "STRONG") report.strong++;
      else report.partial++;
    }
    if (prior === undefined || prior.startsWith("adaptive_"))
      links.push({ claim_id: claim.id, chunk_id: chunk.id,
        relationship: assessment.level === "EXACT" ? "supports" : "context",
        confidence: assessment.confidence, link_method: `adaptive_${assessment.level.toLowerCase()}`,
        metadata: { supportLevel: assessment.level, reason: assessment.reason, sourceId } });
    if (claim.parameter_field_id) tags.push({ chunk_id: chunk.id, parameter_field_id: claim.parameter_field_id,
      confidence: assessment.confidence, tagging_method: "rule" });
  }
  for (let index = 0; index < links.length; index += 100) {
    const { error } = await supabaseAdmin.from("claim_chunks").upsert(links.slice(index, index + 100), { onConflict: "claim_id,chunk_id" });
    if (error) throw error;
  }
  for (let index = 0; index < tags.length; index += 100) {
    const { error } = await supabaseAdmin.from("chunk_parameter_fields").upsert(tags.slice(index, index + 100), { onConflict: "chunk_id,parameter_field_id" });
    if (error) throw error;
  }
  const representedReferences = new Set(claims.flatMap((claim) => [
    normalizeTextReference(claim.claim_text, work),
    ...(claim.claim_sources || []).map((sourceLink) => normalizeTextReference(sourceLink.page_or_section || "", work)),
  ]).filter((value): value is string => Boolean(value)));
  const existingCandidateChunks = new Set<string>();
  for (let index = 0; index < chunks.length; index += 100) {
    const ids = chunks.slice(index, index + 100).map((chunk) => chunk.id);
    const lookup = await supabaseAdmin.from("candidate_claims")
      .select("source_chunk_id").eq("personality_id", personalityId).in("source_chunk_id", ids);
    if (lookup.error) throw lookup.error;
    for (const item of lookup.data || []) existingCandidateChunks.add(item.source_chunk_id);
  }
  const proposals = chunks.flatMap((chunk) => {
    if (existingCandidateChunks.has(chunk.id)) return [];
    const claimText = proposeDirectNameObservation({
      text: chunk.chunk_text, locator: chunk.page_or_section, section: chunk.section_title, work,
    }, aliases[0] || "", aliases, representedReferences);
    return claimText ? [{ personality_id: personalityId, source_chunk_id: chunk.id, claim_text: claimText,
      claim_kind: "textual_tradition", certainty: "high", extraction_confidence: 0.9,
      extraction_note: "Deterministic exact-locator name observation; awaits human review", status: "pending" }] : [];
  }).slice(0, 2);
  if (proposals.length) {
    const { error } = await supabaseAdmin.from("candidate_claims").insert(proposals);
    if (error) throw error;
    report.candidatesCreated = proposals.length;
  }
  const [relationshipResult, eventResult] = await Promise.all([
    supabaseAdmin.from("relationships").select("id,object_name,description").eq("subject_personality_id", personalityId).neq("review_status", "rejected").limit(100),
    supabaseAdmin.from("event_personalities").select("events(id,title,summary)").eq("personality_id", personalityId).limit(100),
  ]);
  if (relationshipResult.error || eventResult.error) throw relationshipResult.error || eventResult.error;
  const relationshipRows = (relationshipResult.data || []).flatMap((item) => chunks
    .filter((chunk) => supportsStructuredRecord(chunk.chunk_text, item.description, aliases, item.object_name || ""))
    .map((chunk) => ({ relationship_id: item.id, chunk_id: chunk.id, relationship: "evidence" })));
  const eventRows = (eventResult.data || []).flatMap((item) => {
    const event = Array.isArray(item.events) ? item.events[0] : item.events;
    if (!event) return [];
    const objectNames = (relationshipResult.data || []).map((relationship) => relationship.object_name || "")
      .filter((name) => name && event.summary.includes(name));
    return chunks.filter((chunk) => objectNames.some((name) =>
      supportsStructuredRecord(chunk.chunk_text, event.summary, aliases, name)))
      .map((chunk) => ({ event_id: event.id, chunk_id: chunk.id, relationship: "evidence" }));
  });
  if (relationshipRows.length) {
    const { error } = await supabaseAdmin.from("relationship_chunks").upsert(relationshipRows, { onConflict: "relationship_id,chunk_id" });
    if (error) throw error;
  }
  if (eventRows.length) {
    const { error } = await supabaseAdmin.from("event_chunks").upsert(eventRows, { onConflict: "event_id,chunk_id" });
    if (error) throw error;
  }
  report.relationshipLinks = relationshipRows.length;
  report.eventLinks = eventRows.length;
  return report;
}

export type BackfillReport = { claimsChecked: number; exact: number; strong: number; partial: number; unresolved: number; linksWritten: number;
  /** Proposed links, so a dry run can be reviewed before anything is written. */
  proposals: Array<{ claimId: string; chunkId: string; level: string; reason: string }> };

/**
 * Bounded exact-locator backfill over stored evidence only: for approved claims without exact support,
 * compare each cited locator against chunks from the cited sources and chunks with the same textual reference.
 * Existing curated or manual links are never rewritten; only adaptive links are added or upgraded.
 */
export async function backfillExactLocators(personalityId: string, aliases: string[], options: { dryRun?: boolean; maxClaims?: number } = {}): Promise<BackfillReport> {
  const [claimResult, chunkResult] = await Promise.all([
    supabaseAdmin.from("claims").select("id,claim_text,parameter_field_id,claim_sources(source_id,page_or_section,evidence_excerpt,sources(title)),claim_chunks(chunk_id,relationship,confidence,link_method,metadata)")
      .eq("personality_id", personalityId).eq("review_status", "approved").limit(5000),
    supabaseAdmin.from("chunk_personalities").select("source_chunks!inner(id,source_id,chunk_text,page_or_section,section_title,is_active,sources(title,metadata))")
      .eq("personality_id", personalityId).eq("source_chunks.is_active", true).limit(10_000),
  ]);
  if (claimResult.error || chunkResult.error) throw claimResult.error || chunkResult.error;
  const chunks = (chunkResult.data || []).flatMap((row) => {
    const chunk = Array.isArray(row.source_chunks) ? row.source_chunks[0] : row.source_chunks;
    if (!chunk) return [];
    const source = Array.isArray(chunk.sources) ? chunk.sources[0] : chunk.sources;
    const work = String(source?.metadata?.verification?.work_title || source?.metadata?.underlyingWork || source?.title || "");
    return [{ ...chunk, work, reference: normalizeTextReference(chunk.page_or_section || chunk.section_title || "", work) || normalizeTextReference(work) }];
  });
  const bySource = new Map<string, typeof chunks>();
  for (const chunk of chunks) bySource.set(chunk.source_id, [...(bySource.get(chunk.source_id) || []), chunk]);
  const report: BackfillReport = { claimsChecked: 0, exact: 0, strong: 0, partial: 0, unresolved: 0, linksWritten: 0, proposals: [] };
  const rank = { EXACT: 5, STRONG: 4, PARTIAL: 3, RELATED: 2, UNRESOLVED: 1 };
  const links: Array<Record<string, unknown>> = [];
  const pending = (claimResult.data || []).filter((claim) => !(claim.claim_chunks || []).some(isExactSupportLink))
    .slice(0, options.maxClaims ?? 500);
  for (const claim of pending) {
    report.claimsChecked++;
    const existing = new Map((claim.claim_chunks || []).map((link) => [link.chunk_id, String(link.link_method || "")]));
    let best: { chunkId: string; sourceId: string; assessment: LinkAssessment } | null = null;
    for (const cited of claim.claim_sources || []) {
      const citedSource = Array.isArray(cited.sources) ? cited.sources[0] : cited.sources;
      const citedWork = citedSource?.title || null;
      const hint = claim.claim_text.match(/rigveda|ramayana|mahabharata/i)?.[0] || citedWork || cited.page_or_section || "";
      const reference = normalizeTextReference(cited.page_or_section || "", hint) || normalizeTextReference(claim.claim_text, hint);
      const candidates = new Set([...(bySource.get(cited.source_id) || []),
        ...(reference ? chunks.filter((chunk) => chunk.reference && (chunk.reference === reference
          || chunk.reference.startsWith(`${reference}.`) || reference.startsWith(`${chunk.reference}.`))) : [])]);
      for (const chunk of candidates) {
        const assessment = assessClaimPassage({ text: claim.claim_text, locator: cited.page_or_section, excerpt: cited.evidence_excerpt, sourceId: cited.source_id, work: citedWork },
          { text: chunk.chunk_text, locator: chunk.page_or_section, section: chunk.section_title, work: chunk.work, sourceId: chunk.source_id }, aliases);
        if (!best || rank[assessment.level] > rank[best.assessment.level]
          || rank[assessment.level] === rank[best.assessment.level] && assessment.confidence > best.assessment.confidence)
          best = { chunkId: chunk.id, sourceId: chunk.source_id, assessment };
      }
    }
    const level = best?.assessment.level;
    if (!best || level === "RELATED" || level === "UNRESOLVED") { report.unresolved++; continue; }
    if (level === "EXACT") report.exact++; else if (level === "STRONG") report.strong++; else report.partial++;
    const prior = existing.get(best.chunkId);
    if (prior !== undefined && (!prior.startsWith("adaptive_")
      || rank[prior.slice(9).toUpperCase() as keyof typeof rank] >= rank[level!])) continue;
    links.push({ claim_id: claim.id, chunk_id: best.chunkId, relationship: level === "EXACT" ? "supports" : "context",
      confidence: best.assessment.confidence, link_method: `adaptive_${level!.toLowerCase()}`,
      metadata: { supportLevel: level, reason: best.assessment.reason, sourceId: best.sourceId, backfill: true } });
  }
  if (!options.dryRun) for (let index = 0; index < links.length; index += 100) {
    const { error } = await supabaseAdmin.from("claim_chunks").upsert(links.slice(index, index + 100), { onConflict: "claim_id,chunk_id" });
    if (error) throw error;
  }
  report.linksWritten = options.dryRun ? 0 : links.length;
  report.proposals = links.map((link) => ({ claimId: String(link.claim_id), chunkId: String(link.chunk_id),
    level: String((link.metadata as { supportLevel: string }).supportLevel), reason: String((link.metadata as { reason: string }).reason) }));
  return report;
}
