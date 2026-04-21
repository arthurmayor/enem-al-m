import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
const supa = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
async function main() {
  const eid = "8e257562-730b-4580-8ea0-90a3fc88cabc";
  for (const n of [28, 29, 30, 31, 32]) {
    const { data: r } = await supa.from("question_raw")
      .select("id, numero, status, stem, options, content_hash")
      .eq("exam_id", eid).eq("numero", n).maybeSingle();
    if (r) {
      console.log(`q${n} [${r.status}] ch=${r.content_hash?.slice(0, 12)} stem="${(r.stem as string).slice(0, 80)}..."`);
      const opts = r.options as Array<{ label: string; text: string }>;
      if (opts) for (const o of opts.slice(0, 1)) console.log(`    (${o.label}) "${(o.text ?? "").slice(0, 60)}"`);
    }
  }
  console.log("\n--- 2022 q35-q40 ---");
  const eid2 = "86dbad16-ad82-429f-8afb-dda157f53f6a";
  for (const n of [34, 35, 36, 37, 38, 39, 40]) {
    const { data: r } = await supa.from("question_raw")
      .select("id, numero, status, stem, options, content_hash")
      .eq("exam_id", eid2).eq("numero", n).maybeSingle();
    if (r) {
      console.log(`q${n} [${r.status}] ch=${r.content_hash?.slice(0, 12)} stem="${(r.stem as string).slice(0, 80)}..."`);
      const opts = r.options as Array<{ label: string; text: string }>;
      if (opts) for (const o of opts.slice(0, 1)) console.log(`    (${o.label}) "${(o.text ?? "").slice(0, 60)}"`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
