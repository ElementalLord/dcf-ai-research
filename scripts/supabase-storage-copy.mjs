// Copy Supabase Storage files (profile photos) from one project to another.
//
// Only needed for Plan B in docs/transfer-vercel-supabase.md, when the database is copied into a
// new Supabase project instead of transferring the existing one. A transfer keeps storage as is.
// Run it after scripts/supabase-db-copy.sh restore. Safe to run again: files already present are skipped.
//
//   OLD_SUPABASE_URL=https://<old-ref>.supabase.co OLD_SUPABASE_SECRET_KEY=... \
//   NEW_SUPABASE_URL=https://<new-ref>.supabase.co NEW_SUPABASE_SECRET_KEY=... \
//   node scripts/supabase-storage-copy.mjs
//
// Keys: Supabase → Project Settings → API Keys → secret (or service_role) key, for each project.
// Pass them as environment variables for this one command; never paste them into a file in the repo.
import { createClient } from "@supabase/supabase-js";

const need = (name) => {
  const value = process.env[name];
  if (!value) { console.error(`Set ${name}. See the comment at the top of this file.`); process.exit(1); }
  return value;
};
const oldUrl = need("OLD_SUPABASE_URL"); const newUrl = need("NEW_SUPABASE_URL");
const from = createClient(oldUrl, need("OLD_SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
const to = createClient(newUrl, need("NEW_SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
if (oldUrl === newUrl) { console.error("OLD and NEW project URLs are the same."); process.exit(1); }

/** Every file path in a bucket. Folders come back from list() without an id. */
async function listAll(bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await from.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`Listing ${bucket}/${prefix}: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...await listAll(bucket, path));
      else files.push({ path, type: item.metadata?.mimetype });
    }
    if (data.length < 1000) return files;
  }
}

const { data: buckets, error } = await from.storage.listBuckets();
if (error) throw new Error(`Listing buckets: ${error.message}`);
if (!buckets.length) console.log("The old project has no storage buckets. Nothing to copy.");

let copied = 0; let skipped = 0;
for (const bucket of buckets) {
  const { data: existing } = await to.storage.getBucket(bucket.id);
  if (!existing) {
    const { error: createError } = await to.storage.createBucket(bucket.id, {
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit ?? undefined,
      allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
    });
    if (createError) throw new Error(`Creating bucket ${bucket.id}: ${createError.message}`);
  }
  const files = await listAll(bucket.id);
  console.log(`${bucket.id}: ${files.length} file(s)`);
  for (const file of files) {
    const { data: blob, error: downloadError } = await from.storage.from(bucket.id).download(file.path);
    if (downloadError) throw new Error(`Downloading ${bucket.id}/${file.path}: ${downloadError.message}`);
    const { error: uploadError } = await to.storage.from(bucket.id).upload(file.path, new Uint8Array(await blob.arrayBuffer()), {
      contentType: file.type || blob.type || "application/octet-stream", cacheControl: "31536000", upsert: false,
    });
    if (uploadError && /exists|duplicate/i.test(uploadError.message)) { skipped++; continue; }
    if (uploadError) throw new Error(`Uploading ${bucket.id}/${file.path}: ${uploadError.message}`);
    copied++;
  }
}
console.log(`Done: ${copied} copied, ${skipped} already present.`);
console.log(`Photo links saved in the database still point at ${oldUrl}. Rewrite them with the SQL in docs/transfer-vercel-supabase.md (Plan B, step 6).`);
