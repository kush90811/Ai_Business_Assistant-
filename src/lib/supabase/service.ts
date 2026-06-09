import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

/**
 * Creates a Supabase client with service role privileges.
 * WARNING: This client bypasses Row Level Security (RLS).
 * Use only on the server for secure system operations.
 */
export function createSupabaseServiceClient() {
  const url = env.supabaseUrl;
  const serviceKey = env.supabaseServiceRoleKey;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase URL or Service Role Key is missing from environment configuration."
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
