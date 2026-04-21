import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

const supa = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: exams } = await supa
    .from("exams").select("id, ano").eq("banca", "Fuvest").order("ano");
  if (!exams) throw new Error();
  for (const e of exams) {
    const { count: total } = await supa.from("question_raw").select("id", { count: "exact", head: true }).eq("exam_id", e.id);
    const { count: inserted } = await supa.from("question_raw").select("id", { count: "exact", head: true }).eq("exam_id", e.id).eq("status", "inserted");
    const { count: deduped } = await supa.from("question_raw").select("id", { count: "exact", head: true }).eq("exam_id", e.id).eq("status", "deduped");
    const { count: flagged } = await supa.from("question_raw").select("id", { count: "exact", head: true }).eq("exam_id", e.id).eq("status", "flagged");
    const { count: approved } = await supa.from("question_raw").select("id", { count: "exact", head: true }).eq("exam_id", e.id).eq("status", "approved");
    const { count: qnPrimary } = await supa.from("questions").select("id", { count: "exact", head: true }).eq("exam_id", e.id);
    const { count: qnOcc } = await supa.from("question_occurrences").select("id", { count: "exact", head: true }).eq("exam_id", e.id);
    const visible = (inserted ?? 0) + (deduped ?? 0);
    const missing = 90 - visible;
    console.log(
      `Fuvest ${e.ano}: raw=${total} (inserted=${inserted}, deduped=${deduped}, approved=${approved}, flagged=${flagged}) | questions(exam_id)=${qnPrimary} occurrences(exam_id)=${qnOcc} | visible=${visible}/90, missing=${missing}`,
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
