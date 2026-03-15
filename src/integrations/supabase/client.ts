import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-sUkqjLT40jlJNgPre75Ow_NF6ySHLS";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
