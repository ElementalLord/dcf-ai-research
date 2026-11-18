import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "@/lib/corpus/errors";
import { normalizeSourceUrl } from "@/lib/corpus/source-dedupe";

export type NewSource = {
  title: string;
  author?: string | null;
  publisherOrInstitution?: string | null;
  sourceType?: string;
  url?: string | null;
  citation?: string | null;
  textualLayer?: string | null;
  rightsOrAccessNote?: string | null;
};

/**
 * Adds a source as a candidate awaiting review and links it to a person. A source whose web
 * address is already recorded is reused and linked instead, so the same page is never stored twice.
 */
export async function addSourceForPerson(input: NewSource, personalityId?: string | null): Promise<{ source: { id: string; title: string }; reused: boolean }> {
  const normalizedUrl = input.url ? normalizeSourceUrl(input.url) : null;
  if (normalizedUrl) {
    const possibleUrls = [...new Set([
      normalizedUrl,
      input.url,
      normalizedUrl.endsWith("/") ? normalizedUrl.slice(0, -1) : `${normalizedUrl}/`,
    ].filter((value): value is string => Boolean(value)))];
    const { data: existingRows, error } = await supabaseAdmin.from("sources").select("id, title").in("url", possibleUrls).limit(1);
    if (error) throw new CorpusError("DATABASE_FAILED", "Source duplication could not be checked.", 500, { cause: error });
    const existing = existingRows?.[0];
    if (existing) {
      if (personalityId) await link(existing.id, personalityId);
      return { source: existing, reused: true };
    }
  }
  const { data, error } = await supabaseAdmin.from("sources").insert({
    title: input.title,
    author: input.author || null,
    publisher_or_institution: input.publisherOrInstitution || null,
    source_type: input.sourceType || "other",
    url: normalizedUrl,
    citation: input.citation || null,
    textual_layer: input.textualLayer || null,
    rights_or_access_note: input.rightsOrAccessNote || null,
    source_status: "candidate",
    approval_origin: "human_manual",
    ingestion_status: "not_ingested",
  }).select("id, title").single();
  if (error) throw new CorpusError("DATABASE_FAILED", "The source record could not be created.", 500, { cause: error });
  if (personalityId) await link(data.id, personalityId);
  return { source: data, reused: false };
}

async function link(sourceId: string, personalityId: string) {
  const { error } = await supabaseAdmin.from("source_personalities")
    .upsert({ source_id: sourceId, personality_id: personalityId, mapping_method: "manual" }, { onConflict: "source_id,personality_id", ignoreDuplicates: true });
  if (error) throw new CorpusError("DATABASE_FAILED", "The source was saved but could not be linked to the person.", 500, { cause: error });
}

/** A readable title for a source given only as a web address, such as "britannica.com: Homi Bhabha". */
export function titleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const tail = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_]+/g, " ").trim();
    return (tail ? `${host}: ${tail}` : host).slice(0, 500);
  } catch {
    return url.slice(0, 500);
  }
}
