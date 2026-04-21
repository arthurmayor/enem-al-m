/**
 * Local runner for the exam-extraction pipeline.
 *
 * Runs pre-parser → profiler → segmenter → assembler → gabarito-linker
 * in a single long-lived Node process, bypassing the Supabase Edge
 * Function wall-time limits that make the equivalent deployed pipeline
 * impractical.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/extract-exam-local.ts <exam_id>
 */

import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy, getResolvedPDFJS } from "unpdf";
import { PNG } from "pngjs";

// ───────────────────── config ─────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const MODEL_SONNET = "claude-sonnet-4-20250514";
const MODEL_HAIKU = "claude-haiku-4-5-20251001";

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ───────────────────── shared types ─────────────────────
interface ParsedPage {
  page_number: number;
  text: string;
}

interface ProfileResult {
  banca?: string;
  ano?: number;
  versao?: string;
  language?: string;
  source_type?: string;
  question_numbering_pattern?: string;
  option_label_pattern?: string;
  objective_question_count?: number;
  has_shared_context?: boolean;
  shared_context_groups?: number[][];
  has_note_e_adote?: boolean;
  note_e_adote_questions?: number[];
  has_images?: boolean;
  questions_with_images?: number[];
  mixed_with_discursive?: boolean;
  column_layout?: string;
  structural_risks?: string[];
  recommended_strategy?: string;
  [k: string]: unknown;
}

interface SegmenterBlock {
  block_id: string;
  type: string;
  question_hint: number | null;
  page: number | null;
  line_start: number | null;
  line_end: number | null;
  label: string | null;
  flagged?: boolean;
}
interface Block extends SegmenterBlock {
  text: string;
}

interface AssembledOption {
  label: string;
  text: string;
  media_ref: string | null;
}
interface AssembledQuestion {
  numero: number;
  question_type: string;
  shared_context: string | null;
  stem: string;
  options: AssembledOption[];
  note_e_adote: string | null;
  media_refs: unknown[];
  source_pages: number[];
  confidence: number;
  flagged?: boolean;
}

interface GabaritoResult {
  version_detected?: string;
  total_questions?: number;
  answers?: Record<string, string>;
  annulled?: number[];
  format_notes?: string;
}

// ───────────────────── anthropic tool-use wrapper ─────────────────────
async function callTool<T>(opts: {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
}): Promise<{ input: T; stopReason: string | null }> {
  const res = await anthropic.messages.create({
    model: opts.model ?? MODEL_SONNET,
    max_tokens: opts.maxTokens,
    system: opts.system,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input_schema: opts.schema as any,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
    messages: [{ role: "user", content: opts.user }],
  });

  const block = res.content.find((b) => b.type === "tool_use" && b.name === opts.toolName);
  if (!block || block.type !== "tool_use") {
    throw new Error(`Tool call de ${opts.toolName} ausente (stop=${res.stop_reason})`);
  }
  return { input: block.input as T, stopReason: res.stop_reason };
}

// ───────────────────── helpers ─────────────────────
function splitStoragePath(p: string): { bucket: string; path: string } {
  const t = p.replace(/^\/+/, "");
  const i = t.indexOf("/");
  if (i === -1) return { bucket: "exam-files", path: t };
  return { bucket: t.slice(0, i), path: t.slice(i + 1) };
}

async function downloadPdf(storagePath: string): Promise<Uint8Array> {
  const { bucket, path } = splitStoragePath(storagePath);
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Falha ao baixar PDF ${bucket}/${path}: ${error?.message}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

async function extractPdfPages(buffer: Uint8Array): Promise<ParsedPage[]> {
  const pdf = await getDocumentProxy(buffer);
  const result = await extractText(pdf, { mergePages: false });
  const rawPages: string[] = Array.isArray(result.text)
    ? result.text
    : [String(result.text ?? "")];
  return rawPages.map((text, i) => ({ page_number: i + 1, text: text ?? "" }));
}

function chunkPages<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ───────────────────── profiler ─────────────────────
const PROFILE_SYSTEM = `Você é um profiler de provas de vestibulares brasileiros.
Receba texto extraído e retorne análise estrutural via a tool submit_profile.
NÃO extraia questões.
Se texto vazio/ilegível: source_type = 'pdf_scanned'.`;

const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    banca: { type: "string" },
    ano: { type: "integer" },
    versao: { type: "string" },
    language: { type: "string" },
    source_type: { type: "string", enum: ["pdf_digital", "pdf_scanned"] },
    question_numbering_pattern: { type: "string" },
    option_label_pattern: { type: "string" },
    objective_question_count: { type: "integer" },
    has_shared_context: { type: "boolean" },
    shared_context_groups: { type: "array", items: { type: "array", items: { type: "integer" } } },
    has_note_e_adote: { type: "boolean" },
    note_e_adote_questions: { type: "array", items: { type: "integer" } },
    has_images: { type: "boolean" },
    questions_with_images: { type: "array", items: { type: "integer" } },
    mixed_with_discursive: { type: "boolean" },
    column_layout: { type: "string" },
    structural_risks: { type: "array", items: { type: "string" } },
    recommended_strategy: { type: "string" },
  },
  required: ["source_type"],
};

async function runProfiler(pages: ParsedPage[]): Promise<ProfileResult> {
  const user = pages.slice(0, 15).map((p) => `=== Página ${p.page_number} ===\n${p.text}`).join("\n\n");
  const { input } = await callTool<ProfileResult>({
    system: PROFILE_SYSTEM,
    user,
    maxTokens: 4096,
    model: MODEL_SONNET,
    toolName: "submit_profile",
    toolDescription: "Submit the structural profile of the exam PDF.",
    schema: PROFILE_SCHEMA,
  });
  return input;
}

// ───────────────────── segmenter ─────────────────────
const CHUNK_PAGES = 4;
const SEGMENTER_MAX_TOKENS = 16384;

const SEG_SYSTEM = `Você recebe as páginas de uma prova com cada linha
prefixada por "Lx: " (onde x é o número da linha DENTRO daquela página,
começando em 1). Segmente o texto em blocos canônicos chamando a tool
submit_blocks com APENAS as coordenadas de cada bloco — NÃO copie o texto.

Tipos de bloco: shared_context, question_start, stem, option_item,
note_e_adote, figure_ref, caption, source_reference.
CUIDADO com layout de 2 colunas — não misture questões.
Blocos ambíguos: flagged = true.
Um bloco deve ficar sempre dentro de uma única página. Se um trecho
atravessa páginas, gere um bloco por página.

Campos:
- block_id: identificador sequencial (será reatribuído depois, pode ser qualquer string).
- type: um dos tipos listados acima.
- question_hint: número da questão a que o bloco pertence (ou null).
- page: número da página (o que aparece em "=== Página N ===").
- line_start / line_end: números das linhas (Lx) inclusive, dentro da página.
- label: para option_item, a letra/rótulo exatamente como aparece (A, B, C, D, E, a), ...); caso contrário null.
- flagged: true se o bloco for ambíguo.`;

const BLOCKS_SCHEMA = {
  type: "object",
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          block_id: { type: "string" },
          type: {
            type: "string",
            enum: [
              "shared_context",
              "question_start",
              "stem",
              "option_item",
              "note_e_adote",
              "figure_ref",
              "caption",
              "source_reference",
            ],
          },
          question_hint: { type: ["integer", "null"] },
          page: { type: ["integer", "null"] },
          line_start: { type: ["integer", "null"] },
          line_end: { type: ["integer", "null"] },
          label: { type: ["string", "null"] },
          flagged: { type: "boolean" },
        },
        required: ["block_id", "type", "page", "line_start", "line_end"],
      },
    },
  },
  required: ["blocks"],
};

function profileSummary(p: ProfileResult): string {
  return JSON.stringify({
    banca: p.banca,
    ano: p.ano,
    option_label_pattern: p.option_label_pattern,
    column_layout: p.column_layout,
    has_shared_context: p.has_shared_context,
    has_note_e_adote: p.has_note_e_adote,
    objective_question_count: p.objective_question_count,
  });
}

