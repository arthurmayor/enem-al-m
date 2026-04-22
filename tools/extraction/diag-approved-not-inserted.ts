/**
 * Diag: lists approved question_raw rows that are missing from
 * question_occurrences, and explains why the inserter skipped them.
 * Possible reasons: confidence_score < 0.8, unresolved blocker issue,
 * or missing enrichment row.
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
async function main() {
  const { data: exams } = await supa
    .from("exams").select("id, ano").eq("banca", "Fuvest").gte("ano", 2022).order("ano");
  if (!exams) throw new Error();
  for (const e of exams) {
    const { data: raw } = await supa.from("question_raw")
      .select("id, numero, status, confidence_score, enrichment, needs_manual_review")
      .eq("exam_id", e.id).eq("status", "approved");
    const { data: occ } = await supa.from("question_occurrences")
      .select("numero_na_prova").eq("exam_id", e.id);
    const occSet = new Set((occ ?? []).map((o) => o.numero_na_prova as number));
    const missing = (raw ?? []).filter((r) => !occSet.has(r.numero as number));
    if (missing.length === 0) continue;
    const ids = missing.map((m) => m.id as string);
    const { data: issues } = await supa.from("question_issues")
      .select("question_raw_id, issue_type, severity, resolved").in("question_raw_id", ids).eq("resolved", false);
    const byId = new Map<string, typeof issues>();
    for (const i of issues ?? []) {
      const arr = byId.get(i.question_raw_id as string) ?? [];
      arr.push(i);
      byId.set(i.question_raw_id as string, arr);
    }
    console.log(`\n--- ${e.ano} — ${missing.length} approved but not inserted ---`);
    for (const r of missing) {
      const iss = byId.get(r.id as string) ?? [];
      const hasBlocking = iss.some((x) => x.severity === "high" || x.severity === "critical" || ["contaminacao", "imagem_incorreta", "legenda_quebrada", "alternativas_incorretas", "gabarito_invalido", "duplicata_provavel"].includes(x.issue_type as string));
      console.log(`q${String(r.numero).padStart(2, "0")} conf=${r.confidence_score} enrich=${r.enrichment ? "Y" : "N"} mr=${r.needs_manual_review ? "Y" : "N"} blocking=${hasBlocking ? "Y" : "N"} issues=${iss.length}`);
      for (const i of iss.slice(0, 3)) console.log(`   ! ${i.issue_type}/${i.severity}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
