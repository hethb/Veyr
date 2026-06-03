import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Used by the proxy to insert request rows and to manage
 * api_keys on behalf of authenticated dashboard users (after JWT verification).
 *
 * Never expose this client or its key to the browser.
 */
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
