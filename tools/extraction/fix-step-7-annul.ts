/**
 * Passo 7 (Grupo D): mark questions annulled by the banca so they can
 * be inserted despite correct_answer='*'. For each target row:
 *   - Set question_raw.is_annulled=true
 *   - Resolve the gabarito_invalido issue with "questão anulada pela banca"
 *   - Flip status → approved
 * Then let the inserter pick them up.
 */
import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
async function supabaseFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try { return await fetch(input, init); } catch (err) {
      lastErr = err;
      let msg = err instanceof Error ? err.message : String(err);
      let c: unknown = err;
      while (c && typeof c === "object" && "cause" in c) {
        c = (c as { cause?: unknown }).cause;
        if (c instanceof Error) msg += ` | ${c.message}`;
      }
      if (!/DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR/i.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, Math.min(attempt, 5))));
    }
  }
  throw lastErr;
}
const supa = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: supabaseFetch as typeof fetch } },
);

const TARGETS: Array<{ examId: string; numero: number; label: string }> = [
  { examId: "86dbad16-ad82-429f-8afb-dda157f53f6a", numero: 54, label: "2022 q54" },
  { examId: "c1052355-022c-464a-acd6-f94350eebaab", numero: 48, label: "2024 q48" },
  { examId: "7ecbc8b9-e937-4845-81b5-899b2d581215", numero: 3, label: "2026 q03" },
];

async function main() {
  for (const t of TARGETS) {
    const { data: row } = await supa.from("question_raw")
      .select("id, status, correct_answer")
      .eq("exam_id", t.examId).eq("numero", t.numero).maybeSingle();
    if (!row) { console.log(`${t.label}: raw not found`); continue; }
    console.log(`${t.label}: raw=${row.id} status=${row.status} ca=${row.correct_answer}`);
    const { error: upErr } = await supa.from("question_raw")
      .update({ is_annulled: true, status: "approved", needs_manual_review: true })
      .eq("id", row.id);
    if (upErr) throw new Error(`${t.label} update: ${upErr.message}`);
    const { error: issErr } = await supa.from("question_issues")
      .update({ resolved: true, resolution: "questão anulada pela banca (correct_answer='*' é esperado)" })
      .eq("question_raw_id", row.id)
      .eq("issue_type", "gabarito_invalido")
      .eq("resolved", false);
    if (issErr) throw new Error(`${t.label} issue: ${issErr.message}`);
    console.log(`  marked is_annulled=true, status=approved, resolved gabarito_invalido`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
