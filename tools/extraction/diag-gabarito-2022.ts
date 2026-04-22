import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

async function supabaseFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      let msg = err instanceof Error ? err.message : String(err);
      let cause: unknown = err;
      while (cause && typeof cause === "object" && "cause" in cause) {
        cause = (cause as { cause?: unknown }).cause;
        if (cause instanceof Error) msg += ` | cause: ${cause.message}`;
      }
      if (!/DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR/i.test(msg)) throw err;
      const d = 500 * Math.pow(2, Math.min(attempt, 5));
      console.warn(`[SUPA-FETCH] ${msg} — retry in ${d}ms`);
      await new Promise((r) => setTimeout(r, d));
    }
  }
  throw lastErr;
}

const supa = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: supabaseFetch as typeof fetch } },
);

async function withRetry<T>(
  label: string,
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await fn();
    if (!error) {
      if (data === null) throw new Error(`${label}: data is null`);
      return data;
    }
    if (!/DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR|timeout/i.test(error.message)) {
      throw new Error(`${label}: ${error.message}`);
    }
    const d = 500 * Math.pow(2, Math.min(attempt, 5));
    console.warn(`[RETRY ${label}] ${error.message} — retry in ${d}ms`);
    await new Promise((r) => setTimeout(r, d));
  }
  throw new Error(`${label}: exceeded retries`);
}

async function main() {
  const examList = await withRetry<Array<{ id: string; ano: number; versao: string; banca: string }>>(
    "list exams",
    () => supa.from("exams").select("id,ano,versao,banca").eq("banca", "Fuvest"),
  );
  console.log("Fuvest exams found:", examList);
  const exam = examList.find((e) => e.ano === 2022);
  if (!exam) throw new Error("exam 2022 not found");

  // Load all questions 70-90 and issues
  const raws = await withRetry<Array<{
    id: string; numero: number; stem: string | null; options: unknown;
    correct_answer: string | null; status: string | null; confidence_score: number | null;
  }>>(
    "raws 70-90",
    () => supa
      .from("question_raw")
      .select("id,numero,stem,options,correct_answer,status,confidence_score")
      .eq("exam_id", exam.id)
      .gte("numero", 70)
      .lte("numero", 90)
      .order("numero", { ascending: true }),
  );

  const rawIds = raws.map((r) => r.id);
  const issues: Array<{
    question_raw_id: string; issue_type: string; severity: string;
    description: string | null; agent: string | null; resolved: boolean;
  }> = [];
  for (let i = 0; i < rawIds.length; i += 50) {
    const slice = rawIds.slice(i, i + 50);
    const part = await withRetry<typeof issues>(
      `issues ${i}-${i + slice.length}`,
      () => supa
        .from("question_issues")
        .select("question_raw_id,issue_type,severity,description,agent,resolved")
        .in("question_raw_id", slice),
    );
    issues.push(...part);
  }

  const issuesByRaw = new Map<string, typeof issues>();
  for (const i of issues) {
    const list = issuesByRaw.get(i.question_raw_id) ?? [];
    list.push(i);
    issuesByRaw.set(i.question_raw_id, list);
  }

  console.log("=".repeat(70));
  console.log("FUVEST 2022 — Questões 70-90 (gabarito + issues)");
  console.log("=".repeat(70));

  for (const r of raws) {
    const opts = Array.isArray(r.options) ? (r.options as Array<{ label: string; text: string }>) : [];
    const labels = opts.map((o) => o.label).join(",");
    const myIssues = issuesByRaw.get(r.id) ?? [];
    const issueSummary = myIssues
      .filter((i) => !i.resolved)
      .map((i) => `${i.issue_type}/${i.severity}`)
      .join(", ");
    console.log(
      `\n#${r.numero} | status=${r.status} | conf=${r.confidence_score} | ans='${r.correct_answer}' | labels=[${labels}]`,
    );
    if (issueSummary) console.log(`   issues: ${issueSummary}`);
    for (const i of myIssues) {
      if (!i.resolved && i.issue_type === "gabarito_invalido") {
        console.log(`   → ${i.description} (agent=${i.agent})`);
      }
    }
    // Show first 2 options to compare labels
    for (const o of opts.slice(0, 2)) {
      const text = (o.text ?? "").slice(0, 60).replace(/\s+/g, " ");
      console.log(`   opt[${o.label}]: ${text}`);
    }
  }

  console.log("\n\n--- GABARITO HISTÓRICO (answers object via extraction_jobs) ---");
  const jobs = await withRetry<Array<{ id: string; created_at: string; stages_log: unknown }>>(
    "jobs",
    () => supa
      .from("extraction_jobs")
      .select("id,created_at,stages_log")
      .eq("exam_id", exam.id)
      .order("created_at", { ascending: false })
      .limit(3),
  );
  for (const j of jobs) {
    const log = (j.stages_log ?? []) as Array<{ stage: string; detail?: unknown }>;
    const gab = log.find((s) => s.stage === "linking_gabarito");
    console.log(`job ${j.id} created=${j.created_at}`);
    if (gab) {
      const d = gab.detail as { gabarito?: { answers?: Record<string, string>; annulled?: number[]; total_questions?: number } } | null;
      const ans = d?.gabarito?.answers ?? {};
      const interesting: Array<[number, string]> = [];
      for (let n = 70; n <= 90; n++) {
        if (ans[String(n)] !== undefined) interesting.push([n, ans[String(n)]]);
      }
      console.log(`  total=${d?.gabarito?.total_questions} annulled=${(d?.gabarito?.annulled ?? []).join(",")}`);
      console.log(`  answers[70..90]: ${interesting.map(([n, v]) => `${n}=${v}`).join(" ")}`);
    } else {
      console.log("  (no linking_gabarito stage in log)");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
