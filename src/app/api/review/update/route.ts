import { assertCorpusAdmin } from "@/lib/corpus/api";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { z } from "zod";

const schema = z.object({
  claimId: z.string().uuid(),
  status: z.enum(["approved", "needs_review", "rejected"]),
  reviewerName: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4_000).optional(),
  approvalOrigin: z.enum(["human_manual", "mentor_review"]).default("human_manual"),
});

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A valid review decision, reviewer, and approval origin are required." },
        { status: 400 }
      );
    }
    const { claimId, status, reviewerName, notes, approvalOrigin } = parsed.data;

    const { error: updateError } = await supabaseAdmin
      .from("claims")
      .update({
        review_status: status,
        ...(status === "approved" ? {
          approval_origin: approvalOrigin,
          approval_note: notes || `${approvalOrigin === "mentor_review" ? "Mentor" : "Human"} approval recorded in the review workspace.`,
          approved_at: new Date().toISOString(),
          approved_by_label: reviewerName,
        } : {}),
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
        reviewer_name: reviewerName,
        decision,
        notes: notes || null,
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
