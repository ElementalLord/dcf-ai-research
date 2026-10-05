import { NextRequest, NextResponse } from "next/server";
import { assertCorpusAdmin } from "@/lib/corpus/api";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  const { data, error } = await supabaseAdmin
    .from("personalities")
    .select("canonical_name")
    .limit(5);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
