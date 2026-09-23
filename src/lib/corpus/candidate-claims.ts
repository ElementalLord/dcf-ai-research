import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "./errors";
import { generateText, parseGeminiJson } from "./gemini";
import { normalizedClaim, tokenJaccard } from "./dedupe";
import { truncateText } from "./text";
import { selectPrimaryCategory } from "./personality-config";

const CLAIM_KINDS = new Set([
  "established_fact",
  "textual_tradition",
  "scholarly_interpretation",
  "traditional_account",
  "contested",
  "uncertain",
  "contemporary_relevance",
]);
const CERTAINTIES = new Set(["unknown", "high", "medium", "low"]);

type ExtractedClaim = {
  claimText?: string;
  parameterFieldCode?: string;
  claimKind?: string;
  certainty?: string;
  confidence?: number;
  note?: string;
};

type ExtractedEvent = {
  title?: string;
  summary?: string;
  eventType?: string;
  chronologyLabel?: string;
};

type ExtractedRelationship = {
  objectName?: string;
  relationshipType?: string;
  description?: string;
};

type ExtractionPayload = {
  claims?: ExtractedClaim[];
  events?: ExtractedEvent[];
  relationships?: ExtractedRelationship[];
};

export type ProposalType = "claims" | "events" | "relationships";

function extractionPrompt(
  personality: string,
  layer: string | null,
  fieldCodes: string[],
  chunkId: string,
  text: string,
  proposalTypes: ProposalType[],
): string {
  return `Extract research proposals from one source passage. Return JSON only with keys claims, events, relationships.

PERSONALITY: ${personality}
TEXTUAL LAYER: ${layer || "not specified"}
CHUNK ID: ${chunkId}
VALID PARAMETER FIELD CODES: ${fieldCodes.join(", ")}
REQUESTED PROPOSAL TYPES: ${proposalTypes.join(", ")}

Rules:
- Claims must be atomic and directly supported by the passage.
- Do not combine unrelated facts.
- Distinguish direct textual evidence, traditional narrative, historical inference, scholarship, modern interpretation, contested, and uncertain material.
- Never claim that an epic narrative is externally verified history.
- Use only a listed parameterFieldCode.
- claimKind must be one of: ${[...CLAIM_KINDS].join(", ")}.
- certainty must be one of: ${[...CERTAINTIES].join(", ")}.
- confidence is 0 to 1.
- Events use narrative chronology labels when appropriate, never invented modern dates.
- Relationships must name the other person and remain evidence-bound.
- Omit proposals that the passage does not support.
- Return empty arrays for proposal types that were not requested.

JSON shape:
{"claims":[{"claimText":"...","parameterFieldCode":"...","claimKind":"traditional_account","certainty":"high","confidence":0.9,"note":"direct passage"}],"events":[{"title":"...","summary":"...","eventType":"...","chronologyLabel":"..."}],"relationships":[{"objectName":"...","relationshipType":"...","description":"..."}]}

PASSAGE:
${truncateText(text, 12_000)}`;
}

