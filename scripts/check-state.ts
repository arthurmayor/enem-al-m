import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const supa = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const provas = [
    { ano: 2026, versao: "V1" },
    { ano: 2024, versao: "V" },
    { ano: 2023, versao: "V" },
    { ano: 2022, versao: "V" },
  ];
  for (const p of provas) {
    const { data: e } = await supa
      .from("exams")
      .select("id,total_questions_detected")
      .eq("banca", "Fuvest")
      .eq("ano", p.ano)
      .eq("versao", p.versao)
      .maybeSingle();
    if (!e) { console.log(`${p.ano} ${p.versao}: SEM EXAM`); continue; }
    const { count: raw } = await supa
      .from("question_raw").select("id", { count: "exact", head: true }).eq("exam_id", e.id);
    const { count: approved } = await supa
      .from("question_raw").select("id", { count: "exact", head: true }).eq("exam_id", e.id).eq("status", "approved");
    const { count: flagged } = await supa
      .from("question_raw").select("id", { count: "exact", head: true }).eq("exam_id", e.id).eq("status", "flagged");
    const { count: enriched } = await supa
      .from("question_raw").select("id", { count: "exact", head: true }).eq("exam_id", e.id).not("enriched_json", "is", null);
    const { count: qn } = await supa
      .from("questions").select("id", { count: "exact", head: true }).eq("exam_id", e.id);
    console.log(
      `Fuvest ${p.ano} ${p.versao}: detected=${e.total_questions_detected} | raw=${raw} approved=${approved} flagged=${flagged} enriched=${enriched} | questions=${qn}`,
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
