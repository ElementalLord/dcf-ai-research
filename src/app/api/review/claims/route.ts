import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  try {
    const personalityId =
      request.nextUrl.searchParams.get("personalityId");

    if (!personalityId) {
      return NextResponse.json(
        { error: "personalityId is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("claims")
      .select(`
        id,
        claim_text,
        claim_kind,
        certainty,
        review_status,
        approval_origin,
        approval_note,
        approved_at,
        approved_by_label,
        evidence_type,
        researcher_notes,
        created_at,

        parameter_fields (
          id,
          code,
          label,

          parameters (
            id,
            code,
            name,
            sort_order
          )
        ),

        claim_sources (
          id,
          relationship,
          evidence_excerpt,
          page_or_section,
          notes,

          sources (
            id,
            title,
            author,
            publisher_or_institution,
            publication_year,
            source_type,
            url,
            citation,
            source_status,
            approval_origin,
            approval_note
          )
        ),

        claim_chunks (
          relationship,
          confidence,
          link_method,
          source_chunks (
            id,
            page_or_section,
            textual_layer,
            chunk_text,
            sources (id, title, url)
          )
        ),

        claim_reviews (
          id,
          reviewer_name,
          decision,
          notes,
          reviewed_at
        )
      `)
      .eq("personality_id", personalityId);

    if (error) throw error;

    const claims = (data || []).sort((a: any, b: any) => {
      const aField = Array.isArray(a.parameter_fields)
        ? a.parameter_fields[0]
        : a.parameter_fields;

      const bField = Array.isArray(b.parameter_fields)
        ? b.parameter_fields[0]
        : b.parameter_fields;

      const aParam = Array.isArray(aField?.parameters)
        ? aField.parameters[0]
        : aField?.parameters;

      const bParam = Array.isArray(bField?.parameters)
        ? bField.parameters[0]
        : bField?.parameters;

      return (aParam?.sort_order || 999) - (bParam?.sort_order || 999);
    });

    return NextResponse.json({ claims });
  } catch (error: any) {
    console.error("Review claims error:", error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Failed to load claims for review.",
      },
      { status: 500 }
    );
  }
}
