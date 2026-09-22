import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const allowedStatuses = [
  "approved",
  "needs_review",
  "rejected",
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      claimId,
      status,
      reviewerName,
      notes,
    } = body;

    if (!claimId) {
      return NextResponse.json(
        { error: "claimId is required." },
        { status: 400 }
      );
    }

    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid review status." },
        { status: 400 }
      );
    }

    if (!reviewerName?.trim()) {
      return NextResponse.json(
        { error: "Reviewer name is required." },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("claims")
      .update({
        review_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimId);

    if (updateError) throw updateError;

    let decision:
      | "approved"
      | "changes_requested"
      | "rejected";

    if (status === "approved") {
      decision = "approved";
    } else if (status === "rejected") {
      decision = "rejected";
    } else {
      decision = "changes_requested";
    }

    const { error: historyError } = await supabaseAdmin
      .from("claim_reviews")
      .insert({
        claim_id: claimId,
        reviewer_name: reviewerName.trim(),
        decision,
        notes: notes?.trim() || null,
      });

    if (historyError) throw historyError;

    return NextResponse.json({
      success: true,
      claimId,
      reviewStatus: status,
    });
  } catch (error: any) {
    console.error("Review update error:", error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Failed to update review.",
      },
      { status: 500 }
    );
  }
}
