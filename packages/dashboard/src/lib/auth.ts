import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Auth is enabled only when explicitly turned on AND configured. When off, the
 * dashboard runs in zero-config local mode (no login, single-tenant proxy).
 */
export const authEnabled: boolean =
  import.meta.env.VITE_AUTH_ENABLED === "true" && Boolean(url && anon);

export const supabase: SupabaseClient | null = authEnabled
  ? createClient(url as string, anon as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Sends a passwordless magic link to the given email. */
export async function sendMagicLink(email: string): Promise<void> {
  if (!supabase) throw new Error("Auth is not enabled");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/welcome` },
  });
  if (error) throw new Error(error.message);
}

/** Current access token, or null if not signed in / auth disabled. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}
