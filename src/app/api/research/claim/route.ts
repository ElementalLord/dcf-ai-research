import { assertCorpusAdmin } from "@/lib/corpus/api";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    const body = await request.json();

    const {
      personalityId,
      parameterFieldId,
      claimText,
      claimKind,
      certainty,
      researcherNotes,
      existingSourceId,
      sourceTitle,
      sourceAuthor,
      sourcePublisher,
      sourceYear,
      sourceType,
      sourceUrl,
      sourceCitation,
      evidenceExcerpt,
      pageOrSection,
      evidenceRelationship,
    } = body;

    if (!personalityId) {
      return NextResponse.json(
        { error: "A personality is required." },
        { status: 400 }
      );
    }

    if (!parameterFieldId) {
      return NextResponse.json(
        { error: "A research field is required." },
        { status: 400 }
      );
    }

    if (!claimText?.trim()) {
      return NextResponse.json(
        { error: "Claim text is required." },
        { status: 400 }
      );
    }

    let sourceId = existingSourceId || null;

    if (!sourceId && sourceTitle?.trim()) {
      const { data: newSource, error: sourceError } = await supabaseAdmin
        .from("sources")
        .insert({
          title: sourceTitle.trim(),
          author: sourceAuthor?.trim() || null,
          publisher_or_institution: sourcePublisher?.trim() || null,
          publication_year: sourceYear ? Number(sourceYear) : null,
          source_type: sourceType || "other",
          url: sourceUrl?.trim() || null,
          citation: sourceCitation?.trim() || null,
          source_status: "candidate",
          approval_origin: "human_manual",
        })
        .select("id")
        .single();

      if (sourceError) throw sourceError;

      sourceId = newSource.id;
    }

    if (!sourceId) {
      return NextResponse.json(
        { error: "Select an existing source or enter a new source." },
        { status: 400 }
      );
    }

    const { data: claim, error: claimError } = await supabaseAdmin
      .from("claims")
      .insert({
        personality_id: personalityId,
        parameter_field_id: parameterFieldId,
        claim_text: claimText.trim(),
        claim_kind: claimKind || "established_fact",
        certainty: certainty || "unknown",
        review_status: "draft",
        approval_origin: "human_manual",
        evidence_type: claimKind === "traditional_account" || claimKind === "textual_tradition"
          ? "traditional_narrative"
          : claimKind === "scholarly_interpretation"
            ? "scholarly_interpretation"
            : claimKind === "contested"
              ? "contested"
              : "uncertain",
        researcher_notes: researcherNotes?.trim() || null,
      })
      .select("id")
      .single();

    if (claimError) throw claimError;

    const { error: evidenceError } = await supabaseAdmin
      .from("claim_sources")
      .insert({
        claim_id: claim.id,
        source_id: sourceId,
        relationship: evidenceRelationship || "supports",
        evidence_excerpt: evidenceExcerpt?.trim() || null,
        page_or_section: pageOrSection?.trim() || null,
      });

    if (evidenceError) {
      await supabaseAdmin
        .from("claims")
        .delete()
        .eq("id", claim.id);

      throw evidenceError;
    }

    await supabaseAdmin.from("source_personalities").upsert({
      source_id: sourceId,
      personality_id: personalityId,
      relationship: "supports_claims",
      confidence: 1,
      mapping_method: "claim_link",
    }, { onConflict: "source_id,personality_id" });

    return NextResponse.json({
      success: true,
      claimId: claim.id,
      sourceId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Could not save research." },
      { status: 500 }
    );
  }
}
