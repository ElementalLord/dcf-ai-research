import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assessClaimPassage, normalizeTextReference, proposeDirectNameObservation, supportsStructuredRecord } from "./provenance-link";

export type IntegrationReport = { exact: number; strong: number; partial: number; unlinked: number; candidatesCreated: number; eventLinks: number; relationshipLinks: number; reasons: Record<string, number> };

export async function linkIngestedEvidence(sourceId: string, personalityId: string, aliases: string[]): Promise<IntegrationReport> {
  const [chunkResult, claimResult, sourceResult] = await Promise.all([
    supabaseAdmin.from("source_chunks").select("id,chunk_text,page_or_section,section_title").eq("source_id", sourceId).eq("is_active", true).limit(2000),
    supabaseAdmin.from("claims").select("id,claim_text,review_status,parameter_field_id,claim_sources(page_or_section,evidence_excerpt)").eq("personality_id", personalityId).neq("review_status", "rejected").limit(2000),
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
      }, { text: chunk.chunk_text, locator: chunk.page_or_section, section: chunk.section_title, work }, aliases));
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
