/**
 * Universal end-to-end runner for a vestibular prova (any banca).
 *
 * One-shot mode:
 *   npx tsx tools/extraction/process-exam.ts \
 *     --banca Fuvest --ano 2026 --fase 1 --versao V1 \
 *     --prova exam-files/fuvest-2026-fase1-V1-prova.pdf \
 *     --gabarito exam-files/fuvest-2026-fase1-gabarito.pdf
 *
 * Batch mode (inline JSON array):
 *   npx tsx tools/extraction/process-exam.ts --batch '[{"banca":"Unicamp","ano":2025,"fase":"1","versao":"V","prova":"exam-files/unicamp-2025-fase1.pdf","gabarito":"exam-files/unicamp-2025-fase1-gabarito.pdf"}]'
 *
 * Batch mode (JSON file):
 *   npx tsx tools/extraction/process-exam.ts --batch-file provas.json
 *
 * For each prova the script:
 *   1. Upserts exams(banca, ano, fase, versao).
 *   2. Seeds an extraction_jobs row with prova/gabarito storage paths.
 *   3. Spawns extract-exam-local.ts to run the 11-agent pipeline
 *      (pre-parser → profiler → segmenter → assembler → gabarito-linker →
 *       reviewer → validator → asset-extractor → media-mapper → enricher →
 *       inserter) — including every fix carried in that file
 *      (stripRunningHeaders, propagateSharedContext, normalizeOptionLabels,
 *       postProcessAssembled, assembler retry, withSupaRetry, …).
 *   4. If the pipeline leaves any flagged rows, auto-recovers:
 *        recover-shared-context.ts → re-review-flagged.ts → run-inserter-only.ts
 *      (one pass; further manual intervention is flagged in the summary).
 *   5. Prints an overall coverage summary.
 *
 * Env vars required:
 *   SUPABASE_SERVICE_ROLE_KEY   write access to exams / extraction_jobs
 *   ANTHROPIC_API_KEY           forwarded to the spawned pipeline
 * Optional:
 *   SUPABASE_URL                defaults to the project's production URL
 *   SUPABASE_ACCESS_TOKEN       forwarded if set (some sub-scripts use it)
 *   SKIP_AUTO_RECOVERY=1        skip step 4 (useful for dry diagnostics)
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

dns.setDefaultResultOrder("ipv4first");

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SKIP_AUTO_RECOVERY = process.env.SKIP_AUTO_RECOVERY === "1";

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

// Same undici-aware retry shell used by extract-exam-local.ts. Walks err.cause
// so transient DNS / socket errors buried under "fetch failed" are retried.
const SUPABASE_FETCH_RETRIES = 24;
const SUPABASE_FETCH_MAX_DELAY_MS = 30_000;
const supabaseFetch: typeof fetch = async (input, init) => {
  const transient =
    /DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR|ETIMEDOUT|socket hang up|EAI_AGAIN|other side closed/i;
  const messages = (err: unknown): string => {
    const parts: string[] = [];
    let cur: unknown = err;
    for (let i = 0; i < 4 && cur; i++) {
      if (cur instanceof Error) {
        parts.push(cur.message);
        cur = (cur as Error & { cause?: unknown }).cause;
      } else {
        parts.push(String(cur));
        break;
      }
    }
    return parts.join(" | ");
  };
  let lastErr: unknown;
  for (let attempt = 0; attempt < SUPABASE_FETCH_RETRIES; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      const msg = messages(err);
      if (transient.test(msg)) {
        const delay = Math.min(500 * Math.pow(2, attempt), SUPABASE_FETCH_MAX_DELAY_MS);
        console.warn(
          `[SUPABASE-FETCH] ${msg} — retry ${attempt + 1}/${SUPABASE_FETCH_RETRIES} em ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
};

const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { global: { fetch: supabaseFetch } },
);

interface ProvaInput {
  banca: string;
  ano: number;
  fase: string;
  versao: string;
  prova: string;
  gabarito: string | null;
}

interface ProvaResult {
  input: ProvaInput;
  examId: string | null;
  ok: boolean;
  expected: number;
  rawQuestions: number;
  approved: number;
  flagged: number;
  questions: number;
  occurrences: number;
  manualReview: number;
  recoveredFlagged: number;
  error?: string;
  elapsedSec: number;
}

function printUsage(): void {
  console.error(
    [
      "Uso:",
      "  process-exam.ts --banca X --ano N --fase F --versao V --prova path [--gabarito path]",
      "  process-exam.ts --batch '<JSON array>'",
      "  process-exam.ts --batch-file <path>",
    ].join("\n"),
  );
}

function parseSingleFromFlags(argv: string[]): ProvaInput | null {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const name = a.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) {
      flags.set(name, "");
    } else {
      flags.set(name, val);
      i++;
    }
  }
  if (!flags.has("banca") && !flags.has("ano") && !flags.has("prova")) {
    return null;
  }
  const banca = flags.get("banca");
  const anoStr = flags.get("ano");
  const prova = flags.get("prova");
  if (!banca || !anoStr || !prova) {
    console.error("Modo single-prova exige --banca, --ano e --prova");
    process.exit(1);
  }
  const ano = Number(anoStr);
  if (!Number.isInteger(ano)) {
    console.error(`--ano inválido: ${anoStr}`);
    process.exit(1);
  }
  return {
    banca,
    ano,
    fase: flags.get("fase") || "1",
    versao: flags.get("versao") || "V1",
    prova,
    gabarito: flags.get("gabarito") || null,
  };
}

function parseBatchJson(raw: string): ProvaInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`JSON inválido: ${(err as Error).message}`);
    process.exit(1);
  }
  if (!Array.isArray(parsed)) {
    console.error("Batch precisa ser um array JSON de provas");
    process.exit(1);
  }
  const provas: ProvaInput[] = [];
  for (const [i, item] of parsed.entries()) {
    const o = item as Record<string, unknown>;
    if (
      typeof o?.banca !== "string" ||
      typeof o?.ano !== "number" ||
      typeof o?.prova !== "string"
    ) {
      console.error(
        `Item ${i}: campos 'banca' (string), 'ano' (int) e 'prova' (string) são obrigatórios`,
      );
      process.exit(1);
    }
    provas.push({
      banca: o.banca,
      ano: o.ano,
      fase: typeof o.fase === "string" && o.fase ? o.fase : "1",
      versao: typeof o.versao === "string" && o.versao ? o.versao : "V1",
      prova: o.prova,
      gabarito:
        typeof o.gabarito === "string" && o.gabarito ? o.gabarito : null,
    });
  }
  return provas;
}

function parseArgs(): ProvaInput[] {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    printUsage();
    process.exit(1);
  }
  const batchIdx = argv.indexOf("--batch");
  if (batchIdx >= 0) {
    const raw = argv[batchIdx + 1];
    if (!raw) {
      console.error("--batch precisa de um JSON array inline");
      process.exit(1);
    }
    return parseBatchJson(raw);
  }
  const batchFileIdx = argv.indexOf("--batch-file");
  if (batchFileIdx >= 0) {
    const path = argv[batchFileIdx + 1];
    if (!path) {
      console.error("--batch-file precisa de um caminho");
      process.exit(1);
    }
    return parseBatchJson(readFileSync(path, "utf8"));
  }
  const single = parseSingleFromFlags(argv);
  if (!single) {
    printUsage();
    process.exit(1);
  }
  return [single];
}

async function upsertExam(p: ProvaInput): Promise<string> {
  const { data, error } = await supabase
    .from("exams")
    .upsert(
      { banca: p.banca, ano: p.ano, fase: p.fase, versao: p.versao },
      { onConflict: "banca,ano,fase,versao" },
    )
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`upsert exams: ${error?.message ?? "sem dados"}`);
  }
  return data.id as string;
}

async function createSeedJob(
  examId: string,
  provaPath: string,
  gabaritoPath: string | null,
): Promise<string> {
  const { data, error } = await supabase
    .from("extraction_jobs")
    .insert({
      exam_id: examId,
      status: "seeded",
      current_stage: "seeded",
      prova_storage_path: provaPath,
      gabarito_storage_path: gabaritoPath,
      stages_log: [],
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`insert seed job: ${error?.message ?? "sem dados"}`);
  }
  return data.id as string;
}

function scriptDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function childEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_ROLE_KEY!,
    ...(SUPABASE_ACCESS_TOKEN ? { SUPABASE_ACCESS_TOKEN } : {}),
    ANTHROPIC_API_KEY: ANTHROPIC_API_KEY!,
  };
}

function spawnTsx(scriptName: string, args: string[]): Promise<number> {
  const target = resolve(scriptDir(), scriptName);
  return new Promise((resolvePromise) => {
    const child = spawn("npx", ["tsx", target, ...args], {
      stdio: "inherit",
      env: childEnv(),
    });
    child.on("close", (code) => resolvePromise(code ?? 1));
    child.on("error", (err) => {
      console.error(`[process-exam] spawn ${scriptName}: ${err.message}`);
      resolvePromise(1);
    });
  });
}

interface ExamCounts {
  rawQuestions: number;
  approved: number;
  flagged: number;
  questions: number;
  occurrences: number;
  manualReview: number;
  expected: number;
}

async function countColumn(
  table: string,
  filters: Array<[string, unknown]>,
): Promise<number> {
  let qb = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [col, val] of filters) {
    qb = qb.eq(col, val as never);
  }
  const { count, error } = await qb;
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function gatherCounts(examId: string): Promise<ExamCounts> {
  const rawQuestions = await countColumn("question_raw", [["exam_id", examId]]);
  const approved = await countColumn("question_raw", [
    ["exam_id", examId],
    ["status", "approved"],
  ]);
  const flagged = await countColumn("question_raw", [
    ["exam_id", examId],
    ["status", "flagged"],
  ]);
  const manualReview = await countColumn("question_raw", [
    ["exam_id", examId],
    ["needs_manual_review", true],
  ]);
  const questions = await countColumn("questions", [["exam_id", examId]]);
  const occurrences = await countColumn("question_occurrences", [
    ["exam_id", examId],
  ]);
  const { data: exam } = await supabase
    .from("exams")
    .select("total_questions_detected")
    .eq("id", examId)
    .maybeSingle();
  const expected =
    (exam?.total_questions_detected as number | null | undefined) ?? 0;
  return {
    rawQuestions,
    approved,
    flagged,
    questions,
    occurrences,
    manualReview,
    expected,
  };
}

function formatLabel(p: ProvaInput): string {
  return `${p.banca} ${p.ano} F${p.fase} ${p.versao}`;
}

async function autoRecover(examId: string, counts: ExamCounts): Promise<void> {
  if (SKIP_AUTO_RECOVERY) {
    console.log("[process-exam] SKIP_AUTO_RECOVERY=1 — pulando etapa 4");
    return;
  }
  if (counts.flagged === 0) {
    console.log("[process-exam] sem flagged — recuperação não necessária");
    return;
  }
  console.log(
    `[process-exam] ${counts.flagged} flagged — iniciando recuperação automática`,
  );

  const r1 = await spawnTsx("recover-shared-context.ts", [examId]);
  if (r1 !== 0) {
    console.warn(`[process-exam] recover-shared-context saiu com code=${r1}`);
  }
  const r2 = await spawnTsx("re-review-flagged.ts", [examId]);
  if (r2 !== 0) {
    console.warn(`[process-exam] re-review-flagged saiu com code=${r2}`);
  }
  const r3 = await spawnTsx("run-inserter-only.ts", [examId]);
  if (r3 !== 0) {
    console.warn(`[process-exam] run-inserter-only saiu com code=${r3}`);
  }
}

async function processOne(p: ProvaInput): Promise<ProvaResult> {
  const label = formatLabel(p);
  console.log("\n=====================================================");
  console.log(`[process-exam] ▶ ${label}`);
  console.log(`[process-exam]   prova:    ${p.prova}`);
  console.log(`[process-exam]   gabarito: ${p.gabarito ?? "(nenhum)"}`);
  console.log("=====================================================\n");

  const started = Date.now();
  let examId: string | null = null;

  try {
    examId = await upsertExam(p);
    console.log(`[process-exam] exam_id=${examId}`);
    await createSeedJob(examId, p.prova, p.gabarito);

    const pipelineCode = await spawnTsx("extract-exam-local.ts", [examId]);
    const before = await gatherCounts(examId);
    const flaggedBefore = before.flagged;

    await autoRecover(examId, before);

    const after = await gatherCounts(examId);
    const elapsedSec = (Date.now() - started) / 1000;

    const ok = pipelineCode === 0 && after.flagged === 0;
    return {
      input: p,
      examId,
      ok,
      expected: after.expected,
      rawQuestions: after.rawQuestions,
      approved: after.approved,
      flagged: after.flagged,
      questions: after.questions,
      occurrences: after.occurrences,
      manualReview: after.manualReview,
      recoveredFlagged: Math.max(0, flaggedBefore - after.flagged),
      error: ok ? undefined : `pipeline=${pipelineCode}, flagged=${after.flagged}`,
      elapsedSec,
    };
  } catch (err) {
    const elapsedSec = (Date.now() - started) / 1000;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[process-exam] ✖ ${label}: ${msg}`);
    return {
      input: p,
      examId,
      ok: false,
      expected: 0,
      rawQuestions: 0,
      approved: 0,
      flagged: 0,
      questions: 0,
      occurrences: 0,
      manualReview: 0,
      recoveredFlagged: 0,
      error: msg,
      elapsedSec,
    };
  }
}

function printSummary(results: ProvaResult[]): void {
  const sucessos = results.filter((r) => r.ok).length;
  const erros = results.length - sucessos;
  console.log("\n=====================================================");
  console.log(
    `PROCESS-EXAM COMPLETO: ${results.length} provas, ${sucessos} ok, ${erros} com pendência`,
  );
  console.log("=====================================================");
  for (const r of results) {
    const label = formatLabel(r.input);
    const expected = r.expected > 0 ? `/${r.expected}` : "";
    const mr = r.manualReview > 0 ? ` (${r.manualReview} manual review)` : "";
    const timing = ` [${r.elapsedSec.toFixed(0)}s]`;
    if (r.ok) {
      console.log(
        `✓ ${label}: ${r.occurrences}${expected} occ · ${r.questions} questions${mr}${timing}`,
      );
    } else {
      console.log(
        `✗ ${label}: ${r.occurrences}${expected} occ · flagged=${r.flagged} · ${r.error}${timing}`,
      );
    }
  }
  console.log(
    "\nCheck-state detalhado: npx tsx tools/extraction/check-state.ts (ajuste banca/ano se preciso)",
  );
}

async function main() {
  const provas = parseArgs();
  console.log(`[process-exam] ${provas.length} prova(s) na fila`);
  for (const [i, p] of provas.entries()) {
    console.log(
      `  ${i + 1}. ${formatLabel(p)}  (${p.prova}${p.gabarito ? " + gabarito" : ""})`,
    );
  }

  const results: ProvaResult[] = [];
  for (const p of provas) {
    const r = await processOne(p);
    results.push(r);
  }

  printSummary(results);
  const erros = results.filter((r) => !r.ok).length;
  process.exit(erros > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
