import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";

const BUCKET = "portraits";
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Magic bytes, so a file is only stored when it really is the image type it claims to be. */
function looksLike(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

/** The public portraits bucket, created the first time a photo is uploaded. */
async function ensureBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES, allowedMimeTypes: Object.keys(TYPES) });
  if (error && !/already exists/i.test(error.message)) throw new CorpusError("DATABASE_FAILED", "Photo storage could not be prepared.", 500, { cause: error });
}

/** Uploads a profile photo and returns its public address. The person's form saves the address. */
export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    assertRequestSize(request, MAX_BYTES + 64 * 1024);
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new CorpusError("INVALID_INPUT", "Choose a photo to upload.", 400);
    const extension = TYPES[file.type];
    if (!extension) throw new CorpusError("INVALID_INPUT", "Use a JPG, PNG or WebP photo.", 400);
    if (file.size > MAX_BYTES) throw new CorpusError("INVALID_INPUT", "The photo must be 4 MB or smaller.", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLike(file.type, bytes)) throw new CorpusError("INVALID_INPUT", "That file is not a readable photo.", 400);
    await ensureBucket();
    const path = `${randomUUID()}.${extension}`;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (error) throw new CorpusError("DATABASE_FAILED", "The photo could not be uploaded.", 500, { cause: error });
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl }, { status: 201 });
  } catch (error) { return corpusErrorResponse(error); }
}