export async function extractCandidateProposals(input: {
  sourceId: string;
  personalityId: string;
  limit?: number;
  proposalTypes?: ProposalType[];
}): Promise<{ claims: number; duplicates: number; events: number; relationships: number; processedChunks: number }> {
  const limit = Math.min(Math.max(input.limit || 10, 1), 25);
  const proposalTypes = [...new Set(input.proposalTypes || ["claims", "events", "relationships"])] as ProposalType[];
  const enabledProposalTypes = new Set(proposalTypes);
  const [{ data: personality, error: personalityError }, { data: chunks, error: chunksError }] = await Promise.all([
    supabaseAdmin.from("personalities").select("id, canonical_name, personality_categories(category_id, is_primary)").eq("id", input.personalityId).single(),
    supabaseAdmin
      .from("source_chunks")
      .select("id, chunk_text, textual_layer")
      .eq("source_id", input.sourceId)
      .eq("is_active", true)
      .order("chunk_index")
      .limit(limit),
  ]);
  if (personalityError || chunksError) {
    throw new CorpusError("CLAIM_EXTRACTION_FAILED", "Candidate extraction inputs could not be loaded.", 500, { cause: personalityError || chunksError });
  }
  const membership = selectPrimaryCategory((personality.personality_categories || []) as Array<{ category_id: string; is_primary: boolean }>);
  if (!membership) throw new CorpusError("CLAIM_EXTRACTION_FAILED", "The personality has no research framework.", 422);
  const { data: fields, error: fieldsError } = await supabaseAdmin
    .from("parameter_fields")
    .select("id, code, label, parameters!inner(category_id)")
    .eq("parameters.category_id", membership.category_id);
  if (fieldsError) throw new CorpusError("CLAIM_EXTRACTION_FAILED", "The personality research framework could not be loaded.", 500, { cause: fieldsError });

  const [{ data: existingClaims }, { data: existingCandidates }, { data: existingEvents }, { data: existingRelationships }] = await Promise.all([
    supabaseAdmin.from("claims").select("id, claim_text").eq("personality_id", input.personalityId).limit(1000),
    supabaseAdmin.from("candidate_claims").select("id, claim_text").eq("personality_id", input.personalityId).limit(1000),
    supabaseAdmin.from("events").select("id, title").limit(1000),
    supabaseAdmin.from("relationships").select("id, object_name, relationship_type, description").eq("subject_personality_id", input.personalityId).limit(1000),
  ]);
  const fieldMap = new Map((fields || []).map((field) => [field.code, field.id]));
  const knownClaims = (existingClaims || []).map((claim) => ({ id: claim.id, text: claim.claim_text, normalized: normalizedClaim(claim.claim_text) }));
  const knownCandidateTexts = new Set((existingCandidates || []).map((claim) => normalizedClaim(claim.claim_text)));
  const knownEvents = new Set((existingEvents || []).map((event) => normalizedClaim(event.title)));
  const knownRelationships = new Set((existingRelationships || []).map((relationship) => normalizedClaim(`${relationship.object_name} ${relationship.relationship_type} ${relationship.description}`)));
  let claimsCreated = 0;
  let duplicates = 0;
  let eventsCreated = 0;
  let relationshipsCreated = 0;

  for (const chunk of chunks || []) {
    let payload: ExtractionPayload;
    try {
      const { text } = await generateText(
        extractionPrompt(personality.canonical_name, chunk.textual_layer, [...fieldMap.keys()], chunk.id, chunk.chunk_text, proposalTypes),
        { timeoutMs: 40_000, errorCode: "CLAIM_EXTRACTION_FAILED" },
      );
      payload = parseGeminiJson<ExtractionPayload>(text);
    } catch (error) {
      if (error instanceof CorpusError) throw error;
      throw new CorpusError("CLAIM_EXTRACTION_FAILED", "Gemini returned invalid extraction data.", 502, { cause: error });
    }

    for (const proposal of (enabledProposalTypes.has("claims") ? payload.claims || [] : []).slice(0, 12)) {
      const claimText = proposal.claimText?.trim();
      const fieldId = proposal.parameterFieldCode ? fieldMap.get(proposal.parameterFieldCode) : undefined;
      if (!claimText || !fieldId) continue;
      const normalized = normalizedClaim(claimText);
      if (!normalized || knownCandidateTexts.has(normalized)) {
        duplicates += 1;
        continue;
      }
      const matchingClaim = knownClaims.find((claim) => claim.normalized === normalized || tokenJaccard(claim.text, claimText) >= 0.9);
      const status = matchingClaim ? "duplicate" : "pending";
      const { error } = await supabaseAdmin.from("candidate_claims").insert({
        personality_id: input.personalityId,
        parameter_field_id: fieldId,
        source_chunk_id: chunk.id,
        claim_text: claimText,
        claim_kind: CLAIM_KINDS.has(proposal.claimKind || "") ? proposal.claimKind : "traditional_account",
        certainty: CERTAINTIES.has(proposal.certainty || "") ? proposal.certainty : "unknown",
        extraction_confidence: Math.max(0, Math.min(1, Number(proposal.confidence) || 0.5)),
        extraction_note: proposal.note?.trim() || (matchingClaim ? "Near-duplicate of an existing curated claim." : null),
        status,
        duplicate_of_claim_id: matchingClaim?.id || null,
      });
      if (error) throw new CorpusError("CLAIM_EXTRACTION_FAILED", "A candidate claim could not be saved.", 500, { cause: error });
      knownCandidateTexts.add(normalized);
      if (matchingClaim) duplicates += 1;
      else claimsCreated += 1;
    }

    for (const event of (enabledProposalTypes.has("events") ? payload.events || [] : []).slice(0, 4)) {
      if (!event.title?.trim() || !event.summary?.trim()) continue;
      const normalized = normalizedClaim(event.title);
      if (knownEvents.has(normalized)) continue;
      const { data: created, error } = await supabaseAdmin
        .from("events")
        .insert({
          title: event.title.trim(),
          summary: event.summary.trim(),
          event_type: event.eventType?.trim() || null,
          chronology_label: event.chronologyLabel?.trim() || null,
          textual_layer: chunk.textual_layer,
          review_status: "draft",
          metadata: { proposal_method: "ai", source_chunk_id: chunk.id },
        })
        .select("id")
        .single();
      if (error) throw new CorpusError("CLAIM_EXTRACTION_FAILED", "An event proposal could not be saved.", 500, { cause: error });
      const [personalityLink, chunkLink] = await Promise.all([
        supabaseAdmin.from("event_personalities").insert({ event_id: created.id, personality_id: input.personalityId, role: "participant" }),
        supabaseAdmin.from("event_chunks").insert({ event_id: created.id, chunk_id: chunk.id, relationship: "evidence" }),
      ]);
      if (personalityLink.error || chunkLink.error) {
        await supabaseAdmin.from("events").delete().eq("id", created.id);
        throw new CorpusError("CLAIM_EXTRACTION_FAILED", "Event evidence links could not be saved.", 500, { cause: personalityLink.error || chunkLink.error });
      }
      knownEvents.add(normalized);
      eventsCreated += 1;
    }

    for (const relationship of (enabledProposalTypes.has("relationships") ? payload.relationships || [] : []).slice(0, 6)) {
      if (!relationship.objectName?.trim() || !relationship.relationshipType?.trim() || !relationship.description?.trim()) continue;
      const normalized = normalizedClaim(`${relationship.objectName} ${relationship.relationshipType} ${relationship.description}`);
      if (knownRelationships.has(normalized)) continue;
      const { data: created, error } = await supabaseAdmin
        .from("relationships")
        .insert({
          subject_personality_id: input.personalityId,
          object_name: relationship.objectName.trim(),
          relationship_type: relationship.relationshipType.trim(),
          description: relationship.description.trim(),
          textual_layer: chunk.textual_layer,
          review_status: "draft",
          metadata: { proposal_method: "ai", source_chunk_id: chunk.id },
        })
        .select("id")
        .single();
      if (error) throw new CorpusError("CLAIM_EXTRACTION_FAILED", "A relationship proposal could not be saved.", 500, { cause: error });
      const { error: linkError } = await supabaseAdmin.from("relationship_chunks").insert({ relationship_id: created.id, chunk_id: chunk.id, relationship: "evidence" });
      if (linkError) {
        await supabaseAdmin.from("relationships").delete().eq("id", created.id);
        throw new CorpusError("CLAIM_EXTRACTION_FAILED", "Relationship evidence could not be linked.", 500, { cause: linkError });
      }
      knownRelationships.add(normalized);
      relationshipsCreated += 1;
    }
  }

  return {
    claims: claimsCreated,
    duplicates,
    events: eventsCreated,
    relationships: relationshipsCreated,
    processedChunks: chunks?.length || 0,
  };
}

export async function reviewCandidate(input: {
  candidateId: string;
  decision: "accepted" | "rejected" | "duplicate" | "needs_review";
  reviewer: string;
  duplicateOfClaimId?: string | null;
}): Promise<{ candidateId: string; claimId?: string }> {
  if (input.decision === "accepted") {
    const { data, error } = await supabaseAdmin.rpc("accept_candidate_claim", {
      candidate_uuid: input.candidateId,
      reviewer: input.reviewer,
    });
    if (error) throw new CorpusError("DATABASE_FAILED", "The candidate could not be accepted.", 500, { cause: error });
    return { candidateId: input.candidateId, claimId: data as string };
  }
  const { error } = await supabaseAdmin
    .from("candidate_claims")
    .update({
      status: input.decision,
      duplicate_of_claim_id: input.decision === "duplicate" ? input.duplicateOfClaimId || null : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: input.reviewer,
    })
    .eq("id", input.candidateId);
  if (error) throw new CorpusError("DATABASE_FAILED", "The candidate review could not be saved.", 500, { cause: error });
  return { candidateId: input.candidateId };
}
