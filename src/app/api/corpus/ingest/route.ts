import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { ingestSections } from "@/lib/corpus/ingest";
import { extractPdf, extractUrl } from "@/lib/corpus/source-extract";
import { tagSourceChunks } from "@/lib/corpus/tagging";

const jsonSchema = z.object({
  sourceId: z.string().uuid(),
  personalityIds: z.array(z.string().uuid()).max(20),
  parameterFieldIds: z.array(z.string().uuid()).max(100).optional(),
  mode: z.enum(["text", "url"]),
  text: z.string().max(5_000_000).optional(),
  url: z.string().url().max(2_000).optional(),
  textualLayer: z.string().trim().max(120).nullable().optional(),
  language: z.string().trim().max(40).nullable().optional(),
  append: z.boolean().optional(),
  pageOrSection: z.string().trim().max(300).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  let failureSourceId: string | null = null;
  try {
    const contentType = request.headers.get("content-type") || "";
    let sourceId: string;
    let personalityIds: string[];
    let parameterFieldIds: string[] = [];
    let textualLayer: string | null = null;
    let language: string | null = null;
    let append = false;
    let sections;

    if (contentType.includes("multipart/form-data")) {
      assertRequestSize(request, 22 * 1024 * 1024);
      const form = await request.formData();
      sourceId = String(form.get("sourceId") || "");
      failureSourceId = sourceId || null;
      personalityIds = String(form.get("personalityIds") || "").split(",").filter(Boolean);
      parameterFieldIds = String(form.get("parameterFieldIds") || "").split(",").filter(Boolean);
      textualLayer = String(form.get("textualLayer") || "").trim() || null;
      language = String(form.get("language") || "").trim() || null;
      const file = form.get("file");
      if (!z.string().uuid().safeParse(sourceId).success || personalityIds.some((id) => !z.string().uuid().safeParse(id).success) || !(file instanceof File)) {
        throw new CorpusError("INVALID_INPUT", "A valid source, personality, and PDF file are required.", 400);
      }
      if (file.type && file.type !== "application/pdf") throw new CorpusError("INVALID_INPUT", "Only PDF uploads are supported.", 415);
      sections = await extractPdf(new Uint8Array(await file.arrayBuffer()));
    } else {
      assertRequestSize(request, 5_200_000);
      const parsed = jsonSchema.safeParse(await request.json());
      if (!parsed.success) throw new CorpusError("INVALID_INPUT", "The ingestion request is invalid.", 400);
      ({ sourceId, personalityIds, parameterFieldIds = [], textualLayer = null, language = null, append = false } = parsed.data);
      failureSourceId = sourceId;
      if (append) {
        if (parsed.data.mode !== "text") throw new CorpusError("INVALID_INPUT", "Only pasted text can be appended to a source.", 400);
        const source = await supabaseAdmin.from("sources").select("source_status").eq("id", sourceId).single();
        if (source.error) throw source.error;
        if (source.data.source_status === "approved") throw new CorpusError("REVIEW_REQUIRED", "Return an approved source to candidate review before adding text.", 409);
      }
      if (parsed.data.mode === "text") {
        if (!parsed.data.text?.trim()) throw new CorpusError("NO_TEXT_EXTRACTED", "Pasted source text is required.", 400);
        sections = [{ title: null, pageOrSection: parsed.data.pageOrSection || null, text: parsed.data.text }];
      } else {
        const { data: source, error } = await supabaseAdmin.from("sources").select("url, metadata").eq("id", sourceId).single();
        if (error) throw new CorpusError("DATABASE_FAILED", "The source could not be loaded.", 500, { cause: error });
        const sourceUrl = parsed.data.url || source.url;
        if (!sourceUrl) throw new CorpusError("INVALID_INPUT", "This source does not have a URL.", 400);
        const extracted = await extractUrl(sourceUrl);
        sections = extracted.sections;
        await supabaseAdmin.from("sources").update({
          url: extracted.finalUrl,
          metadata: {
            ...((source.metadata && typeof source.metadata === "object") ? source.metadata as Record<string, unknown> : {}),
            fetched_content_type: extracted.contentType,
          },
        }).eq("id", sourceId);
      }
    }

    const result = await ingestSections({ sourceId, personalityIds, parameterFieldIds, textualLayer, language, sections, append });
    const tags = await tagSourceChunks(sourceId, false);
    return NextResponse.json({ success: true, ...result, tags });
  } catch (error) {
    if (failureSourceId) {
      const message = error instanceof Error ? error.message : "Unknown ingestion failure.";
      await supabaseAdmin
        .from("sources")
        .update({ ingestion_status: "failed", last_ingestion_error: message.slice(0, 1000) })
        .eq("id", failureSourceId);
    }
    return corpusErrorResponse(error);
  }
}
