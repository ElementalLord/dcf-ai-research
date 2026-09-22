import AskClient, { type Personality } from "./ask-client";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function AskPage() {
  const { data, error } = await supabaseAdmin
    .from("personalities")
    .select("id, canonical_name")
    .order("canonical_name");

  const personalities = (data || []) as Personality[];

  return (
    <AskClient
      personalities={personalities}
      loadError={
        error
          ? `Could not load personalities: ${error.message}`
          : ""
      }
    />
  );
}
