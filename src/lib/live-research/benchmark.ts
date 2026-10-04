import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeForMatch } from "@/lib/corpus/text";
import { lexicalSearchExpression } from "@/lib/corpus/routing";

export async function benchmarkCorpusRetrieval(personalityId: string, name: string, aliases: string[], gapNames: string[]) {
  const questions = [`Who is ${name}?`, `What is ${name} known for?`, `Why is ${name} important?`,
    ...gapNames.slice(0, 3).map((gap) => `What is known about ${name} ${gap}?`)];
  const results = [];
  for (const question of questions) {
    const expression = lexicalSearchExpression(question, aliases) || aliases.map(normalizeForMatch).filter(Boolean).slice(0, 2).join(" OR ");
    const { data, error } = await supabaseAdmin.rpc("search_source_chunks_lexical", {
      query_text: expression, personality_uuid: personalityId, parameter_field_uuids: null,
      textual_layers: null, max_results: 30,
    });
    if (error) throw error;
    const rows = (data || []) as Array<{ source_title: string | null; source_author: string | null;
      page_or_section: string | null; textual_layer: string | null }>;
    const works = new Set(rows.map((row) => [String(row.source_title || "").replace(/\b(?:sukta|hymn|verse|chapter|sarga)\s+[IVXLC\d]+.*$/i, "").trim(), row.source_author || ""].join("|").toLowerCase()));
    const exactLocations = rows.filter((row) => /\b\d+[.:]\d+(?:[.:]\d+)?\b/.test(String(row.page_or_section || ""))).length;
    results.push({ question, chunks: rows.length, independentWorks: works.size,
      exactLocations, textualLayers: new Set(rows.map((row) => row.textual_layer).filter(Boolean)).size });
  }
  return { questions: results, broadReady: results.slice(0, 3).every((item) => item.chunks >= 5 && item.independentWorks >= 3 && item.textualLayers >= 2) };
}
