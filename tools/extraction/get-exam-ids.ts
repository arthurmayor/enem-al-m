import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
const supa = createClient(
  process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
async function main() {
  const { data } = await supa
    .from("exams")
    .select("id, ano, versao")
    .eq("banca", "Fuvest")
    .gte("ano", 2022)
    .order("ano");
  for (const e of data ?? []) console.log(`${e.ano} ${e.versao}: ${e.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
