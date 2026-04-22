import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const supa = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type ExamRow = { id: string; ano: number; versao: string };
type RawRow = {
  id: string;
  exam_id: string;
  numero: number;
  status: string | null;
  stem: string | null;
  options: unknown;
  correct_answer: string | null;
  shared_context: string | null;
  enrichment: unknown;
};
type IssueRow = {
  question_raw_id: string;
  issue_type: string;
  severity: string | null;
  agent: string | null;
  resolved: boolean;
};
type QuestionRow = { raw_question_id: string | null };

async function main() {
  console.log("=".repeat(70));
  console.log("SUPER DIAGNÓSTICO — Fuvest 2022/2023/2024/2026");
  console.log("=".repeat(70));

  // Fetch all Fuvest exams
  const { data: exams, error: examsErr } = await supa
    .from("exams")
    .select("id,ano,versao")
    .eq("banca", "Fuvest")
    .order("ano", { ascending: true });
  if (examsErr) throw examsErr;
  const examList = (exams ?? []) as ExamRow[];
  const examIds = examList.map((e) => e.id);
  const examById = new Map(examList.map((e) => [e.id, e]));

  // Fetch all question_raw for these exams
  const { data: rawRows, error: rawErr } = await supa
    .from("question_raw")
    .select("id,exam_id,numero,status,stem,options,correct_answer,shared_context,enrichment")
    .in("exam_id", examIds);
  if (rawErr) throw rawErr;
  const raws = (rawRows ?? []) as RawRow[];
  const rawById = new Map(raws.map((r) => [r.id, r]));
  const rawIds = raws.map((r) => r.id);

  // Fetch all issues for these raws
  let issues: IssueRow[] = [];
  const CHUNK = 80;
  for (let i = 0; i < rawIds.length; i += CHUNK) {
    const slice = rawIds.slice(i, i + CHUNK);
    const { data, error } = await supa
      .from("question_issues")
      .select("question_raw_id,issue_type,severity,agent,resolved")
      .in("question_raw_id", slice);
    if (error) throw error;
    issues.push(...((data ?? []) as IssueRow[]));
  }

  // Fetch all questions (promoted) pointing at these raws
  let promoted: QuestionRow[] = [];
  for (let i = 0; i < rawIds.length; i += CHUNK) {
    const slice = rawIds.slice(i, i + CHUNK);
    const { data, error } = await supa
      .from("questions")
      .select("raw_question_id")
      .in("raw_question_id", slice);
    if (error) throw error;
    promoted.push(...((data ?? []) as QuestionRow[]));
  }
  const promotedRawIds = new Set(
    promoted.map((p) => p.raw_question_id).filter((x): x is string => !!x),
  );

  // --- 1. Status geral por prova ---
  console.log("\n[1] STATUS GERAL POR PROVA");
  console.log("-".repeat(70));
  const statusByExam = new Map<
    string,
    { total: number; byStatus: Map<string, number>; promoted: number }
  >();
  for (const e of examList) {
    statusByExam.set(e.id, { total: 0, byStatus: new Map(), promoted: 0 });
  }
  for (const r of raws) {
    const s = statusByExam.get(r.exam_id)!;
    s.total += 1;
    const k = r.status ?? "null";
    s.byStatus.set(k, (s.byStatus.get(k) ?? 0) + 1);
    if (promotedRawIds.has(r.id)) s.promoted += 1;
  }
  console.log(
    "ano-versao | total | promoted(questions) | raw | reviewed | validated | approved | flagged | other",
  );
  for (const e of examList) {
    const s = statusByExam.get(e.id)!;
    const bs = s.byStatus;
    const known = ["raw", "reviewed", "validated", "approved", "flagged"];
    const other = [...bs.entries()]
      .filter(([k]) => !known.includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .join(",") || "-";
    console.log(
      `${e.ano} ${e.versao} | ${s.total} | ${s.promoted} | ` +
        `${bs.get("raw") ?? 0} | ${bs.get("reviewed") ?? 0} | ` +
        `${bs.get("validated") ?? 0} | ${bs.get("approved") ?? 0} | ` +
        `${bs.get("flagged") ?? 0} | ${other}`,
    );
  }

  // --- 2. Issues agregadas por (ano, type, severity, agent) ---
  console.log("\n[2] ISSUES AGREGADAS (unresolved) POR PROVA / TYPE / SEVERITY / AGENT");
  console.log("-".repeat(70));
  const agg = new Map<string, number>();
  for (const i of issues) {
    if (i.resolved) continue;
    const r = rawById.get(i.question_raw_id);
    if (!r) continue;
    const e = examById.get(r.exam_id)!;
    const key = `${e.ano}|${i.issue_type}|${i.severity ?? "-"}|${i.agent ?? "-"}`;
    agg.set(key, (agg.get(key) ?? 0) + 1);
  }
  const aggSorted = [...agg.entries()].sort((a, b) => b[1] - a[1]);
  console.log("ano | issue_type | severity | agent | count");
  for (const [k, v] of aggSorted) {
    console.log(`${k.replaceAll("|", " | ")} | ${v}`);
  }

  // --- 3. Top cross-prova issues ---
  console.log("\n[3] TOP ISSUES CROSS-PROVA (unresolved)");
  console.log("-".repeat(70));
  const cross = new Map<string, { cnt: number; anos: Set<number> }>();
  for (const i of issues) {
    if (i.resolved) continue;
    const r = rawById.get(i.question_raw_id);
    if (!r) continue;
    const e = examById.get(r.exam_id)!;
    const key = `${i.issue_type}|${i.severity ?? "-"}|${i.agent ?? "-"}`;
    const cur = cross.get(key) ?? { cnt: 0, anos: new Set<number>() };
    cur.cnt += 1;
    cur.anos.add(e.ano);
    cross.set(key, cur);
  }
  const crossSorted = [...cross.entries()].sort((a, b) => b[1].cnt - a[1].cnt);
  console.log("issue_type | severity | agent | cnt | provas_afetadas | anos");
  for (const [k, v] of crossSorted.slice(0, 15)) {
    const anos = [...v.anos].sort().join(",");
    console.log(`${k.replaceAll("|", " | ")} | ${v.cnt} | ${v.anos.size} | [${anos}]`);
  }

  // --- 4. correct_answer com parênteses? ---
  console.log("\n[4] correct_answer — formato (parênteses vs sem vs nulo)");
  console.log("-".repeat(70));
  console.log("ano-versao | com_parens | sem_parens | sem_gabarito | amostras_com_parens");
  for (const e of examList) {
    const mine = raws.filter((r) => r.exam_id === e.id);
    const comP = mine.filter(
      (r) => r.correct_answer && /\(.*\)/.test(r.correct_answer),
    );
    const semP = mine.filter(
      (r) => r.correct_answer && !/\(.*\)/.test(r.correct_answer),
    );
    const semG = mine.filter((r) => r.correct_answer === null);
    const sample = comP.slice(0, 3).map((r) => `${r.numero}:"${r.correct_answer}"`).join(" ");
    console.log(
      `${e.ano} ${e.versao} | ${comP.length} | ${semP.length} | ${semG.length} | ${sample || "-"}`,
    );
  }

  // --- 5. shared_context ---
  console.log("\n[5] shared_context — presença por prova");
  console.log("-".repeat(70));
  console.log("ano-versao | com_sc | sem_sc | total");
  for (const e of examList) {
    const mine = raws.filter((r) => r.exam_id === e.id);
    const comSc = mine.filter((r) => r.shared_context && r.shared_context.trim().length > 0).length;
    console.log(`${e.ano} ${e.versao} | ${comSc} | ${mine.length - comSc} | ${mine.length}`);
  }

  // --- 6. stem curto (<40 chars) ---
  console.log("\n[6] STEM CURTO (<40 chars) — possível truncamento");
  console.log("-".repeat(70));
  const shorts = raws
    .filter((r) => (r.stem?.length ?? 0) < 40)
    .sort((a, b) => {
      const ea = examById.get(a.exam_id)!;
      const eb = examById.get(b.exam_id)!;
      return ea.ano - eb.ano || a.numero - b.numero;
    });
  if (shorts.length === 0) console.log("(nenhum)");
  else {
    console.log("ano | numero | stem_len | stem_preview");
    for (const r of shorts) {
      const e = examById.get(r.exam_id)!;
      const preview = (r.stem ?? "").slice(0, 80).replace(/\s+/g, " ");
      console.log(`${e.ano} | ${r.numero} | ${r.stem?.length ?? 0} | ${preview}`);
    }
  }

  // --- 7. options inválidas (não-array ou tamanho != 5) ---
  console.log("\n[7] OPTIONS INVÁLIDAS (não-array ou length != 5)");
  console.log("-".repeat(70));
  const bad = raws
    .filter((r) => {
      const o = r.options;
      if (!Array.isArray(o)) return true;
      return o.length !== 5;
    })
    .sort((a, b) => {
      const ea = examById.get(a.exam_id)!;
      const eb = examById.get(b.exam_id)!;
      return ea.ano - eb.ano || a.numero - b.numero;
    });
  if (bad.length === 0) console.log("(nenhum)");
  else {
    console.log("ano | numero | opt_type | opt_count");
    for (const r of bad) {
      const e = examById.get(r.exam_id)!;
      const t = Array.isArray(r.options)
        ? "array"
        : r.options === null
          ? "null"
          : typeof r.options;
      const n = Array.isArray(r.options) ? r.options.length : -1;
      console.log(`${e.ano} | ${r.numero} | ${t} | ${n}`);
    }
  }

  // --- 8. enrichment presença ---
  console.log("\n[8] ENRICHMENT — presença em approved/flagged/validated/reviewed");
  console.log("-".repeat(70));
  console.log("ano-versao | status | com_enrichment | sem_enrichment | total");
  for (const e of examList) {
    const mine = raws.filter((r) => r.exam_id === e.id);
    for (const st of ["raw", "reviewed", "validated", "approved", "flagged"]) {
      const sub = mine.filter((r) => r.status === st);
      if (sub.length === 0) continue;
      const com = sub.filter((r) => r.enrichment !== null && r.enrichment !== undefined).length;
      console.log(`${e.ano} ${e.versao} | ${st} | ${com} | ${sub.length - com} | ${sub.length}`);
    }
  }

  // --- 9. Cruzamento: approved mas NÃO promoted ---
  console.log("\n[9] APPROVED MAS NÃO PROMOTED → motivo provável (issues bloqueantes / confidence / ...)");
  console.log("-".repeat(70));
  const blockingTypes = new Set([
    "contaminacao",
    "imagem_incorreta",
    "legenda_quebrada",
    "alternativas_incorretas",
    "gabarito_invalido",
    "duplicata_provavel",
  ]);
  const issuesByRaw = new Map<string, IssueRow[]>();
  for (const i of issues) {
    if (i.resolved) continue;
    const list = issuesByRaw.get(i.question_raw_id) ?? [];
    list.push(i);
    issuesByRaw.set(i.question_raw_id, list);
  }
  console.log("ano | numero | status | promoted? | blocking_issues");
  for (const e of examList) {
    const mine = raws.filter((r) => r.exam_id === e.id && r.status === "approved");
    const blocked = mine.filter((r) => !promotedRawIds.has(r.id));
    for (const r of blocked) {
      const myIssues = issuesByRaw.get(r.id) ?? [];
      const blocks = myIssues.filter(
        (i) => blockingTypes.has(i.issue_type) || i.severity === "high" || i.severity === "critical",
      );
      const summary = blocks.length
        ? blocks.map((b) => `${b.issue_type}/${b.severity ?? "-"}/${b.agent ?? "-"}`).join(", ")
        : "(sem issue bloqueante — outro motivo)";
      console.log(`${e.ano} | ${r.numero} | approved | NO | ${summary}`);
    }
  }

  // --- 10. Contagem resumida final ---
  console.log("\n[10] RESUMO FINAL");
  console.log("-".repeat(70));
  console.log("ano-versao | detected(90) | raw_total | approved | flagged | promoted(questions)");
  for (const e of examList) {
    const s = statusByExam.get(e.id)!;
    const bs = s.byStatus;
    console.log(
      `${e.ano} ${e.versao} | 90 | ${s.total} | ${bs.get("approved") ?? 0} | ${bs.get("flagged") ?? 0} | ${s.promoted}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
