import AskClient, { type Personality } from "../ask/ask-client";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const dynamic = "force-dynamic";
export default async function AiPage() {
  const { data, error } = await supabaseAdmin.from("personalities").select("id,canonical_name").order("canonical_name");
  return <AskClient personalities={(data || []) as Personality[]} loadError={error ? `Could not load personalities: ${error.message}` : ""}/>;
}
