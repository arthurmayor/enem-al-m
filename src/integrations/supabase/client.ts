import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const hasSupabaseEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabaseConfigError = hasSupabaseEnv
  ? null
  : "Missing Supabase env vars. Copy .env.example to .env and fill in the values.";

export const supabase = createClient(
  hasSupabaseEnv ? SUPABASE_URL : "https://placeholder.supabase.co",
  hasSupabaseEnv ? SUPABASE_ANON_KEY : "public-anon-placeholder-key",
);
