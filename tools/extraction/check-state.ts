import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
import { analyzePageText } from "./extract-exam-local.js";

dns.setDefaultResultOrder("ipv4first");

const supa = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface QuestionRow {
  numero: number | null;
  question_text: string | null;
  options: unknown;
  shared_context: string | null;
}

function scanTextForIssues(q: QuestionRow): {
  pua: number;
  repl: number;
  exotic: number;
  ratio: number;
} {
  const parts: string[] = [];
  if (q.question_text) parts.push(q.question_text);
  if (q.shared_context) parts.push(q.shared_context);
  if (Array.isArray(q.options)) {
    for (const o of q.options) {
      if (o && typeof o === "object" && "text" in o) {
        const t = (o as { text: unknown }).text;
        if (typeof t === "string") parts.push(t);
      }
    }
  }
  const text = parts.join("\n");
  const a = analyzePageText(text);
  return {
    pua: a.puaCount,
    repl: a.replacementCount,
    exotic: a.exoticCount,
    ratio: a.problematicRatio,
  };
}

async function problemCharReport(examId: string): Promise<{
  dirty: number;
  worstNumeros: Array<{ numero: number; pua: number; repl: number; exotic: number }>;
}> {
  const { data: rows } = await supa
    .from("questions")
    .select("numero,question_text,options,shared_context")
    .eq("exam_id", examId)
    .order("numero")
    .limit(500);
  if (!rows) return { dirty: 0, worstNumeros: [] };
  let dirty = 0;
  const worst: Array<{
    numero: number;
    pua: number;
    repl: number;
    exotic: number;
    score: number;
  }> = [];
  for (const row of rows as QuestionRow[]) {
    const s = scanTextForIssues(row);
    const score = s.pua + s.repl + s.exotic;
    if (score > 0) {
      dirty++;
      if (row.numero != null) {
        worst.push({
          numero: row.numero,
          pua: s.pua,
          repl: s.repl,
          exotic: s.exotic,
          score,
        });
      }
    }
  }
  worst.sort((a, b) => b.score - a.score);
  return {
    dirty,
    worstNumeros: worst.slice(0, 5).map(({ score: _s, ...rest }) => rest),
  };
}

async function main() {
  const provas = [
    { banca: "Fuvest", ano: 2026, versao: "V1" },
    { banca: "Fuvest", ano: 2025, versao: "V" },
    { banca: "Fuvest", ano: 2024, versao: "V" },
    { banca: "Fuvest", ano: 2023, versao: "V" },
    { banca: "Fuvest", ano: 2022, versao: "V" },
  ];
  for (const p of provas) {
    const { data: e } = await supa
      .from("exams")
      .select("id,total_questions_detected")
      .eq("banca", p.banca)
      .eq("ano", p.ano)
      .eq("versao", p.versao)
      .maybeSingle();
    if (!e) { console.log(`${p.banca} ${p.ano} ${p.versao}: SEM EXAM`); continue; }
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

    const { dirty, worstNumeros } = await problemCharReport(e.id as string);
    const dirtyBit = dirty > 0
      ? ` | CHARS=${dirty}${worstNumeros.length ? " (worst: " + worstNumeros.map((w) => `q${w.numero}[pua=${w.pua},repl=${w.repl},ex=${w.exotic}]`).join(" ") + ")" : ""}`
      : " | CHARS=0";
    console.log(
      `${p.banca} ${p.ano} ${p.versao}: detected=${e.total_questions_detected} | raw=${raw} approved=${approved} flagged=${flagged} enriched=${enriched} | questions=${qn}${dirtyBit}`,
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
