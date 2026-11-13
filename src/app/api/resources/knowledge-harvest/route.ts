import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({
  sourceId: z.string().uuid(),
  action: z.enum(["promote", "reject", "restore"]),
  note: z.string().trim().max(1000).optional(),
});

/** A reviewer's decision on one harvested source. Promotion only creates a candidate Library source. */
export async function PATCH(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    assertRequestSize(request, 4_096);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "A harvested source and a valid action are required.", 400);
    const { data, error } = await supabaseAdmin.rpc("review_knowledge_source", { p_source_id: parsed.data.sourceId,
      p_action: parsed.data.action, p_reviewer: "Resources administrator", p_note: parsed.data.note || null });
    if (error) {
      if (error.code === "P0002") throw new CorpusError("INVALID_INPUT", "That harvested source no longer exists.", 404);
      if (error.code === "22023") throw new CorpusError("INVALID_INPUT", "That action is not available for this source.", 409);
      throw new CorpusError("DATABASE_FAILED", "The decision could not be saved.", 500, { cause: error });
    }
    const result = data as { status?: string; library_source_id?: string };
    return NextResponse.json({ status: result.status, librarySourceId: result.library_source_id || null });
  } catch (error) { return corpusErrorResponse(error); }
}
