import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

async function supabaseFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try { return await fetch(input, init); }
    catch (err) {
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
    .from("exams")
    .select("id, ano, versao")
    .eq("banca", "Fuvest")
    .neq("ano", 2025)
    .order("ano", { ascending: true });
  if (!exams) throw new Error("no exams");

  const examById = new Map(exams.map((e) => [e.id as string, e]));

  const { data: raws } = await supa
    .from("question_raw")
    .select("id, exam_id, numero, status, stem, options, correct_answer, needs_manual_review, shared_context, question_type")
    .in("exam_id", exams.map((e) => e.id))
    .neq("status", "inserted")
    .order("numero", { ascending: true });
  if (!raws) throw new Error("no raws");

  const rawIds = raws.map((r) => r.id as string);
  const CHUNK = 60;
  const issues: Array<{ question_raw_id: string; issue_type: string; severity: string; description: string; resolved: boolean }> = [];
  for (let i = 0; i < rawIds.length; i += CHUNK) {
    const slice = rawIds.slice(i, i + CHUNK);
    const { data } = await supa
      .from("question_issues")
      .select("question_raw_id, issue_type, severity, description, resolved")
      .in("question_raw_id", slice)
      .eq("resolved", false);
    issues.push(...(data ?? []));
  }

  const issuesByRaw = new Map<string, typeof issues>();
  for (const i of issues) {
    const arr = issuesByRaw.get(i.question_raw_id) ?? [];
    arr.push(i);
    issuesByRaw.set(i.question_raw_id, arr);
  }

  type Row = typeof raws[number];
  const byAno = new Map<number, Row[]>();
  for (const r of raws) {
    const e = examById.get(r.exam_id as string)!;
    const arr = byAno.get(e.ano as number) ?? [];
    arr.push(r);
    byAno.set(e.ano as number, arr);
  }

  console.log(`\n=== MISSING QUESTIONS PER PROVA ===\n`);
  let total = 0;
  for (const ano of [...byAno.keys()].sort()) {
    const list = byAno.get(ano)!;
    console.log(`\n--- ${ano} V — ${list.length} faltando ---`);
    total += list.length;
    for (const r of list) {
      const rowIssues = issuesByRaw.get(r.id as string) ?? [];
      const blockers = rowIssues.filter(
        (i) =>
          i.severity === "high" ||
          i.severity === "critical" ||
          ["contaminacao", "alternativas_incorretas", "gabarito_invalido", "duplicata_provavel"].includes(
            i.issue_type,
          ),
      );
      const allTypes = rowIssues.map((i) => `${i.issue_type}/${i.severity}`).join(",");
      const opts = Array.isArray(r.options) ? (r.options as unknown[]).length : -1;
      const stemLen = (r.stem as string | null)?.length ?? 0;
      const hint = `stem=${stemLen} opts=${opts} ca=${r.correct_answer ?? "?"} qt=${(r.question_type ?? "?").slice(0, 8)} sc=${r.shared_context ? "sim" : "não"} mr=${r.needs_manual_review ? "Y" : "N"}`;
      console.log(`q${String(r.numero).padStart(2, "0")} [${r.status}] ${hint}`);
      if (blockers.length) {
        for (const b of blockers.slice(0, 4)) {
          console.log(`   ! ${b.issue_type}/${b.severity}: ${(b.description ?? "").slice(0, 180)}`);
        }
      } else {
        console.log(`   (sem blockers; types=${allTypes || "-"})`);
      }
    }
  }
  console.log(`\n=== TOTAL FALTANDO: ${total} ===\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
