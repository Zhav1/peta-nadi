import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (clientInstance) return clientInstance;

  if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder') && !supabaseAnonKey.includes('placeholder')) {
    try {
      // Phase 161 (M8): all three flags are load-bearing and must stay on.
      // persistSession keeps the refresh token across reloads; autoRefreshToken
      // renews the ~1h access token; detectSessionInUrl applies a magic-link
      // session on landing. The app mirrors every refreshed token into
      // localStorage['prehub_auth_token'] + the 7-day cookie (lib/authContext.tsx).
      clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      return clientInstance;
    } catch (err) {
      console.warn('Supabase client initialization warning:', err);
    }
  }

  return null;
}

export const supabase = getSupabaseClient();
