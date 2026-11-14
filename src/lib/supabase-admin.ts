import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example)."
    );
  }
  client = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return client;
}

// Created on first use rather than at import, so `next build` and the static
// public pages work without database credentials. Routes that touch the
// database still fail with the configuration error above when they are called.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const value = Reflect.get(getClient(), property);
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});
