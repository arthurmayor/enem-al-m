import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
const supa = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
async function main() {
  const { data: exams } = await supa.from("exams").select("id, ano").eq("banca", "Fuvest").gte("ano", 2022).order("ano");
  let total = 0, mrTotal = 0, annulledTotal = 0;
  for (const e of exams ?? []) {
    const { data: raws } = await supa.from("question_raw")
      .select("numero, needs_manual_review, is_annulled, status")
      .eq("exam_id", e.id);
    const mr = (raws ?? []).filter((r) => r.needs_manual_review);
    const an = (raws ?? []).filter((r) => r.is_annulled);
    const mrNums = mr.map((r) => r.numero).sort((a, b) => a - b);
    const anNums = an.map((r) => r.numero).sort((a, b) => a - b);
    console.log(`${e.ano}: needs_manual_review=${mr.length} (${mrNums.join(",")}) is_annulled=${an.length} (${anNums.join(",")})`);
    total += (raws ?? []).length;
    mrTotal += mr.length;
    annulledTotal += an.length;
  }
  console.log(`\nTotal: ${total} rows; ${mrTotal} manual_review; ${annulledTotal} annulled`);
}
main().catch((e) => { console.error(e); process.exit(1); });
