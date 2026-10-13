import { createClient } from "@supabase/supabase-js";

// Link only passages that name Vasistha in an approved, already associated source.
// Source approval admits the passage to Ask; candidate claims remain in review.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const apply = process.argv.includes("--apply");
const names = /\b(?:vasistha|vasista|vasishtha|vashishta|vashishtha|vashishtaT)\b|vaśiṣṭha/i;
const checked = async (promise) => {
  const { data, error } = await promise;
  if (error) throw error;
  return data || [];
};

const people = await checked(db.from("personalities").select("id,canonical_name").eq("canonical_name", "Vasistha"));
if (people.length !== 1) throw new Error("Expected one Vasistha personality.");
const personId = people[0].id;
const links = await checked(db.from("source_personalities")
  .select("source_id,sources(id,title,source_status)").eq("personality_id", personId));
const approvedIds = links.filter((link) => link.sources?.source_status === "approved").map((link) => link.source_id);
if (!approvedIds.length) throw new Error("No approved Vasistha sources found.");
const chunks = await checked(db.from("source_chunks").select("id,source_id,chunk_text")
  .in("source_id", approvedIds).eq("is_active", true).limit(1000));
const matching = chunks.filter((chunk) => names.test(chunk.chunk_text) && chunk.chunk_text.length >= 120);
const existing = await checked(db.from("chunk_personalities").select("chunk_id").eq("personality_id", personId).limit(1000));
const existingIds = new Set(existing.map((row) => row.chunk_id));
const missing = matching.filter((chunk) => !existingIds.has(chunk.id));
if (apply && missing.length) {
  await checked(db.from("chunk_personalities").upsert(missing.map((chunk) => ({
    chunk_id: chunk.id, personality_id: personId, relationship: "subject",
    relevance_score: 1, tagging_method: "rule", confidence: 0.9,
  })), { onConflict: "chunk_id,personality_id" }));
}
console.log(JSON.stringify({ approvedSources: approvedIds.length, activeApprovedChunks: chunks.length,
  directlyNamingVasistha: matching.length, previouslyLinked: existing.length,
  added: apply ? missing.length : 0, pending: apply ? 0 : missing.length }, null, 2));