function annotate(page: ParsedPage): string {
  const lines = page.text.split("\n");
  const annotated = lines.map((l, i) => `L${i + 1}: ${l}`).join("\n");
  return `=== Página ${page.page_number} ===\n${annotated}`;
}

function hydrate(block: SegmenterBlock, byPage: Map<number, ParsedPage>): string {
  if (block.page == null) return "";
  const page = byPage.get(block.page);
  if (!page) return "";
  const lines = page.text.split("\n");
  if (lines.length === 0) return "";
  const start = Math.max(1, block.line_start ?? 1);
  const end = Math.min(lines.length, block.line_end ?? start);
  if (end < start) return "";
  return lines.slice(start - 1, end).join("\n").trim();
}

async function runSegmenter(pages: ParsedPage[], profile: ProfileResult): Promise<Block[]> {
  const chunks = chunkPages(pages, CHUNK_PAGES);
  const byPage = new Map(pages.map((p) => [p.page_number, p]));
  const pSummary = profileSummary(profile);

  const chunkBlocks = await Promise.all(
    chunks.map(async (chunk, i) => {
      const started = Date.now();
      const user = `Profile: ${pSummary}\n\nTexto:\n${chunk.map(annotate).join("\n\n")}`;
      const { input: res } = await callTool<{ blocks?: SegmenterBlock[] }>({
        system: SEG_SYSTEM,
        user,
        maxTokens: SEGMENTER_MAX_TOKENS,
        model: MODEL_HAIKU,
        toolName: "submit_blocks",
        toolDescription: "Submit the list of canonical blocks identified in the chunk.",
        schema: BLOCKS_SCHEMA,
      });
      const blocks = res.blocks ?? [];
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`[SEGMENTER] chunk ${i + 1}/${chunks.length} processado (${blocks.length} blocos, ${sec}s)`);
      return blocks;
    }),
  );

  const all: Block[] = chunkBlocks.flat().map((b) => ({ ...b, text: hydrate(b, byPage) }));
  all.forEach((b, i) => (b.block_id = `b${String(i + 1).padStart(4, "0")}`));
  return all;
}

// ───────────────────── assembler ─────────────────────
const ASM_MAX_TOKENS = 8192;
const ASSEMBLER_PARALLELISM = 12;

const ASM_SYSTEM = `Monte o JSON canônico de UMA questão a partir dos blocos fornecidos,
chamando a tool submit_question.
NÃO parafraseie. NÃO assuma labels — use exatamente os labels
que aparecem nos blocos.
Question types válidos: multiple_choice_single,
multiple_choice_image_options, multiple_choice_shared_context.
Se incerto sobre qualquer campo: flagged = true.
Campos da questão:
- numero: inteiro (deve bater com o question_hint dos blocos).
- question_type: um dos três tipos acima.
- shared_context: texto do contexto compartilhado (ou null).
- stem: enunciado completo.
- options: array de { label, text, media_ref }.
- note_e_adote: texto do bloco "note e adote" (ou null).
- media_refs: array (pode ficar vazio).
- source_pages: array de inteiros (páginas).
- confidence: número entre 0 e 1.
- flagged: true se ambíguo.`;

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    numero: { type: "integer" },
    question_type: {
      type: "string",
      enum: [
        "multiple_choice_single",
        "multiple_choice_image_options",
        "multiple_choice_shared_context",
      ],
    },
    shared_context: { type: ["string", "null"] },
    stem: { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          text: { type: "string" },
          media_ref: { type: ["string", "null"] },
        },
        required: ["label", "text"],
      },
    },
    note_e_adote: { type: ["string", "null"] },
    media_refs: { type: "array" },
    source_pages: { type: "array", items: { type: "integer" } },
    confidence: { type: "number" },
    flagged: { type: "boolean" },
  },
  required: ["numero", "question_type", "stem", "options"],
};

function blocksByNumero(blocks: Block[]): Map<number, Block[]> {
  const by = new Map<number, Block[]>();
  for (const b of blocks) {
    if (typeof b.question_hint !== "number") continue;
    const arr = by.get(b.question_hint) ?? [];
    arr.push(b);
    by.set(b.question_hint, arr);
  }
  return by;
}

// If Claude serialized `options` as a JSON-encoded string (instead of the
// expected array), try to parse it back into an array. Same for shared_context
// or other fields if ever needed.
function normalizeQuestionShape(q: AssembledQuestion): AssembledQuestion {
  const out = { ...q };
  if (typeof (out as unknown as { options: unknown }).options === "string") {
    try {
      const parsed = JSON.parse((out as unknown as { options: string }).options);
      if (Array.isArray(parsed)) out.options = parsed as AssembledOption[];
    } catch {
      // leave as is; upsert will still accept any JSON scalar
    }
  }
  return out;
}

const ASSEMBLER_MAX_ATTEMPTS = 3;

