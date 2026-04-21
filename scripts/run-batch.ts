/**
 * Batch runner: processes multiple exam PDFs end-to-end by reusing the
 * existing extract-exam-local.ts pipeline as a subprocess per prova.
 *
 * Each iteration:
 *   1. Upserts an exams row (unique on banca, ano, fase, versao).
 *   2. Creates a seed extraction_jobs row carrying prova_storage_path
 *      and gabarito_storage_path — the main pipeline looks up the most
 *      recent seed to resolve the PDFs.
 *   3. Spawns `npx tsx scripts/extract-exam-local.ts <exam_id>` with
 *      inherited stdio so the operator sees every stage log live.
 *   4. On success or failure, records the per-prova result and continues
 *      to the next prova (a single failure never aborts the batch).
 *
 * At the end, prints a consolidated summary, e.g.:
 *   BATCH COMPLETO: 5 provas processadas, 4 sucesso, 1 erro
 *   ✓ Fuvest 2026 V1: 90/90 inseridas (742s)
 *   ✗ Fuvest 2021 V:  0/90 inseridas — erro: pipeline exit code 1 (31s)
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
 *     npx tsx scripts/run-batch.ts '[{"banca":"Fuvest","ano":2026,"fase":"1","versao":"V1","prova":"exam-files/fuvest-2026-fase1-V1-prova.pdf","gabarito":"exam-files/fuvest-2026-fase1-gabarito.pdf"}]'
 *   SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
 *     npx tsx scripts/run-batch.ts --file provas.json
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

dns.setDefaultResultOrder("ipv4first");

// Same env-var contract as extract-exam-local.ts: URL has a hardcoded
// default, but the service-role and Anthropic keys MUST come from the
// environment — we never commit credentials. The resolved values are
// forwarded to the spawned child process so it doesn't need its own
// setup when invoked via this batch runner.
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

// Same retry wrapper used in extract-exam-local.ts — transient DNS / socket
// failures are common on flaky networks and would otherwise abort the batch
// before a single prova runs.
const supabaseFetch: typeof fetch = async (input, init) => {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR|ETIMEDOUT|socket hang up|EAI_AGAIN/i.test(
          msg,
        )
      ) {
        const delay = 500 * Math.pow(2, attempt);
        console.warn(
          `[SUPABASE-FETCH] ${msg} — retry ${attempt + 1}/5 em ${delay}ms`,
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
  inserted: number;
  expected: number;
  rawQuestions: number;
  error?: string;
  elapsedSec: number;
}

function parseArgs(): ProvaInput[] {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error(
      "Uso: npx tsx scripts/run-batch.ts '<JSON array>'  |  --file <path>",
    );
    process.exit(1);
  }
  let raw: string;
  if (argv[0] === "--file") {
    if (!argv[1]) {
      console.error("--file precisa de um caminho para o arquivo JSON");
      process.exit(1);
    }
    raw = readFileSync(argv[1], "utf8");
  } else {
    raw = argv[0];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`JSON inválido: ${(err as Error).message}`);
    process.exit(1);
  }
  if (!Array.isArray(parsed)) {
    console.error("Entrada precisa ser um array JSON de provas");
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

async function upsertExam(p: ProvaInput): Promise<string> {
  const { data, error } = await supabase
    .from("exams")
    .upsert(
      {
        banca: p.banca,
        ano: p.ano,
        fase: p.fase,
        versao: p.versao,
      },
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

async function countQuestionsInserted(examId: string): Promise<number> {
  const { count, error } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);
  if (error) throw new Error(`count questions: ${error.message}`);
  return count ?? 0;
}

async function countQuestionRaw(examId: string): Promise<number> {
  const { count, error } = await supabase
    .from("question_raw")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);
  if (error) throw new Error(`count question_raw: ${error.message}`);
  return count ?? 0;
}

async function fetchExpectedTotal(examId: string): Promise<number> {
  const { data, error } = await supabase
    .from("exams")
    .select("total_questions_detected")
    .eq("id", examId)
    .single();
  if (error || !data) return 0;
  return (data.total_questions_detected as number | null) ?? 0;
}

function scriptDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function runPipeline(examId: string): Promise<{ exitCode: number }> {
  const extractPath = resolve(scriptDir(), "extract-exam-local.ts");
  return new Promise((resolvePromise) => {
    const child = spawn("npx", ["tsx", extractPath, examId], {
      stdio: "inherit",
      env: {
        ...process.env,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_ROLE_KEY!,
        ...(SUPABASE_ACCESS_TOKEN ? { SUPABASE_ACCESS_TOKEN } : {}),
        ANTHROPIC_API_KEY: ANTHROPIC_API_KEY!,
      },
    });
    child.on("close", (code) => {
      resolvePromise({ exitCode: code ?? 1 });
    });
    child.on("error", (err) => {
      console.error(`[BATCH] erro spawn: ${err.message}`);
      resolvePromise({ exitCode: 1 });
    });
  });
}

function formatProvaLabel(p: ProvaInput): string {
  return `${p.banca} ${p.ano} ${p.versao}`;
}

async function processOne(p: ProvaInput): Promise<ProvaResult> {
  const label = formatProvaLabel(p);
  console.log("\n=====================================================");
  console.log(`[BATCH] ▶ ${label}`);
  console.log(`[BATCH]   prova:    ${p.prova}`);
  console.log(`[BATCH]   gabarito: ${p.gabarito ?? "(nenhum)"}`);
  console.log("=====================================================\n");

  const started = Date.now();
  let examId: string | null = null;
  try {
    examId = await upsertExam(p);
    console.log(`[BATCH] exam_id=${examId}`);
    await createSeedJob(examId, p.prova, p.gabarito);
    const { exitCode } = await runPipeline(examId);
    const elapsedSec = (Date.now() - started) / 1000;
    const inserted = await countQuestionsInserted(examId);
    const rawQuestions = await countQuestionRaw(examId);
    const expected = await fetchExpectedTotal(examId);
    if (exitCode !== 0) {
      return {
        input: p,
        examId,
        ok: false,
        inserted,
        expected,
        rawQuestions,
        error: `pipeline exit code ${exitCode}`,
        elapsedSec,
      };
    }
    return {
      input: p,
      examId,
      ok: true,
      inserted,
      expected,
      rawQuestions,
      elapsedSec,
    };
  } catch (err) {
    const elapsedSec = (Date.now() - started) / 1000;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BATCH] ✖ ${label}: ${msg}`);
    return {
      input: p,
      examId,
      ok: false,
      inserted: 0,
      expected: 0,
      rawQuestions: 0,
      error: msg,
      elapsedSec,
    };
  }
}

async function main() {
  const provas = parseArgs();
  console.log(`[BATCH] ${provas.length} provas na fila`);
  for (const [i, p] of provas.entries()) {
    console.log(
      `  ${i + 1}. ${formatProvaLabel(p)}  (${p.prova}${p.gabarito ? " + gabarito" : ""})`,
    );
  }

  const results: ProvaResult[] = [];
  for (const p of provas) {
    const r = await processOne(p);
    results.push(r);
  }

  const sucessos = results.filter((r) => r.ok).length;
  const erros = results.length - sucessos;
  console.log("\n=====================================================");
  console.log(
    `BATCH COMPLETO: ${results.length} provas processadas, ${sucessos} sucesso, ${erros} erro`,
  );
  console.log("=====================================================");
  for (const r of results) {
    const label = formatProvaLabel(r.input);
    const expectedPart = r.expected > 0 ? `/${r.expected}` : "";
    const timing = ` (${r.elapsedSec.toFixed(0)}s)`;
    if (r.ok) {
      console.log(`✓ ${label}: ${r.inserted}${expectedPart} inseridas${timing}`);
    } else {
      console.log(
        `✗ ${label}: ${r.inserted}${expectedPart} inseridas — erro: ${r.error}${timing}`,
      );
    }
  }

  process.exit(erros > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
