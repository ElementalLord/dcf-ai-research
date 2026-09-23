import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertCorpusAdmin, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    const requestedId = request.nextUrl.searchParams.get("personalityId");
    let personalityQuery = supabaseAdmin.from("personalities").select("id, canonical_name");
    personalityQuery = requestedId ? personalityQuery.eq("id", requestedId) : personalityQuery.ilike("canonical_name", "Vishvamitra");
    const { data: personality, error: personalityError } = await personalityQuery.limit(1).single();
    if (personalityError) throw new CorpusError("DATABASE_FAILED", "The diagnostic personality could not be loaded.", 404, { cause: personalityError });

    const [
      personalityCount, claimsResult, sourceCount, chunkCount, chunkPersonalityCount,
      chunkParameterCount, claimSourceCount, claimChunkCount, inventoryResult,
      accessResult, cacheResult,
    ] = await Promise.all([
      supabaseAdmin.from("personalities").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("claims").select("id, review_status, claim_sources(source_id), claim_chunks(chunk_id)").eq("personality_id", personality.id).limit(10_000),
      supabaseAdmin.from("sources").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("source_chunks").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("chunk_personalities").select("chunk_id", { count: "exact", head: true }).eq("personality_id", personality.id),
      supabaseAdmin.from("chunk_parameter_fields").select("chunk_id", { count: "exact", head: true }),
      supabaseAdmin.from("claim_sources").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("claim_chunks").select("claim_id", { count: "exact", head: true }),
      supabaseAdmin.rpc("get_retrieval_inventory", { personality_uuid: personality.id }),
      supabaseAdmin.from("approved_source_access").select("id, display_name, domain, scope_type, exact_url, allow_live_search, allow_live_fetch, allow_ingestion, evidence_use_status, is_active").order("display_name"),
      supabaseAdmin.from("live_research_cache").select("id, canonical_url, fetch_status, hit_count, expires_at").limit(100),
    ]);
    const failure = [personalityCount, claimsResult, sourceCount, chunkCount, chunkPersonalityCount, chunkParameterCount, claimSourceCount, claimChunkCount, inventoryResult, accessResult, cacheResult].find((result) => result.error)?.error;
    if (failure) throw new CorpusError("DATABASE_FAILED", "Retrieval diagnostics could not be completed.", 500, { cause: failure });

    const claims = claimsResult.data || [];
    const byStatus = claims.reduce<Record<string, number>>((counts, claim) => {
      counts[claim.review_status] = (counts[claim.review_status] || 0) + 1;
      return counts;
    }, {});
    const linkedSourceIds = new Set<string>();
    let personalityClaimSourceLinks = 0;
    let personalityClaimChunkLinks = 0;
    for (const claim of claims) {
      for (const link of claim.claim_sources || []) { linkedSourceIds.add(link.source_id); personalityClaimSourceLinks += 1; }
      personalityClaimChunkLinks += claim.claim_chunks?.length || 0;
    }
    const inventory = inventoryResult.data && typeof inventoryResult.data === "object" ? inventoryResult.data : {};
    const enabledAccess = (accessResult.data || []).filter((rule) => rule.is_active && rule.allow_live_fetch && rule.evidence_use_status === "approved");

    return NextResponse.json({
      personality: { id: personality.id, name: personality.canonical_name },
      counts: {
        personalities: personalityCount.count || 0,
        claims: claims.length,
        claimsByReviewStatus: byStatus,
        sources: sourceCount.count || 0,
        sourcesAssociatedWithPersonalityClaims: linkedSourceIds.size,
        sourceChunks: chunkCount.count || 0,
        chunkPersonalitiesForPersonality: chunkPersonalityCount.count || 0,
        chunkParameterFieldLinks: chunkParameterCount.count || 0,
        claimSources: claimSourceCount.count || 0,
        claimChunks: claimChunkCount.count || 0,
        personalityClaimSourceLinks,
        personalityClaimChunkLinks,
        approvedLiveSources: enabledAccess.length,
        cachedWebPassages: (cacheResult.data || []).filter((row) => row.fetch_status === "ready").length,
        ...inventory,
      },
      approvedLiveSources: enabledAccess,
      cache: cacheResult.data || [],
    });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}