async function assembleOneQuestion(
  numero: number,
  blocksForQ: Block[],
  profile: ProfileResult,
): Promise<AssembledQuestion | null> {
  for (let attempt = 1; attempt <= ASSEMBLER_MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    const extraHint =
      attempt === 1
        ? ""
        : `ATENÇÃO: tentativa ${attempt}. Na chamada anterior o campo "options" veio como string ` +
          `malformada em vez de array JSON. Retorne options COMO ARRAY JSON, e em qualquer ` +
          `texto literal substitua aspas duplas por aspas simples para não quebrar o JSON.\n`;
    const user =
      `Profile: ${profileSummary(profile)}\n\n` +
      extraHint +
      `Monte a questão numero=${numero} a partir dos blocos abaixo.\n` +
      `Retorne options SEMPRE como array JSON (nunca como string).\n` +
      `Blocos:\n${JSON.stringify(blocksForQ)}`;
    try {
      const { input: raw } = await callTool<AssembledQuestion>({
        system: ASM_SYSTEM,
        user,
        maxTokens: ASM_MAX_TOKENS,
        model: MODEL_SONNET,
        toolName: "submit_question",
        toolDescription: "Submit the canonical JSON for one question.",
        schema: QUESTION_SCHEMA,
      });
      const q = normalizeQuestionShape(raw);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      if (!q || typeof q.numero !== "number") {
        console.log(`[ASSEMBLER] q${numero} inválida (numero=${q?.numero}, ${sec}s)`);
        continue;
      }
      if (!Array.isArray(q.options)) {
        console.log(
          `[ASSEMBLER] q${q.numero} attempt ${attempt}: options não-array (type=${typeof q.options}) — retry`,
        );
        continue;
      }
      console.log(
        `[ASSEMBLER] q${q.numero} ok (${q.options.length} opts, conf=${q.confidence ?? "?"}, ${sec}s, attempt=${attempt})`,
      );
      return q;
    } catch (err) {
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[ASSEMBLER] q${numero} attempt ${attempt} falhou (${sec}s): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log(`[ASSEMBLER] q${numero} desistiu após ${ASSEMBLER_MAX_ATTEMPTS} tentativas`);
  return null;
}

async function runAssembler(blocks: Block[], profile: ProfileResult): Promise<AssembledQuestion[]> {
  const byNumero = blocksByNumero(blocks);
  const numeros = [...byNumero.keys()].sort((a, b) => a - b);
  console.log(`[ASSEMBLER] ${numeros.length} questões para montar (parallel=${ASSEMBLER_PARALLELISM})`);

  const out: AssembledQuestion[] = [];
  for (let i = 0; i < numeros.length; i += ASSEMBLER_PARALLELISM) {
    const slice = numeros.slice(i, i + ASSEMBLER_PARALLELISM);
    const batchStarted = Date.now();
    const results = await Promise.all(
      slice.map((n) => assembleOneQuestion(n, byNumero.get(n) ?? [], profile)),
    );
    for (const r of results) if (r) out.push(r);
    const sec = ((Date.now() - batchStarted) / 1000).toFixed(1);
    console.log(
      `[ASSEMBLER] batch ${Math.floor(i / ASSEMBLER_PARALLELISM) + 1} done (${slice.length} questões, ${sec}s)`,
    );
  }
  return out;
}

// ───────────────────── gabarito-linker ─────────────────────
const GAB_SYSTEM = `Extraia o gabarito oficial desta prova de vestibular
chamando a tool submit_gabarito.
NÃO assuma que as alternativas são A-E ou que há 90 questões.
Leia exatamente o que está no documento.
Questões anuladas = "*" no mapa de answers e também listadas em annulled.
Campos:
- version_detected: string opcional com o nome da versão/caderno.
- total_questions: total de questões do gabarito.
- answers: objeto onde cada chave é o número da questão (string) e o valor é a letra (ou "*").
- annulled: lista de números anulados.
- format_notes: observações livres.`;

const GABARITO_SCHEMA = {
  type: "object",
  properties: {
    version_detected: { type: "string" },
    total_questions: { type: "integer" },
    answers: { type: "object", additionalProperties: { type: "string" } },
    annulled: { type: "array", items: { type: "integer" } },
    format_notes: { type: "string" },
  },
  required: ["answers"],
};

async function runGabaritoLinker(
  examId: string,
  jobId: string,
  gabaritoPath: string,
): Promise<{ answers_applied: number; issues_opened: number; annulled: number; gabarito: GabaritoResult }> {
  const buffer = await downloadPdf(gabaritoPath);
  const pdf = await getDocumentProxy(buffer);
  const extracted = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(extracted.text) ? extracted.text.join("\n") : String(extracted.text ?? "");

  const { input: gabarito } = await callTool<GabaritoResult>({
    system: GAB_SYSTEM,
    user: text,
    maxTokens: 4096,
    model: MODEL_SONNET,
    toolName: "submit_gabarito",
    toolDescription: "Submit the answer key extracted from the gabarito PDF.",
    schema: GABARITO_SCHEMA,
  });

  const answers = gabarito.answers ?? {};
  const annulledSet = new Set((gabarito.annulled ?? []).map(Number));

  const { data: questions, error: qErr } = await supabase
    .from("question_raw")
    .select("id, numero")
    .eq("exam_id", examId);
  if (qErr) throw new Error(`Falha ao listar question_raw: ${qErr.message}`);

  let applied = 0;
  const issues: Array<Record<string, unknown>> = [];
  for (const q of questions ?? []) {
    const ans = answers[String(q.numero)];
    if (ans !== undefined) {
      const isAnnulled = ans === "*" || annulledSet.has(q.numero);
      const { error: upErr } = await supabase
        .from("question_raw")
        .update({ correct_answer: ans, is_annulled: isAnnulled })
        .eq("id", q.id);
      if (upErr) throw new Error(`Falha update question_raw ${q.id}: ${upErr.message}`);
      applied++;
    } else {
      issues.push({
        question_raw_id: q.id,
        job_id: jobId,
        issue_type: "gabarito_invalido",
        severity: "medium",
        description: `Questão ${q.numero} não tem resposta no gabarito extraído`,
        agent: "gabarito_linker",
      });
    }
  }
  if (issues.length) {
    const { error: issErr } = await supabase.from("question_issues").insert(issues);
    if (issErr) throw new Error(`Falha insert question_issues: ${issErr.message}`);
  }

  return {
    answers_applied: applied,
    issues_opened: issues.length,
    annulled: annulledSet.size,
    gabarito,
  };
}

// ───────────────────── reviewer ─────────────────────
const REVIEWER_BATCH_SIZE = 12;
const REVIEWER_MAX_TOKENS = 16384;

const REV_SYSTEM = `Compare as questões montadas com o texto original da prova.
Para cada questão, verifique:
1. O stem não contém texto de questão vizinha (contaminação)
2. As alternativas pertencem à questão correta
3. shared_context está nas questões corretas
4. Nenhum texto foi reescrito ou parafraseado
5. O gabarito é coerente com as alternativas
Se encontrar problemas, liste-os.
Se a questão está OK, marque approved=true e issues=[].
Chame a tool submit_review com um item por questão recebida.
issue_type válidos: contaminacao, alternativa_faltante, alternativa_vazia,
alternativas_incorretas, gabarito_invalido, shared_context_ausente, texto_truncado.
severity válidos: low, medium, high, critical.
corrections: null se não há correções; caso contrário objeto opcional com
campos stem / options / shared_context propostos.`;

const REVIEW_ISSUE_TYPES = [
  "contaminacao",
  "alternativa_faltante",
  "alternativa_vazia",
  "alternativas_incorretas",
  "gabarito_invalido",
  "shared_context_ausente",
  "texto_truncado",
];

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          numero: { type: "integer" },
          approved: { type: "boolean" },
          corrections: {
            type: ["object", "null"],
            properties: {
              stem: { type: ["string", "null"] },
              options: { type: ["array", "null"] },
              shared_context: { type: ["string", "null"] },
            },
          },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                issue_type: { type: "string", enum: REVIEW_ISSUE_TYPES },
                severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                description: { type: "string" },
              },
              required: ["issue_type", "severity", "description"],
            },
          },
        },
        required: ["numero", "approved", "issues"],
      },
    },
  },
  required: ["reviews"],
};

interface ReviewIssue {
  issue_type: string;
  severity: string;
  description: string;
}
interface ReviewItem {
  numero: number;
  approved: boolean;
  corrections: Record<string, unknown> | null;
  issues: ReviewIssue[];
}

interface QuestionForReview {
  id: string;
  numero: number;
  stem: string;
  options: AssembledOption[] | null;
  correct_answer: string | null;
  shared_context: string | null;
}

async function reviewBatch(batch: QuestionForReview[]): Promise<ReviewItem[]> {
  const payload = batch.map((q) => ({
    numero: q.numero,
    stem: q.stem,
    options: q.options,
    correct_answer: q.correct_answer,
    shared_context: q.shared_context,
  }));
  const { input } = await callTool<{ reviews?: ReviewItem[] }>({
    system: REV_SYSTEM,
    user: `Revise as seguintes questões:\n${JSON.stringify(payload)}`,
    maxTokens: REVIEWER_MAX_TOKENS,
    model: MODEL_SONNET,
    toolName: "submit_review",
    toolDescription: "Submit reviews for a batch of questions.",
    schema: REVIEW_SCHEMA,
  });
  return input.reviews ?? [];
}

interface ReviewerSummary {
  approved_clean: number;
  with_issues: number;
  total_issues: number;
  critical_issues: number;
}

