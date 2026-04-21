import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
const supa = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
async function main() {
  // 2022
  const eid = "86dbad16-ad82-429f-8afb-dda157f53f6a";
  for (const n of [35, 39]) {
    const { data: occs } = await supa.from("question_occurrences")
      .select("id, numero_na_prova, question_id, raw_question_id, source, created_at")
      .eq("exam_id", eid).eq("numero_na_prova", n);
    console.log(`2022 numero=${n} occurrences (${(occs ?? []).length}):`);
    for (const o of occs ?? []) {
      const { data: q } = await supa.from("questions")
        .select("id, source, question_text").eq("id", o.question_id).maybeSingle();
      console.log(`  occ=${o.id} qid=${o.question_id} src="${o.source}" raw=${o.raw_question_id}`);
      if (q) console.log(`    question.source="${q.source}" stem="${(q.question_text as string).slice(0, 70)}..."`);
    }
  }
  console.log("\n--- 2023 ---");
  const eid2 = "8e257562-730b-4580-8ea0-90a3fc88cabc";
  for (const n of [29, 31]) {
    const { data: occs } = await supa.from("question_occurrences")
      .select("id, numero_na_prova, question_id, raw_question_id, source, created_at")
      .eq("exam_id", eid2).eq("numero_na_prova", n);
    console.log(`2023 numero=${n} occurrences (${(occs ?? []).length}):`);
    for (const o of occs ?? []) {
      const { data: q } = await supa.from("questions")
        .select("id, source, question_text").eq("id", o.question_id).maybeSingle();
      console.log(`  occ=${o.id} qid=${o.question_id} src="${o.source}" raw=${o.raw_question_id}`);
      if (q) console.log(`    question.source="${q.source}" stem="${(q.question_text as string).slice(0, 70)}..."`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
