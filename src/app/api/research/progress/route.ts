import { assertCorpusAdmin } from "@/lib/corpus/api";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadPersonalityCoverage } from "@/lib/corpus/onboarding";

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    const personalityId =
      request.nextUrl.searchParams.get("personalityId");

    if (!personalityId) {
      return NextResponse.json(
        { error: "personalityId is required." },
        { status: 400 }
      );
    }

    // Find the personality's primary category.
    const { data: membershipRows, error: membershipError } =
      await supabaseAdmin
        .from("personality_categories")
        .select(`
          category_id,
          is_primary,
          categories (
            id,
            slug,
            name
          )
        `)
        .eq("personality_id", personalityId);

    if (membershipError) throw membershipError;

    const memberships = membershipRows || [];

    const primaryMembership =
      memberships.find((membership: any) => membership.is_primary) ||
      memberships[0];

    if (!primaryMembership) {
      return NextResponse.json({
        category: null,
        parameters: [],
        overall: {
          totalFields: 0,
          coveredFields: 0,
          percentage: 0,
          totalClaims: 0,
          approvedClaims: 0,
        },
      });
    }

    let category: any = primaryMembership.categories;

    if (Array.isArray(category)) {
      category = category[0];
    }

    const categoryId = primaryMembership.category_id;

    // Load every parameter + field for this category.
    const { data: parameters, error: parametersError } =
      await supabaseAdmin
        .from("parameters")
        .select(`
          id,
          code,
          name,
          sort_order,
          parameter_fields (
            id,
            code,
            label,
            sort_order
          )
        `)
        .eq("category_id", categoryId)
        .order("sort_order");

    if (parametersError) throw parametersError;

    // Load all claims currently entered for this personality.
    const { data: claims, error: claimsError } =
      await supabaseAdmin
        .from("claims")
        .select(`
          id,
          parameter_field_id,
          review_status
        `)
        .eq("personality_id", personalityId);

    if (claimsError) throw claimsError;

    const allClaims = claims || [];

    let totalFields = 0;
    let coveredFields = 0;
    let totalClaims = 0;
    let approvedClaims = 0;

    const parameterProgress = (parameters || []).map(
      (parameter: any) => {
        const fields = [
          ...(parameter.parameter_fields || []),
        ].sort(
          (a: any, b: any) =>
            a.sort_order - b.sort_order
        );

        const fieldProgress = fields.map((field: any) => {
          const fieldClaims = allClaims.filter(
            (claim: any) =>
              claim.parameter_field_id === field.id
          );

          const approved = fieldClaims.filter(
            (claim: any) =>
              claim.review_status === "approved"
          ).length;

          return {
            id: field.id,
            code: field.code,
            label: field.label,
            claimCount: fieldClaims.length,
            approvedCount: approved,
            covered: fieldClaims.length > 0,
          };
        });

        const parameterCoveredFields =
          fieldProgress.filter(
            (field: any) => field.covered
          ).length;

        const parameterClaims = fieldProgress.reduce(
          (sum: number, field: any) =>
            sum + field.claimCount,
          0
        );

        const parameterApproved = fieldProgress.reduce(
          (sum: number, field: any) =>
            sum + field.approvedCount,
          0
        );

        totalFields += fields.length;
        coveredFields += parameterCoveredFields;
        totalClaims += parameterClaims;
        approvedClaims += parameterApproved;

        let status = "missing";

        if (parameterCoveredFields === fields.length &&
            fields.length > 0) {
          status = "complete";
        } else if (parameterCoveredFields > 0) {
          status = "partial";
        }

        return {
          id: parameter.id,
          code: parameter.code,
          name: parameter.name,
          sort_order: parameter.sort_order,
          status,
          totalFields: fields.length,
          coveredFields: parameterCoveredFields,
          totalClaims: parameterClaims,
          approvedClaims: parameterApproved,
          fields: fieldProgress,
        };
      }
    );

    const percentage =
      totalFields === 0
        ? 0
        : Math.round(
            (coveredFields / totalFields) * 100
          );

    const corpusCoverage = await loadPersonalityCoverage(personalityId);
    return NextResponse.json({
      category,
      parameters: parameterProgress,
      overall: {
        totalFields,
        coveredFields,
        percentage,
        totalClaims,
        approvedClaims,
      },
      corpusCoverage: corpusCoverage.coverage,
    });
  } catch (error: any) {
    console.error("Progress error:", error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Failed to calculate research progress.",
      },
      { status: 500 }
    );
  }
}