async function runReviewer(examId: string, jobId: string): Promise<ReviewerSummary> {
  const { data, error } = await supabase
    .from("question_raw")
    .select("id, numero, stem, options, correct_answer, shared_context")
    .eq("exam_id", examId)
    .eq("status", "raw")
    .order("numero", { ascending: true });
  if (error) throw new Error(`reviewer load: ${error.message}`);
  const questions = (data ?? []) as QuestionForReview[];
  if (questions.length === 0) {
    return { approved_clean: 0, with_issues: 0, total_issues: 0, critical_issues: 0 };
  }

  const byNumero = new Map<number, QuestionForReview>();
  for (const q of questions) byNumero.set(q.numero, q);

  const batches: QuestionForReview[][] = [];
  for (let i = 0; i < questions.length; i += REVIEWER_BATCH_SIZE) {
    batches.push(questions.slice(i, i + REVIEWER_BATCH_SIZE));
  }
  console.log(`[REVIEWER] ${questions.length} questões em ${batches.length} batches`);

  const allReviews = (
    await Promise.all(
      batches.map(async (batch, i) => {
        const started = Date.now();
        const reviews = await reviewBatch(batch);
        const sec = ((Date.now() - started) / 1000).toFixed(1);
        console.log(
          `[REVIEWER] batch ${i + 1}/${batches.length} (${reviews.length} reviews, ${sec}s)`,
        );
        return reviews;
      }),
    )
  ).flat();

  let approvedClean = 0;
  let withIssues = 0;
  let criticalIssues = 0;
  const issueRows: Record<string, unknown>[] = [];

  for (const r of allReviews) {
    const q = byNumero.get(r.numero);
    if (!q) continue;
    const issues = r.issues ?? [];
    const hasIssues = issues.length > 0;

    const update: Record<string, unknown> = { status: "reviewed" };
    if (r.corrections && typeof r.corrections === "object") {
      update.reviewer_corrections = r.corrections;
    }
    await supabase.from("question_raw").update(update).eq("id", q.id);

    if (r.approved && !hasIssues) {
      approvedClean++;
    } else {
      withIssues++;
      for (const issue of issues) {
        if (issue.severity === "critical") criticalIssues++;
        issueRows.push({
          question_raw_id: q.id,
          job_id: jobId,
          issue_type: issue.issue_type,
          severity: issue.severity,
          description: issue.description,
          agent: "reviewer",
        });
      }
    }
  }

  if (issueRows.length) {
    const { error: issErr } = await supabase.from("question_issues").insert(issueRows);
    if (issErr) throw new Error(`reviewer issues insert: ${issErr.message}`);
  }

  return {
    approved_clean: approvedClean,
    with_issues: withIssues,
    total_issues: issueRows.length,
    critical_issues: criticalIssues,
  };
}

// ───────────────────── validator (pure code) ─────────────────────
interface ValidatorSummary {
  approved: number;
  flagged: number;
  total_issues: number;
}

async function runValidator(examId: string, jobId: string): Promise<ValidatorSummary> {
  const { data, error } = await supabase
    .from("question_raw")
    .select("id, numero, stem, options, correct_answer, confidence_score")
    .eq("exam_id", examId)
    .eq("status", "reviewed")
    .order("numero", { ascending: true });
  if (error) throw new Error(`validator load: ${error.message}`);
  const questions = data ?? [];
  if (questions.length === 0) return { approved: 0, flagged: 0, total_issues: 0 };

  // Pre-compute duplicate stems.
  const stemCount = new Map<string, number>();
  for (const q of questions) {
    const key = String(q.stem ?? "").trim();
    if (!key) continue;
    stemCount.set(key, (stemCount.get(key) ?? 0) + 1);
  }

  let approved = 0;
  let flagged = 0;
  const issues: Record<string, unknown>[] = [];

  for (const q of questions) {
    const problems: Array<{ issue_type: string; severity: string; description: string }> = [];

    const stem = String(q.stem ?? "");
    if (stem.trim().length < 20) {
      problems.push({
        issue_type: "texto_truncado",
        severity: "high",
        description: `stem com apenas ${stem.trim().length} chars (mínimo 20)`,
      });
    }

    const opts = Array.isArray(q.options) ? (q.options as AssembledOption[]) : [];
    if (opts.length !== 5) {
      problems.push({
        issue_type: "alternativa_faltante",
        severity: "high",
        description: `options tem ${opts.length} elementos (esperado 5)`,
      });
    } else {
      for (let i = 0; i < opts.length; i++) {
        const o = opts[i];
        const label = String(o?.label ?? "").trim();
        const text = String(o?.text ?? "").trim();
        if (!label || !text) {
          problems.push({
            issue_type: "alternativa_vazia",
            severity: "high",
            description: `option[${i}] label ou text vazio (label='${label}', text_len=${text.length})`,
          });
        }
      }
    }

    const labels = opts.map((o) => String(o?.label ?? "").trim());
    const ans = String(q.correct_answer ?? "").trim();
    if (!ans) {
      problems.push({
        issue_type: "gabarito_invalido",
        severity: "medium",
        description: "correct_answer ausente",
      });
    } else if (ans !== "*" && !labels.includes(ans)) {
      problems.push({
        issue_type: "gabarito_invalido",
        severity: "high",
        description: `correct_answer '${ans}' não bate com labels [${labels.join(",")}]`,
      });
    }

    if ((stemCount.get(stem.trim()) ?? 0) > 1) {
      problems.push({
        issue_type: "contaminacao",
        severity: "high",
        description: "stem duplicado em outra questão do mesmo exam",
      });
    }

    const conf =
      typeof q.confidence_score === "number"
        ? q.confidence_score
        : typeof q.confidence_score === "string"
          ? parseFloat(q.confidence_score)
          : NaN;
    if (!Number.isFinite(conf) || conf < 0.7) {
      problems.push({
        issue_type: "texto_truncado",
        severity: "low",
        description: `confidence_score baixo (${q.confidence_score ?? "null"})`,
      });
    }

    const passed = problems.length === 0;
    const validator_result = {
      passed,
      checked_at: new Date().toISOString(),
      checks: {
        stem_length: stem.trim().length,
        options_count: opts.length,
        correct_answer_valid: !!ans && (ans === "*" || labels.includes(ans)),
        confidence: Number.isFinite(conf) ? conf : null,
        duplicate_stem: (stemCount.get(stem.trim()) ?? 0) > 1,
      },
      issues: problems,
    };

    await supabase
      .from("question_raw")
      .update({
        status: passed ? "approved" : "flagged",
        validator_result,
      })
      .eq("id", q.id);

    if (passed) {
      approved++;
    } else {
      flagged++;
      for (const p of problems) {
        issues.push({
          question_raw_id: q.id,
          job_id: jobId,
          issue_type: p.issue_type,
          severity: p.severity,
          description: p.description,
          agent: "validator",
        });
      }
    }
  }

  if (issues.length) {
    const { error: issErr } = await supabase.from("question_issues").insert(issues);
    if (issErr) throw new Error(`validator issues insert: ${issErr.message}`);
  }

  return { approved, flagged, total_issues: issues.length };
}

// ───────────────────── enricher ─────────────────────
const ENRICHER_BATCH_SIZE = 15;
const ENRICHER_MAX_TOKENS = 8192;

const SUBJECTS = [
  "Português",
  "Matemática",
  "História",
  "Geografia",
  "Biologia",
  "Física",
  "Química",
  "Inglês",
  "Filosofia",
  "Sociologia",
  "Artes",
];

const ENR_SYSTEM = `Classifique cada questão por matéria e subtópico.
NÃO altere o texto das questões.
Subjects válidos: ${SUBJECTS.join(", ")}.
Difficulty: 1 (fácil) a 5 (muito difícil).
Chame a tool submit_enrichment com um item por questão recebida.
Campos:
- numero: inteiro igual ao recebido.
- subject: um dos subjects válidos.
- subtopic: string curta (ex.: "geometria espacial", "literatura modernista").
- difficulty: 1..5.
- tags: array de 1-5 palavras-chave.
- competency: descrição curta da competência avaliada.`;

const ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    enrichments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          numero: { type: "integer" },
          subject: { type: "string", enum: SUBJECTS },
          subtopic: { type: "string" },
          difficulty: { type: "integer", minimum: 1, maximum: 5 },
          tags: { type: "array", items: { type: "string" } },
          competency: { type: "string" },
        },
        required: ["numero", "subject", "subtopic", "difficulty"],
      },
    },
  },
  required: ["enrichments"],
};

interface EnrichmentItem {
  numero: number;
  subject: string;
  subtopic: string;
  difficulty: number;
  tags?: string[];
  competency?: string;
}

interface QuestionForEnrichment {
  id: string;
  numero: number;
  stem: string;
  options: AssembledOption[] | null;
  shared_context: string | null;
}

async function enrichBatch(batch: QuestionForEnrichment[]): Promise<EnrichmentItem[]> {
  const payload = batch.map((q) => ({
    numero: q.numero,
    stem: q.stem,
    options: q.options,
    shared_context: q.shared_context,
  }));
  const { input } = await callTool<{ enrichments?: EnrichmentItem[] }>({
    system: ENR_SYSTEM,
    user: `Classifique as seguintes questões:\n${JSON.stringify(payload)}`,
    maxTokens: ENRICHER_MAX_TOKENS,
    model: MODEL_SONNET,
    toolName: "submit_enrichment",
    toolDescription: "Submit subject/subtopic classification for a batch of questions.",
    schema: ENRICHMENT_SCHEMA,
  });
  return input.enrichments ?? [];
}

