import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl?.trim() && supabaseAnonKey?.trim());

const MISSING_CONFIG_MESSAGE =
  'Supabase non configuré : renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans un fichier .env à la racine du projet pour activer le module de preuves.';

/**
 * The app is local-first (OPSEC): the investigation graph and the AI analyzer
 * work without any backend. Supabase is only needed by the optional evidence
 * capture module. To avoid crashing the whole app on boot when the credentials
 * are absent, we return a client that fails loudly only when it is actually used.
 */
function createSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    return new Proxy({} as SupabaseClient, {
      get() {
        throw new Error(MISSING_CONFIG_MESSAGE);
      },
    });
  }
  return createClient(supabaseUrl as string, supabaseAnonKey as string);
}

export const supabase = createSupabaseClient();
