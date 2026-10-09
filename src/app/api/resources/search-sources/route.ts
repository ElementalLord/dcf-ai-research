import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadSearchPolicy, normalizeSearchDomain } from "@/lib/live-research/search-policy";

const ruleSchema = z.object({ domain: z.string().max(253), display_name: z.string().trim().min(1).max(200), status: z.enum(["allowed", "blocked", "disabled"]), category: z.string().trim().min(1).max(80), notes: z.string().trim().max(2000) });
const modeSchema = z.object({ mode: z.enum(["credible_web", "approved_domains_only", "custom"]) });

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    const [policy, discovered] = await Promise.all([
      loadSearchPolicy(),
      supabaseAdmin.from("discovered_search_sources").select("domain,example_url,display_name,category,state,first_seen_at").eq("state", "new").order("first_seen_at", { ascending: false }).limit(100),
    ]);
    if (discovered.error) throw discovered.error;
    return NextResponse.json({ ...policy, discovered: discovered.data || [] });
  } catch (error) { return corpusErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = ruleSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "Invalid search source.", 400);
    const domain = normalizeSearchDomain(parsed.data.domain);
    const { error } = await supabaseAdmin.from("search_source_rules").upsert({ ...parsed.data, domain, updated_at: new Date().toISOString() }, { onConflict: "domain" });
    if (error) throw error;
    await supabaseAdmin.from("discovered_search_sources").delete().eq("domain", domain);
    return NextResponse.json({ saved: domain });
  } catch (error) { return corpusErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    assertRequestSize(request);
    const body = await request.json();
    const parsed = modeSchema.safeParse(body);
    if (parsed.success) {
      const { error } = await supabaseAdmin.from("search_policy").update({ mode: parsed.data.mode, updated_at: new Date().toISOString() }).eq("id", true);
      if (error) throw error;
      return NextResponse.json({ mode: parsed.data.mode });
    }
    const ignored = z.object({ ignoreDomain: z.string().max(253) }).safeParse(body);
    if (ignored.success) {
      const domain = normalizeSearchDomain(ignored.data.ignoreDomain);
      const { error } = await supabaseAdmin.from("discovered_search_sources").update({ state: "ignored" }).eq("domain", domain);
      if (error) throw error;
      return NextResponse.json({ ignored: domain });
    }
    throw new CorpusError("INVALID_INPUT", "Invalid search policy update.", 400);
  } catch (error) { return corpusErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = z.object({ domain: z.string().max(253) }).safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "Invalid domain.", 400);
    const domain = normalizeSearchDomain(parsed.data.domain);
    const { error } = await supabaseAdmin.from("search_source_rules").delete().eq("domain", domain);
    if (error) throw error;
    return NextResponse.json({ removed: domain });
  } catch (error) { return corpusErrorResponse(error); }
}