interface EnricherSummary {
  count: number;
  by_subject: Record<string, number>;
}

async function runEnricher(examId: string): Promise<EnricherSummary> {
  const { data, error } = await supabase
    .from("question_raw")
    .select("id, numero, stem, options, shared_context")
    .eq("exam_id", examId)
    .eq("status", "approved")
    .order("numero", { ascending: true });
  if (error) throw new Error(`enricher load: ${error.message}`);
  const questions = (data ?? []) as QuestionForEnrichment[];
  if (questions.length === 0) return { count: 0, by_subject: {} };

  const byNumero = new Map<number, QuestionForEnrichment>();
  for (const q of questions) byNumero.set(q.numero, q);

  const batches: QuestionForEnrichment[][] = [];
  for (let i = 0; i < questions.length; i += ENRICHER_BATCH_SIZE) {
    batches.push(questions.slice(i, i + ENRICHER_BATCH_SIZE));
  }
  console.log(`[ENRICHER] ${questions.length} questões em ${batches.length} batches`);

  const allEnrichments = (
    await Promise.all(
      batches.map(async (batch, i) => {
        const started = Date.now();
        const enrichments = await enrichBatch(batch);
        const sec = ((Date.now() - started) / 1000).toFixed(1);
        console.log(
          `[ENRICHER] batch ${i + 1}/${batches.length} (${enrichments.length} itens, ${sec}s)`,
        );
        return enrichments;
      }),
    )
  ).flat();

  const bySubject: Record<string, number> = {};
  let persisted = 0;
  for (const e of allEnrichments) {
    const q = byNumero.get(e.numero);
    if (!q) continue;
    await supabase.from("question_raw").update({ enrichment: e }).eq("id", q.id);
    bySubject[e.subject] = (bySubject[e.subject] ?? 0) + 1;
    persisted++;
  }

  return { count: persisted, by_subject: bySubject };
}

// ───────────────────── asset extractor ─────────────────────
const ASSET_MIN_DIM = 40; // skip tiny decorative glyphs
const ASSET_MAX_BYTES = 20 * 1024 * 1024; // 20MB PNG ceiling

interface AssetManifestItem {
  file_name: string;
  page: number;
  storage_path: string;
  width: number;
  height: number;
  file_hash: string;
  order_index: number;
}

interface RawImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  kind?: number;
}

async function extractImagesWithMeta(pdf: unknown, pageNumber: number): Promise<RawImage[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await (pdf as any).getPage(pageNumber);
  const operatorList = await page.getOperatorList();
  const { OPS } = await getResolvedPDFJS();
  const out: RawImage[] = [];
  for (let i = 0; i < operatorList.fnArray.length; i++) {
    if (operatorList.fnArray[i] !== OPS.paintImageXObject) continue;
    const imageKey = operatorList.argsArray[i][0];
    try {
      const image = await page.objs.get(imageKey);
      if (!image?.data || !image.width || !image.height) continue;
      out.push({
        data: image.data as Uint8ClampedArray,
        width: image.width as number,
        height: image.height as number,
        kind: image.kind as number | undefined,
      });
    } catch {
      // Image not resolvable; skip.
    }
  }
  return out;
}

function encodePng(img: RawImage): Buffer | null {
  const { width, height } = img;
  const expectedRgba = 4 * width * height;
  const expectedRgb = 3 * width * height;
  let rgba: Buffer;
  if (img.kind === 3 || img.data.length === expectedRgba) {
    rgba = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength).subarray(0, expectedRgba);
  } else if (img.kind === 2 || img.data.length === expectedRgb) {
    rgba = Buffer.alloc(expectedRgba);
    for (let i = 0, j = 0; j < expectedRgba; i += 3, j += 4) {
      rgba[j] = img.data[i];
      rgba[j + 1] = img.data[i + 1];
      rgba[j + 2] = img.data[i + 2];
      rgba[j + 3] = 255;
    }
  } else if (img.kind === 1) {
    rgba = Buffer.alloc(expectedRgba);
    for (let p = 0; p < width * height; p++) {
      const byte = img.data[p >>> 3];
      const bit = (byte >> (7 - (p & 7))) & 1;
      const v = bit ? 255 : 0;
      const o = p * 4;
      rgba[o] = v;
      rgba[o + 1] = v;
      rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
  } else {
    // Unknown layout: bail out gracefully.
    return null;
  }
  const png = new PNG({ width, height });
  png.data = rgba;
  try {
    return PNG.sync.write(png);
  } catch {
    return null;
  }
}

async function runAssetExtractor(
  pdfBuffer: Uint8Array,
  examId: string,
): Promise<{ assets: AssetManifestItem[]; pages_scanned: number }> {
  const pdf = await getDocumentProxy(pdfBuffer);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const numPages = (pdf as any).numPages as number;
  const manifest: AssetManifestItem[] = [];
  const seenHashes = new Set<string>();
  let orderIndex = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    let images: RawImage[] = [];
    try {
      images = await extractImagesWithMeta(pdf, pageNum);
    } catch (err) {
      console.warn(
        `[ASSET EXTRACTOR] page ${pageNum} falhou: ${err instanceof Error ? err.message : err}`,
      );
      continue;
    }

    let imgIndex = 0;
    for (const img of images) {
      imgIndex++;
      if (img.width < ASSET_MIN_DIM || img.height < ASSET_MIN_DIM) continue;
      const png = encodePng(img);
      if (!png) continue;
      if (png.length > ASSET_MAX_BYTES) continue;

      const fileHash = createHash("sha256").update(png).digest("hex");
      if (seenHashes.has(fileHash)) continue; // dedup same decoded image across pages
      seenHashes.add(fileHash);

      const fileName = `page${pageNum}_img${imgIndex}.png`;
      const storagePath = `assets/${examId}/${fileName}`;

      const { error: upErr } = await supabase.storage
        .from("exam-files")
        .upload(storagePath, png, {
          contentType: "image/png",
          upsert: true,
        });
      if (upErr) {
        console.warn(
          `[ASSET EXTRACTOR] upload ${storagePath} falhou: ${upErr.message}`,
        );
        continue;
      }

      manifest.push({
        file_name: fileName,
        page: pageNum,
        storage_path: `exam-files/${storagePath}`,
        width: img.width,
        height: img.height,
        file_hash: fileHash,
        order_index: orderIndex++,
      });
    }
  }

  return { assets: manifest, pages_scanned: numPages };
}

// ───────────────────── media mapper ─────────────────────
const MEDIA_MAPPER_MAX_TOKENS = 8192;

const MEDIA_ROLES = ["enunciado", "alternativa", "shared_context"] as const;
const MEDIA_TYPES = [
  "figure",
  "chart",
  "map",
  "table",
  "photo",
  "charge",
  "option_image",
] as const;

const MEDIA_SYSTEM = `Associe as imagens extraídas às questões da prova.
Roles válidos: enunciado | alternativa | shared_context
Quando role = alternativa, adicione campo option_label (A, B, etc.)
Media types válidos: figure | chart | map | table | photo | charge | option_image
Se incerto: flagged = true.
NÃO associe mídia de uma questão à vizinha.
Use as informações de question_hint por página nos blocos para inferir
a qual questão cada imagem pertence. Se uma imagem não pertencer a
nenhuma questão identificável, ignore-a (não a inclua na resposta).`;

const MEDIA_MAP_SCHEMA = {
  type: "object",
  properties: {
    media: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_number: { type: "integer" },
          role: { type: "string", enum: MEDIA_ROLES },
          option_label: { type: ["string", "null"] },
          media_type: { type: "string", enum: MEDIA_TYPES },
          file_name: { type: "string" },
          caption: { type: ["string", "null"] },
          page: { type: "integer" },
          flagged: { type: "boolean" },
        },
        required: ["question_number", "role", "media_type", "file_name", "page"],
      },
    },
  },
  required: ["media"],
};

