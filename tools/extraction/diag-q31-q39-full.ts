import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
const supa = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
async function main() {
  // questions by content_hash for 2022 Q39 raw and 2023 Q31 raw
  const cases = [
    { label: "2022 q39 raw content_hash=fb91da80acf9", ch: "fb91da80acf9" },
    { label: "2023 q31 raw content_hash=13acf46648bd", ch: "13acf46648bd" },
  ];
  for (const c of cases) {
    const { data: qs } = await supa.from("questions")
      .select("id, source, question_text")
      .like("content_hash", `${c.ch}%`);
    console.log(`\n${c.label}:`);
    for (const q of qs ?? []) {
      console.log(`  qid=${q.id} src="${q.source}"`);
      const { data: occs } = await supa.from("question_occurrences").select("id, exam_id, numero_na_prova, raw_question_id").eq("question_id", q.id);
      for (const o of occs ?? []) console.log(`    occ exam=${o.exam_id} num=${o.numero_na_prova} raw=${o.raw_question_id}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
