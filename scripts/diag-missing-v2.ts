/**
 * v2: classifies missing questions by measuring what the STUDENT sees —
 * i.e. rows whose numero is NOT present in question_occurrences for the
 * given prova. For each missing numero shows the question_raw row, its
 * current status, and the unresolved issues so we can decide the cheapest
 * fix path.
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
    .from("exams").select("id, ano, versao").eq("banca", "Fuvest").gte("ano", 2022).order("ano");
  if (!exams) throw new Error();
  let grandTotal = 0;
  for (const e of exams) {
    const examId = e.id as string;
    const { data: rawRows } = await supa
      .from("question_raw").select("id, numero, status, stem, options, correct_answer, shared_context, needs_manual_review, question_type")
      .eq("exam_id", examId).order("numero");
    const { data: occRows } = await supa
      .from("question_occurrences").select("numero_na_prova").eq("exam_id", examId);
    const occNumeros = new Set<number>((occRows ?? []).map((o) => o.numero_na_prova as number));

    const missing = (rawRows ?? []).filter((r) => !occNumeros.has(r.numero as number));
    console.log(`\n--- Fuvest ${e.ano} ${e.versao} — ${missing.length} faltando do ponto de vista do aluno ---`);
    grandTotal += missing.length;
    if (missing.length === 0) continue;

    const ids = missing.map((m) => m.id as string);
    const issues: Array<{ question_raw_id: string; issue_type: string; severity: string; description: string }> = [];
    const CHUNK = 60;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data } = await supa.from("question_issues")
        .select("question_raw_id, issue_type, severity, description")
        .in("question_raw_id", slice).eq("resolved", false);
      issues.push(...(data ?? []));
    }
    const byRaw = new Map<string, typeof issues>();
    for (const i of issues) {
      const arr = byRaw.get(i.question_raw_id) ?? [];
      arr.push(i);
      byRaw.set(i.question_raw_id, arr);
    }

    for (const r of missing) {
      const rowIssues = byRaw.get(r.id as string) ?? [];
      const opts = Array.isArray(r.options) ? (r.options as unknown[]).length : -1;
      const stemLen = (r.stem as string | null)?.length ?? 0;
      const optsShape = Array.isArray(r.options)
        ? ((r.options as Array<{ text?: string }>).map((o) => (o.text ?? "").length).join(","))
        : "?";
      console.log(
        `q${String(r.numero).padStart(2, "0")} [${r.status}] stem=${stemLen} opts=${opts} opt_lens=${optsShape} ca=${r.correct_answer ?? "?"} qt=${(r.question_type ?? "?").slice(0, 20)} sc=${r.shared_context ? "sim" : "não"} mr=${r.needs_manual_review ? "Y" : "N"}`,
      );
      if (rowIssues.length) {
        for (const i of rowIssues.slice(0, 5)) {
          console.log(`   ! ${i.issue_type}/${i.severity}: ${(i.description ?? "").slice(0, 150)}`);
        }
      } else {
        console.log(`   (sem issues unresolved — FALSO POSITIVO do reviewer / candidato a approved)`);
      }
    }
  }
  console.log(`\n=== GRAND TOTAL MISSING: ${grandTotal} ===\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