interface MediaMapItem {
  question_number: number;
  role: string;
  option_label?: string | null;
  media_type: string;
  file_name: string;
  caption?: string | null;
  page: number;
  flagged?: boolean;
}

async function runMediaMapper(
  manifest: AssetManifestItem[],
  blocks: Block[],
  profile: ProfileResult,
): Promise<MediaMapItem[]> {
  if (manifest.length === 0) return [];

  // Keep the block payload small: only question_hint + page + type + first 120 chars of text.
  const trimmedBlocks = blocks
    .filter((b) => typeof b.question_hint === "number")
    .map((b) => ({
      question_hint: b.question_hint,
      page: b.page,
      type: b.type,
      label: b.label,
      text_preview: String(b.text ?? "").slice(0, 120),
    }));

  const user =
    `Profile: ${profileSummary(profile)}\n\n` +
    `Assets disponíveis:\n${JSON.stringify(manifest.map((a) => ({ file_name: a.file_name, page: a.page })))}\n\n` +
    `Blocos da prova (apenas com question_hint):\n${JSON.stringify(trimmedBlocks)}`;

  const { input } = await callTool<{ media?: MediaMapItem[] }>({
    system: MEDIA_SYSTEM,
    user,
    maxTokens: MEDIA_MAPPER_MAX_TOKENS,
    model: MODEL_SONNET,
    toolName: "submit_media_map",
    toolDescription: "Submit the mapping between extracted images and questions.",
    schema: MEDIA_MAP_SCHEMA,
  });

  return input.media ?? [];
}

// Persist the media mapping after question_raw rows exist: one row per
// (file, question) in question_media, and a rolled-up media_map column
// on question_raw.
async function persistMedia(
  examId: string,
  manifest: AssetManifestItem[],
  mapping: MediaMapItem[],
): Promise<number> {
  if (mapping.length === 0) return 0;

  const byFile = new Map<string, AssetManifestItem>();
  for (const a of manifest) byFile.set(a.file_name, a);

  const { data: rows, error: rowsErr } = await supabase
    .from("question_raw")
    .select("id, numero")
    .eq("exam_id", examId);
  if (rowsErr) throw new Error(`persistMedia load question_raw: ${rowsErr.message}`);
  const idByNumero = new Map<number, string>();
  for (const r of rows ?? []) idByNumero.set(r.numero as number, r.id as string);

  const mediaRows: Record<string, unknown>[] = [];
  const byQuestion = new Map<number, MediaMapItem[]>();

  for (const m of mapping) {
    const qid = idByNumero.get(m.question_number);
    const asset = byFile.get(m.file_name);
    if (!qid || !asset) continue;
    mediaRows.push({
      exam_id: examId,
      question_raw_id: qid,
      media_type: m.media_type,
      role: m.role,
      option_label: m.role === "alternativa" ? m.option_label ?? null : null,
      storage_path: asset.storage_path,
      file_name: asset.file_name,
      caption: m.caption ?? null,
      page: asset.page,
      width: asset.width,
      height: asset.height,
      file_hash: asset.file_hash,
      order_index: asset.order_index,
      flagged: !!m.flagged,
    });
    const list = byQuestion.get(m.question_number) ?? [];
    list.push(m);
    byQuestion.set(m.question_number, list);
  }

  if (mediaRows.length) {
    const { error: insErr } = await supabase.from("question_media").insert(mediaRows);
    if (insErr) throw new Error(`persistMedia insert: ${insErr.message}`);
  }

  for (const [numero, items] of byQuestion) {
    const qid = idByNumero.get(numero);
    if (!qid) continue;
    await supabase
      .from("question_raw")
      .update({ media_map: items })
      .eq("id", qid);
  }

  return byQuestion.size;
}

// ───────────────────── inserter ─────────────────────
const CRITICAL_ISSUE_TYPES = new Set([
  "contaminacao",
  "imagem_incorreta",
  "legenda_quebrada",
  "alternativas_incorretas",
  "gabarito_invalido",
  "duplicata_provavel",
]);

interface InserterSummary {
  inserted: number;
  deduped_exact: number;
  flagged_near_dup: number;
  skipped_no_enrichment: number;
}

function computeContentHash(stem: string, options: unknown[]): string {
  return createHash("sha256")
    .update(stem + JSON.stringify(options))
    .digest("hex");
}

function computeNormalizedHash(stem: string, options: unknown[]): string {
  const normalized = String(stem ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256")
    .update(normalized + JSON.stringify(options))
    .digest("hex");
}

interface ExamMeta {
  banca: string;
  ano: number;
  versao: string | null;
}

async function runInserter(
  examId: string,
  jobId: string,
  examMeta: ExamMeta,
): Promise<InserterSummary> {
  // Equivalent of v_questions_ready but applied to question_raw (the
  // source side): approved status, confidence >= 0.8, no unresolved
  // high/critical or blocker-type issues.
  const { data: questions, error } = await supabase
    .from("question_raw")
    .select(
      "id, numero, stem, options, shared_context, note_e_adote, correct_answer, source_pages, confidence_score, enrichment, media_map",
    )
    .eq("exam_id", examId)
    .eq("status", "approved")
    .gte("confidence_score", 0.8)
    .order("numero", { ascending: true });
  if (error) throw new Error(`inserter load: ${error.message}`);
  if (!questions?.length) {
    return { inserted: 0, deduped_exact: 0, flagged_near_dup: 0, skipped_no_enrichment: 0 };
  }

  const { data: blockerIssues } = await supabase
    .from("question_issues")
    .select("question_raw_id, severity, issue_type, resolved")
    .in("question_raw_id", questions.map((q) => q.id))
    .eq("resolved", false);
  const blockedIds = new Set<string>();
  for (const iss of blockerIssues ?? []) {
    if (
      iss.severity === "high" ||
      iss.severity === "critical" ||
      CRITICAL_ISSUE_TYPES.has(iss.issue_type as string)
    ) {
      blockedIds.add(iss.question_raw_id as string);
    }
  }

  let inserted = 0;
  let dedupedExact = 0;
  let flaggedNearDup = 0;
  let skippedNoEnrichment = 0;

  for (const q of questions) {
    if (blockedIds.has(q.id)) continue;
    const enrichment = q.enrichment as
      | { subject?: string; subtopic?: string; difficulty?: number; tags?: string[]; competency?: string }
      | null;
    if (!enrichment?.subject || !enrichment?.subtopic) {
      skippedNoEnrichment++;
      continue;
    }

    const rawOpts = Array.isArray(q.options) ? (q.options as AssembledOption[]) : [];
    const correctAns = String(q.correct_answer ?? "").trim();
    const convertedOptions = rawOpts.map((o) => ({
      label: o.label,
      text: o.text,
      is_correct: correctAns !== "" && correctAns !== "*" && o.label === correctAns,
    }));

    const stem = String(q.stem ?? "");
    const contentHash = computeContentHash(stem, convertedOptions);
    const normalizedHash = computeNormalizedHash(stem, convertedOptions);

    // Dedup exact.
    const { data: exact, error: exactErr } = await supabase
      .from("questions")
      .select("id")
      .eq("content_hash", contentHash)
      .limit(1)
      .maybeSingle();
    if (exactErr && exactErr.code !== "PGRST116") {
      throw new Error(`inserter exact dup check: ${exactErr.message}`);
    }
    if (exact?.id) {
      await supabase.from("question_occurrences").insert({
        question_id: exact.id,
        exam_id: examId,
        raw_question_id: q.id,
        numero_na_prova: q.numero,
        versao: examMeta.versao,
        source: `${examMeta.banca} ${examMeta.ano}${examMeta.versao ? " " + examMeta.versao : ""} Q${q.numero}`,
        source_pages: Array.isArray(q.source_pages) ? q.source_pages : null,
      });
      await supabase
        .from("question_raw")
        .update({ status: "deduped", content_hash: contentHash, normalized_hash: normalizedHash })
        .eq("id", q.id);
      dedupedExact++;
      continue;
    }

    // Dedup near-match.
    const { data: near } = await supabase
      .from("questions")
      .select("id")
      .eq("normalized_hash", normalizedHash)
      .limit(1)
      .maybeSingle();
    if (near?.id) {
      await supabase.from("question_issues").insert({
        question_raw_id: q.id,
        job_id: jobId,
        issue_type: "duplicata_provavel",
        severity: "medium",
        description: `Possível duplicata de questions.id=${near.id} (mesmo normalized_hash)`,
        agent: "inserter",
      });
      await supabase
        .from("question_raw")
        .update({ status: "flagged", content_hash: contentHash, normalized_hash: normalizedHash })
        .eq("id", q.id);
      flaggedNearDup++;
      continue;
    }

    // New question — insert.
    const difficulty =
      typeof enrichment.difficulty === "number" &&
      enrichment.difficulty >= 1 &&
      enrichment.difficulty <= 5
        ? enrichment.difficulty
        : 3;
    const source = `${examMeta.banca} ${examMeta.ano}${examMeta.versao ? " " + examMeta.versao : ""} Q${q.numero}`;

    const { data: ins, error: insErr } = await supabase
      .from("questions")
      .insert({
        exam_type: examMeta.banca,
        subject: enrichment.subject,
        subtopic: enrichment.subtopic,
        difficulty,
        question_text: stem,
        options: convertedOptions,
        year: examMeta.ano,
        tags: Array.isArray(enrichment.tags) ? enrichment.tags : null,
        source,
        shared_context: (q.shared_context as string | null) ?? null,
        note_e_adote: (q.note_e_adote as string | null) ?? null,
        exam_id: examId,
        raw_question_id: q.id,
        source_pages: Array.isArray(q.source_pages) ? q.source_pages : null,
        media_refs: Array.isArray(q.media_map) ? q.media_map : null,
        content_hash: contentHash,
        normalized_hash: normalizedHash,
        ingestion_version: 1,
        status: "approved",
      })
      .select("id")
      .single();
    if (insErr || !ins) {
      throw new Error(`inserter insert questions (q${q.numero}): ${insErr?.message ?? "unknown"}`);
    }

    await supabase.from("question_occurrences").insert({
      question_id: ins.id,
      exam_id: examId,
      raw_question_id: q.id,
      numero_na_prova: q.numero,
      versao: examMeta.versao,
      source,
      source_pages: Array.isArray(q.source_pages) ? q.source_pages : null,
    });

    await supabase
      .from("question_raw")
      .update({ status: "inserted", content_hash: contentHash, normalized_hash: normalizedHash })
      .eq("id", q.id);
    inserted++;
  }

  return { inserted, deduped_exact: dedupedExact, flagged_near_dup: flaggedNearDup, skipped_no_enrichment: skippedNoEnrichment };
}

// ───────────────────── main ─────────────────────
async function main(examId: string) {
  // Fetch exam and resolve storage paths from the most recent job that has them
  // (the exams table does not store paths in this schema).
  const { data: examRow, error: examErr } = await supabase
    .from("exams")
    .select("id")
    .eq("id", examId)
    .single();
  if (examErr || !examRow) throw new Error(`Exam ${examId} não encontrado: ${examErr?.message}`);

  const { data: lastJob, error: pathErr } = await supabase
    .from("extraction_jobs")
    .select("prova_storage_path, gabarito_storage_path")
    .eq("exam_id", examId)
    .not("prova_storage_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pathErr) throw new Error(`Falha ao buscar storage paths: ${pathErr.message}`);
  if (!lastJob?.prova_storage_path) {
    throw new Error(
      `Nenhum job anterior com prova_storage_path para exam ${examId} — passe o path manualmente.`,
    );
  }
  const exam = {
    id: examId,
    prova_storage_path: lastJob.prova_storage_path as string,
    gabarito_storage_path: lastJob.gabarito_storage_path as string | null,
  };

  // Create a fresh extraction_job
  const { data: job, error: jobErr } = await supabase
    .from("extraction_jobs")
    .insert({
      exam_id: examId,
      status: "pending",
      current_stage: "pre_parsing",
      started_at: new Date().toISOString(),
      prova_storage_path: exam.prova_storage_path,
      gabarito_storage_path: exam.gabarito_storage_path ?? null,
      stages_log: [],
    })
    .select("id")
    .single();
  if (jobErr || !job) throw new Error(`Falha ao criar job: ${jobErr?.message}`);
  const jobId = job.id as string;
  console.log(`[JOB] ${jobId}`);

  const appendLog = async (stage: string, startedAt: string, status: "done" | "error", error?: string) => {
    const { data } = await supabase.from("extraction_jobs").select("stages_log").eq("id", jobId).single();
    const log = Array.isArray(data?.stages_log) ? data!.stages_log : [];
    log.push({ stage, started_at: startedAt, completed_at: new Date().toISOString(), status, ...(error ? { error } : {}) });
    await supabase.from("extraction_jobs").update({ stages_log: log, current_stage: stage }).eq("id", jobId);
  };

  const runStage = async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
    const startedAt = new Date().toISOString();
    await supabase.from("extraction_jobs").update({ current_stage: name }).eq("id", jobId);
    try {
      const out = await fn();
      await appendLog(name, startedAt, "done");
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await appendLog(name, startedAt, "error", msg);
      throw err;
    }
  };

  try {
    // 1. PRE-PARSER
    const pages = await runStage("pre_parsing", async () => {
      const buf = await downloadPdf(exam.prova_storage_path as string);
      const ps = await extractPdfPages(buf);
      const totalChars = ps.reduce((s, p) => s + p.text.length, 0);
      console.log(`[PRE-PARSER] ${ps.length} páginas, ${totalChars} chars`);
      return ps;
    });

    if (pages.reduce((s, p) => s + p.text.length, 0) < 500) {
      throw new Error("PDF escaneado não suportado");
    }

    // 2. PROFILER
    const profile = await runStage("profiling", async () => {
      const started = Date.now();
      const p = await runProfiler(pages);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[PROFILER] ${p.objective_question_count ?? "?"} questões detectadas, padrão ${p.option_label_pattern ?? "?"} (${sec}s)`,
      );
      return p;
    });

    if (profile.source_type === "pdf_scanned") {
      throw new Error("Profiler detectou pdf_scanned — OCR não suportado");
    }

    // Persist profile on job + exam
    await supabase.from("extraction_jobs").update({
      pre_parser_pages: pages,
      profile_json: profile,
    }).eq("id", jobId);
    await supabase.from("exams").update({
      profile_json: profile,
      total_questions_detected: profile.objective_question_count ?? null,
      option_label_pattern: profile.option_label_pattern ?? null,
      has_shared_context: profile.has_shared_context ?? null,
      has_note_e_adote: profile.has_note_e_adote ?? null,
      has_images: profile.has_images ?? null,
    }).eq("id", examId);

    // 2.5. ASSET EXTRACTOR
    const assetManifest = await runStage("extracting_assets", async () => {
      const started = Date.now();
      const pdfBuf = await downloadPdf(exam.prova_storage_path as string);
      const res = await runAssetExtractor(pdfBuf, examId);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[ASSET EXTRACTOR] ${res.assets.length} imagens extraídas de ${res.pages_scanned} páginas (${sec}s)`,
      );
      return res.assets;
    });

    // 3. SEGMENTER
    const blocks = await runStage("segmenting", async () => {
      const started = Date.now();
      const bs = await runSegmenter(pages, profile);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`[SEGMENTER] total ${bs.length} blocos (${sec}s)`);
      return bs;
    });
    await supabase.from("extraction_jobs").update({ segmenter_blocks_json: blocks }).eq("id", jobId);

    // 3.5. MEDIA MAPPER (Claude maps now; DB write deferred until question_raw exists)
    const mediaMap = await runStage("mapping_media", async () => {
      if (assetManifest.length === 0) {
        console.log("[MEDIA MAPPER] sem assets — pulado");
        return [];
      }
      const started = Date.now();
      const m = await runMediaMapper(assetManifest, blocks, profile);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      const uniqueQuestions = new Set(m.map((x) => x.question_number)).size;
      console.log(
        `[MEDIA MAPPER] ${m.length} imagens mapeadas para ${uniqueQuestions} questões (${sec}s)`,
      );
      return m;
    });

    // 4. ASSEMBLER
    const questionsRaw = await runStage("assembling", async () => {
      const started = Date.now();
      const qs = await runAssembler(blocks, profile);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`[ASSEMBLER] total ${qs.length} questões brutas (${sec}s)`);
      return qs;
    });

    // Defensive: some chunks may return items with null/non-integer numero,
    // or numero outside the expected 1..objective_question_count range.
    // Drop those to avoid NOT-NULL-constraint violations on question_raw.
    const maxExpected = profile.objective_question_count ?? 90;
    const byNumero = new Map<number, AssembledQuestion>();
    let dropped = 0;
    for (const q of questionsRaw) {
      const n = typeof q.numero === "number" && Number.isInteger(q.numero) ? q.numero : NaN;
      if (!Number.isFinite(n) || n < 1 || n > maxExpected) {
        dropped++;
        continue;
      }
      // Keep the first occurrence per numero; later chunks can overlap.
      if (!byNumero.has(n)) byNumero.set(n, q);
    }
    const questions = [...byNumero.values()].sort((a, b) => a.numero - b.numero);
    console.log(
      `[ASSEMBLER] ${questions.length} questões válidas após dedup (descartadas: ${dropped})`,
    );

    // 5. INSERT question_raw
    const rows = questions.map((q) => ({
      exam_id: examId,
      job_id: jobId,
      numero: q.numero,
      question_type: q.question_type ?? "multiple_choice_single",
      shared_context: q.shared_context ?? null,
      stem: q.stem ?? "",
      options: q.options ?? null,
      note_e_adote: q.note_e_adote ?? null,
      source_pages: Array.isArray(q.source_pages) ? q.source_pages : null,
      confidence_score: typeof q.confidence === "number" ? Number(q.confidence.toFixed(2)) : null,
      status: "raw",
    }));
    if (rows.length) {
      const { error } = await supabase.from("question_raw").upsert(rows, { onConflict: "exam_id,numero" });
      if (error) throw new Error(`Falha upsert question_raw: ${error.message}`);
    }
    const flagged = questions.filter((q) => q.flagged).length;
    console.log(`[INSERT] ${rows.length} questões inseridas em question_raw, ${flagged} flagged`);

    await supabase.from("extraction_jobs").update({ extracted_questions: rows.length }).eq("id", jobId);

    // 5.5. Persist media mapping now that question_raw rows have IDs.
    if (mediaMap.length > 0) {
      const started = Date.now();
      const mappedQuestions = await persistMedia(examId, assetManifest, mediaMap);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`[MEDIA MAPPER] persistido: ${mappedQuestions} questões com mídia (${sec}s)`);
    }

    // 6. GABARITO LINKER
    let gabaritoOut: Awaited<ReturnType<typeof runGabaritoLinker>> | null = null;
    if (exam.gabarito_storage_path) {
      gabaritoOut = await runStage("linking_gabarito", async () => {
        const started = Date.now();
        const r = await runGabaritoLinker(examId, jobId, exam.gabarito_storage_path as string);
        const sec = ((Date.now() - started) / 1000).toFixed(1);
        console.log(
          `[GABARITO] ${Object.keys(r.gabarito.answers ?? {}).length} respostas extraídas, ${r.annulled} anuladas, ${r.answers_applied} aplicadas, ${r.issues_opened} issues (${sec}s)`,
        );
        return r;
      });
    } else {
      console.log("[GABARITO] sem gabarito_storage_path — pulado");
    }

    // 7. REVIEWER
    const reviewerOut = await runStage("reviewing", async () => {
      const started = Date.now();
      const r = await runReviewer(examId, jobId);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[REVIEWER] ${r.approved_clean} aprovadas sem issues, ${r.with_issues} com issues, ${r.total_issues} issues totais (${r.critical_issues} críticos, ${sec}s)`,
      );
      return r;
    });

    // 8. VALIDATOR (pure code)
    const validatorOut = await runStage("validating", async () => {
      const started = Date.now();
      const v = await runValidator(examId, jobId);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[VALIDATOR] ${v.approved} approved, ${v.flagged} flagged, ${v.total_issues} issues (${sec}s)`,
      );
      return v;
    });

    await supabase
      .from("extraction_jobs")
      .update({
        total_questions: rows.length,
        approved_questions: validatorOut.approved,
        flagged_questions: validatorOut.flagged,
      })
      .eq("id", jobId);

    // 9. ENRICHER
    const enricherOut = await runStage("enriching", async () => {
      const started = Date.now();
      const e = await runEnricher(examId);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`[ENRICHER] ${e.count} questões enriquecidas (${sec}s)`);
      return e;
    });

    // 10. INSERTER — move approved+enriched rows into questions.
    const { data: examMetaRow, error: examMetaErr } = await supabase
      .from("exams")
      .select("banca, ano, versao")
      .eq("id", examId)
      .single();
    if (examMetaErr || !examMetaRow) {
      throw new Error(`inserter exam meta: ${examMetaErr?.message ?? "not found"}`);
    }
    const examMeta: ExamMeta = {
      banca: examMetaRow.banca as string,
      ano: examMetaRow.ano as number,
      versao: (examMetaRow.versao as string | null) ?? null,
    };

    const inserterOut = await runStage("inserting", async () => {
      const started = Date.now();
      const r = await runInserter(examId, jobId, examMeta);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[INSERTER] ${r.inserted} inseridas, ${r.deduped_exact} duplicatas exatas, ${r.flagged_near_dup} prováveis (${sec}s)`,
      );
      if (r.skipped_no_enrichment > 0) {
        console.log(
          `[INSERTER] ${r.skipped_no_enrichment} puladas por falta de enrichment`,
        );
      }
      return r;
    });

    // 11. Mark done
    await supabase
      .from("extraction_jobs")
      .update({
        status: "done",
        current_stage: "done",
        completed_at: new Date().toISOString(),
        extracted_questions: rows.length,
      })
      .eq("id", jobId);

    const criticalTotal =
      reviewerOut.critical_issues +
      // validator issues default to low/medium/high; count those flagged as critical if any sneak in
      0;
    const distLine = Object.entries(enricherOut.by_subject)
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s} ${n}`)
      .join(", ");

    console.log(
      `\n[RESUMO] ${rows.length} extraídas, ${validatorOut.approved} approved, ${validatorOut.flagged} flagged, ${criticalTotal} com issues críticos`,
    );
    console.log(
      `[RESUMO] Inserter: ${inserterOut.inserted} inseridas em questions, ${inserterOut.deduped_exact} dedup exatas, ${inserterOut.flagged_near_dup} prováveis`,
    );
    console.log(`[RESUMO] Distribuição: ${distLine || "(sem classificações)"}`);

    console.log(`\n✅ Job ${jobId} done. ${rows.length} questões em question_raw. ${flagged} flagged.`);
    if (gabaritoOut) {
      console.log(`   ${gabaritoOut.answers_applied} gabaritos aplicados.`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Pipeline falhou: ${msg}`);
    await supabase.from("extraction_jobs").update({
      status: "error",
      errors_count: 1,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
    process.exit(1);
  }
}

const examId = process.argv[2];
if (!examId) {
  console.error("Uso: npx tsx scripts/extract-exam-local.ts <exam_id>");
  process.exit(1);
}

main(examId).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
