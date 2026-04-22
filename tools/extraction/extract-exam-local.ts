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
 *   npx tsx tools/extraction/extract-exam-local.ts <exam_id>
 */

import { createHash } from "node:crypto";
import dns from "node:dns";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  extractText,
  getDocumentProxy,
  getResolvedPDFJS,
  renderPageAsImage,
} from "unpdf";
import { PNG } from "pngjs";

dns.setDefaultResultOrder("ipv4first");

// ───────────────────── config ─────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co";
// Kept non-fatal at import time so helper-only consumers (check-state.ts,
// diag-vision-flag.ts) can import analyzePageText without needing the
// Anthropic key. runCli() below enforces them before doing anything that
// actually needs the clients.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const MODEL_SONNET = "claude-sonnet-4-5-20250929";
const MODEL_HAIKU = "claude-haiku-4-5-20251001";

// Issue types that block insertion into `questions` regardless of
// severity. Used by the validator to decide status='validated' vs
// 'flagged' and by the inserter to decide whether to skip a row.
const CRITICAL_ISSUE_TYPES = new Set([
  "contaminacao",
  "imagem_incorreta",
  "legenda_quebrada",
  "alternativas_incorretas",
  "gabarito_invalido",
  "duplicata_provavel",
]);

// Supabase fetch with retry: wraps the global fetch so every query the
// supabase-js client issues survives transient DNS / connection hiccups
// (ENOTFOUND, ECONNRESET, "DNS cache overflow", UND_ERR_*) without each
// call-site having to know about it. Also inspects err.cause because
// undici nests the real network error one level down while the outer
// Error message is a generic "fetch failed".
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

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: supabaseFetch },
});

// Call-site retry for supabase-js operations that surface transient errors
// (e.g. "DNS cache overflow" from Node's c-ares resolver under load) as
// `{ error: { message: ... } }` instead of throwing. The fetch wrapper
// above only sees errors that bubble up through fetch itself — some paths
// in postgrest-js swallow the throw and return it as an error object,
// bypassing the retry entirely. Wrapping the call site catches those too.
const SUPABASE_OP_RETRIES = 6;
async function withSupaRetry<T>(
  label: string,
  op: () => PromiseLike<{ error: { message: string } | null; data?: T | null }>,
): Promise<T | null> {
  const transient =
    /DNS cache overflow|ENOTFOUND|ECONNRESET|FetchError|fetch failed|UND_ERR|ETIMEDOUT|socket hang up|EAI_AGAIN|other side closed/i;
  let lastMsg = "";
  for (let attempt = 0; attempt < SUPABASE_OP_RETRIES; attempt++) {
    const { error, data } = await op();
    if (!error) return (data ?? null) as T | null;
    lastMsg = error.message;
    if (!transient.test(lastMsg)) {
      throw new Error(`${label}: ${lastMsg}`);
    }
    const delay = 500 * Math.pow(2, Math.min(attempt, 5));
    console.warn(
      `[SUPABASE-OP] ${label}: ${lastMsg} — retry ${attempt + 1}/${SUPABASE_OP_RETRIES} em ${delay}ms`,
    );
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(`${label}: ${lastMsg} (esgotadas ${SUPABASE_OP_RETRIES} tentativas)`);
}

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
  running_header?: string;
  running_footer?: string;
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
  // Supabase storage occasionally returns 503 Service Unavailable as a
  // non-throwing error payload (data=null, error.message="Service
  // Unavailable"). supabaseFetch wraps fetch, not .storage.download(), so
  // those bypass every other retry path and kill the pipeline mid-run.
  // Retry transient failures here with the same exponential budget used for
  // the REST client (~10 min cap).
  const transient = /Service Unavailable|temporar|timeout|ECONNRESET|fetch failed|network|503|502|504|429|DNS/i;
  let lastErr = "unknown error";
  for (let attempt = 0; attempt < SUPABASE_FETCH_RETRIES; attempt++) {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (!error && data) return new Uint8Array(await data.arrayBuffer());
      lastErr = error?.message ?? "no data returned";
      if (!transient.test(lastErr)) {
        throw new Error(`Falha ao baixar PDF ${bucket}/${path}: ${lastErr}`);
      }
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (!transient.test(lastErr)) throw e;
    }
    const delay = Math.min(500 * Math.pow(2, attempt), SUPABASE_FETCH_MAX_DELAY_MS);
    console.warn(
      `[downloadPdf] transient ${lastErr} — retry ${attempt + 1}/${SUPABASE_FETCH_RETRIES} em ${delay}ms`,
    );
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(
    `Falha ao baixar PDF ${bucket}/${path} após ${SUPABASE_FETCH_RETRIES} tentativas: ${lastErr}`,
  );
}

async function extractPdfPages(buffer: Uint8Array): Promise<ParsedPage[]> {
  const pdf = await getDocumentProxy(buffer);
  const result = await extractText(pdf, { mergePages: false });
  const rawPages: string[] = Array.isArray(result.text)
    ? result.text
    : [String(result.text ?? "")];
  return rawPages.map((text, i) => ({ page_number: i + 1, text: text ?? "" }));
}

// ───────────────────── vision fallback for broken PDF text encoding ─────────────────────
//
// Math / physics / chemistry exams routinely embed formulas with custom fonts:
// the PDF renders fine visually but unpdf pulls back Private Use Area glyphs
// (U+E000–U+F8FF), U+FFFD replacements, or stray characters from exotic
// Unicode blocks (Ethiopic, Myanmar, …) that have no business appearing in a
// Portuguese exam. Examples from real Fuvest runs: 2025 q69 ("𝑂𝑥𝑦, ሺ, ሻ"),
// 2026 q16/q36/q67 (¬ where "→" was expected), 2022 q74 ("4 × 10⁻¹³" OK but
// neighbouring chars broken), 2021 whose entire extraction is unusable.
//
// analyzePageText classifies each page by looking at its text; when the ratio
// of problematic chars is high we re-render that page to PNG and ask Claude
// Vision to transcribe it with LaTeX-aware notation. The replacement text is
// swapped into the ParsedPage, so every downstream agent sees clean text.

export const VISION_PUA_THRESHOLD = 10;
export const VISION_RATIO_THRESHOLD = 0.03;
// Characters from non-Latin blocks (Ethiopic, CJK, …) in a Portuguese exam
// are almost always a ToUnicode-table miss masquerading as a real codepoint.
// We keep a low absolute floor so even a math question with 3-5 of them
// gets re-transcribed.
export const VISION_EXOTIC_THRESHOLD = 3;
// Latin-1 supplement symbols that essentially never appear in real Brazilian
// exam prose but show up in bulk when a CMap maps a whitespace glyph to
// NOT SIGN (¬) or similar placeholder. Fuvest 2026 has >700 ¬ per page.
export const VISION_SUBST_THRESHOLD = 10;
const VISION_MIN_CHARS = 200;
const SUBSTITUTION_CHARS = new Set<number>([
  0x00a6, // ¦ BROKEN BAR
  0x00ac, // ¬ NOT SIGN
]);
const VISION_RENDER_SCALE = 2.0;
const VISION_MODEL = MODEL_SONNET;
const VISION_MAX_TOKENS = 8192;

const VISION_SYSTEM = `Transcreva o texto desta página de prova de vestibular.
Mantenha a formatação original (parágrafos, numeração de questões, marcadores
de alternativas "(A) (B) (C) (D) (E)" ou "A) B) …"). Preserve fórmulas
matemáticas usando notação LaTeX inline ($...$ para inline, $$...$$ para
deslocado). Preserve sobrescritos/subscritos (ex.: x^2, H_2O), letras gregas
(α, β, π, Ω, ∫, √), símbolos de comparação (≤ ≥ ≠ ≈), setas (→, ⇌, ↔).
Preserve legendas de figuras entre [FIG:...] se houver. Mantenha a numeração
das questões (ex.: {16}, {36}, 16., Questão 16). Retorne APENAS o texto
transcrito, sem comentários ou explicações.`;

// Unicode blocks that should never appear in a Brazilian exam. If we see
// anything from these ranges it almost always means a custom font was picked
// up as a glyph index rather than mapped through the ToUnicode table.
const EXOTIC_BLOCKS: Array<[number, number, string]> = [
  [0x1200, 0x137f, "Ethiopic"],
  [0x1000, 0x109f, "Myanmar"],
  [0x0900, 0x097f, "Devanagari"],
  [0x0e00, 0x0e7f, "Thai"],
  [0x4e00, 0x9fff, "CJK"],
  [0x3040, 0x309f, "Hiragana"],
  [0x30a0, 0x30ff, "Katakana"],
  [0xac00, 0xd7af, "Hangul"],
  // Arabic Presentation Forms-A / B — Fuvest math fonts leak into these.
  [0xfb50, 0xfdff, "Arabic-PF-A"],
  [0xfe70, 0xfeff, "Arabic-PF-B"],
];

export interface PageAnalysis {
  puaCount: number;
  replacementCount: number;
  exoticCount: number;
  substCount: number;
  exoticBlocks: string[];
  totalPrintable: number;
  problematicRatio: number;
  needsVision: boolean;
  reason: string | null;
}

export function analyzePageText(text: string): PageAnalysis {
  let puaCount = 0;
  let replacementCount = 0;
  let exoticCount = 0;
  let substCount = 0;
  let totalPrintable = 0;
  const exoticBlocks = new Set<string>();

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 32) continue; // whitespace / control
    totalPrintable++;
    if (code >= 0xe000 && code <= 0xf8ff) {
      puaCount++;
      continue;
    }
    if (code === 0xfffd) {
      replacementCount++;
      continue;
    }
    if (SUBSTITUTION_CHARS.has(code)) {
      substCount++;
      continue;
    }
    for (const [lo, hi, label] of EXOTIC_BLOCKS) {
      if (code >= lo && code <= hi) {
        exoticCount++;
        exoticBlocks.add(label);
        break;
      }
    }
  }

  const problematic = puaCount + replacementCount + exoticCount + substCount;
  const ratio = totalPrintable > 0 ? problematic / totalPrintable : 0;
  let reason: string | null = null;
  let needsVision = false;

  if (puaCount >= VISION_PUA_THRESHOLD) {
    needsVision = true;
    reason = `${puaCount} chars PUA (≥${VISION_PUA_THRESHOLD})`;
  } else if (replacementCount >= VISION_PUA_THRESHOLD) {
    needsVision = true;
    reason = `${replacementCount} replacement chars (≥${VISION_PUA_THRESHOLD})`;
  } else if (exoticCount >= VISION_EXOTIC_THRESHOLD) {
    needsVision = true;
    reason = `${exoticCount} chars de blocos exóticos (${
      Array.from(exoticBlocks).join(",")
    }) — ≥${VISION_EXOTIC_THRESHOLD}`;
  } else if (substCount >= VISION_SUBST_THRESHOLD) {
    needsVision = true;
    reason = `${substCount} chars de substituição (¬/¦) — ≥${VISION_SUBST_THRESHOLD}`;
  } else if (
    totalPrintable >= VISION_MIN_CHARS &&
    ratio >= VISION_RATIO_THRESHOLD
  ) {
    needsVision = true;
    reason = `${(ratio * 100).toFixed(1)}% chars problemáticos (≥${
      VISION_RATIO_THRESHOLD * 100
    }%)`;
  }

  return {
    puaCount,
    replacementCount,
    exoticCount,
    substCount,
    exoticBlocks: Array.from(exoticBlocks),
    totalPrintable,
    problematicRatio: ratio,
    needsVision,
    reason,
  };
}

async function renderPagePng(
  pdfBuffer: Uint8Array,
  pageNumber: number,
  scale = VISION_RENDER_SCALE,
): Promise<Buffer> {
  // unpdf 0.12.x option is `canvas` (a factory returning @napi-rs/canvas);
  // newer unpdf renames it to `canvasImport`. We target 0.12.x.
  //
  // pdfjs transfers the buffer into its worker each call and detaches the
  // caller's view. Slice() a fresh copy for every page so the next
  // iteration still has a live buffer to hand to renderPageAsImage.
  const fresh = pdfBuffer.slice();
  const ab = await renderPageAsImage(fresh, pageNumber, {
    scale,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvas: () => import("@napi-rs/canvas") as any,
  });
  return Buffer.from(ab);
}

export async function transcribeWithVision(
  pngBuffer: Buffer,
  pageNumber: number,
): Promise<string> {
  const base64 = pngBuffer.toString("base64");
  const res = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: VISION_MAX_TOKENS,
    system: VISION_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: base64 },
          },
          {
            type: "text",
            text: `Transcreva a página ${pageNumber} desta prova.`,
          },
        ],
      },
    ],
  });
  const parts: string[] = [];
  for (const block of res.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n").trim();
}

export interface VisionFallbackResult {
  pages: ParsedPage[];
  analyses: PageAnalysis[];
  rewritten: number[];
}

export async function runVisionFallback(
  pages: ParsedPage[],
  pdfBuffer: Uint8Array,
): Promise<VisionFallbackResult> {
  const analyses = pages.map((p) => analyzePageText(p.text));
  const targets = pages
    .map((p, i) => ({ p, analysis: analyses[i], idx: i }))
    .filter((x) => x.analysis.needsVision);

  if (targets.length === 0) {
    return { pages, analyses, rewritten: [] };
  }

  console.log(
    `[VISION] ${targets.length}/${pages.length} página(s) flaggada(s) para Vision:`,
  );
  for (const t of targets) {
    console.log(
      `[VISION]   página ${t.p.page_number}: ${t.analysis.reason}` +
        (t.analysis.exoticBlocks.length
          ? ` (blocos: ${t.analysis.exoticBlocks.join(",")})`
          : ""),
    );
  }

  const rewritten: number[] = [];
  const outPages = pages.slice();
  for (const t of targets) {
    const pn = t.p.page_number;
    try {
      const png = await renderPagePng(pdfBuffer, pn);
      const newText = await transcribeWithVision(png, pn);
      if (!newText || newText.length < VISION_MIN_CHARS / 4) {
        console.warn(
          `[VISION] página ${pn}: Vision devolveu texto curto (${newText.length} chars) — mantendo original`,
        );
        continue;
      }
      outPages[t.idx] = { page_number: pn, text: newText };
      rewritten.push(pn);
      console.log(
        `[VISION] página ${pn} re-extraída via Vision (${t.analysis.reason} → ${newText.length} chars)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[VISION] página ${pn} falhou: ${msg} — mantendo texto original`);
    }
  }

  return { pages: outPages, analyses, rewritten };
}

function chunkPages<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ───────────────────── deterministic question-marker scanner ─────────────────────
//
// Greps the pre-parsed page text for lines that look like a standalone
// question number: "01", "{01}", "01.", "01)", or their 1-3 digit variants.
// The result is the longest strictly-ascending sequence that starts at 1
// — this rejects stray numerics (years like "2024", section codes, page
// numbers that slipped past the header stripper) while tolerating the
// different numbering styles used across Fuvest cadernos (2022-24 uses
// plain "01", 2025-26 uses "{01}").
//
// Returned markers are used two ways:
//   1. After the profiler, if scan count is materially higher than
//      profile.objective_question_count, we override — this caught the
//      Fuvest 2026 case where the profiler under-reported 35 vs real 90.
//   2. After the segmenter, stems/question_starts with null question_hint
//      are backfilled by finding the latest marker at or before the
//      block's (page, line_start).
export interface QuestionMarker {
  page: number;
  line: number;
  n: number;
}

export function scanQuestionMarkers(pages: ParsedPage[]): QuestionMarker[] {
  const candidates: QuestionMarker[] = [];
  // Accepted forms on their own line (after trim): {NN}, NN, NN., NN)
  const re = /^\s*(?:\{(\d{1,3})\}|(\d{1,3})[.)]?)\s*$/;
  for (const p of pages) {
    const lines = p.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      const n = parseInt(m[1] ?? m[2], 10);
      // Years and arbitrary numeric citations fall outside this range.
      if (!Number.isFinite(n) || n < 1 || n > 200) continue;
      candidates.push({ page: p.page_number, line: i + 1, n });
    }
  }
  candidates.sort((a, b) => a.page - b.page || a.line - b.line);
  const markers: QuestionMarker[] = [];
  let expected = 1;
  for (const c of candidates) {
    // Strict ascending: only accept when we land exactly on `expected`.
    // A single missed marker just delays progress — it doesn't contaminate
    // the result with noise.
    if (c.n === expected) {
      markers.push(c);
      expected++;
    }
  }
  return markers;
}

// ───────────────────── profiler ─────────────────────
const PROFILE_SYSTEM = `Você é um profiler de provas de vestibulares brasileiros.
Receba texto extraído e retorne análise estrutural via a tool submit_profile.
NÃO extraia questões.
Se texto vazio/ilegível: source_type = 'pdf_scanned'.

CABEÇALHO/RODAPÉ RECORRENTE: se alguma string aparece no topo ou
rodapé de TODAS ou quase todas as páginas (ex.: "FUVEST 2025",
"PROVA DE CONHECIMENTOS GERAIS", nome do caderno), preencha
"running_header" com esse texto exato. Mesmo para rodapé →
"running_footer". Omita (ou deixe vazio) se não houver repetição clara.
Não inclua texto de questão nem números de página individuais.`;

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
    running_header: { type: "string" },
    running_footer: { type: "string" },
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

REGRAS CRÍTICAS — respeite rigorosamente:

1. IGNORE CABEÇALHOS/RODAPÉS DE PÁGINA. Linhas com o título da prova
   repetido em todas as páginas (ex.: "FUVEST 2025", "PROVA DE
   CONHECIMENTOS GERAIS"), números de página isolados (ex.: "14"),
   URLs de rodapé, logos textuais — NÃO incluem em nenhum bloco.
   O campo "running_header" / "running_footer" do Profile (se
   presente no input) lista o texto exato a ignorar.

2. STEM É UM ÚNICO BLOCO POR QUESTÃO. Para cada questão emita
   EXATAMENTE UM bloco type="stem" cobrindo TODAS as linhas entre o
   marcador de início da questão e a PRIMEIRA alternativa "(A)" ou "A)".
   Inclua parágrafos múltiplos, citações literais, versos, equações —
   tudo que vem ANTES de (A). NUNCA quebre o stem em vários blocos stem.

   FORMAS DE MARCADOR DE QUESTÃO aceitas (identifique TODAS):
     - "{27}" ou "{ 27 }" (entre chaves)
     - "27." ou "27)" ou "27 –"
     - "27" SOZINHO em uma linha (sem texto antes ou depois) — MUITO COMUM.
       Se ver uma linha com apenas 1-3 dígitos ("01", "27", "90") e não for
       número de página/cabeçalho, trate como marcador de questão.
     - "Questão 27" / "QUESTÃO 27."
   Sempre que identificar um marcador, preencha question_hint com o
   número EM TODOS os blocos pertencentes àquela questão: stem,
   option_item (A..E), figure_ref, caption, source_reference, note_e_adote.
   NUNCA deixe question_hint null em um stem ou question_start.

3. STEM NUNCA É VAZIO. line_end >= line_start SEMPRE. Se não houver
   linhas entre o marcador da questão e (A), NÃO emita bloco stem.

4. SHARED_CONTEXT É SEPARADO DO STEM. Só classifique como
   shared_context um bloco explicitamente marcado como "TEXTO PARA AS
   QUESTÕES X A Y" ou um bloco de contexto claramente separado ANTES
   do marcador da primeira questão do grupo. Se texto aparece APÓS
   o marcador {NN} e antes de (A), é STEM — não shared_context.

5. NÃO MISTURE QUESTÕES em layout de 2 colunas.

6. Um bloco fica dentro de uma única página. Se trecho atravessa
   páginas, gere um bloco por página (mesmo type, mesmo question_hint).

7. Blocos ambíguos: flagged = true.

Campos:
- block_id: identificador sequencial (será reatribuído depois).
- type: um dos tipos listados acima.
- question_hint: número da questão a que o bloco pertence (ou null).
- page: número da página (o que aparece em "=== Página N ===").
- line_start / line_end: números das linhas (Lx) inclusive, dentro da
  página. line_end >= line_start SEMPRE.
- label: para option_item, a letra/rótulo exatamente como aparece
  (A, B, C, D, E, a), ...); caso contrário null.
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
    running_header: p.running_header,
    running_footer: p.running_footer,
  });
}

// Strip lines that match a known page-level running header/footer or
// are isolated page numbers. Preserves line count by leaving blank
// lines in place — downstream Lx line numbering stays stable.
function stripRunningHeaders(
  pages: ParsedPage[],
  profile: ProfileResult,
  preserveLines: ReadonlySet<string> = new Set(),
): ParsedPage[] {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const header = profile.running_header ? norm(profile.running_header) : "";
  const footer = profile.running_footer ? norm(profile.running_footer) : "";
  const isPageNumber = (s: string) => /^\s*\d{1,3}\s*$/.test(s);
  return pages.map((p) => {
    const lines = p.text.split("\n");
    const cleaned = lines.map((line, i) => {
      // Protect lines that the deterministic scanner identified as question
      // markers. Without this, Fuvest 2022-24 cadernos have their bare "01",
      // "02", ... markers replaced with empty strings (they match the
      // page-number pattern), and the segmenter can no longer attribute
      // question_hint, collapsing 90 questions into 25-28.
      if (preserveLines.has(`${p.page_number}:${i + 1}`)) return line;
      const n = norm(line);
      if (!n) return line;
      if (header && n === header) return "";
      if (footer && n === footer) return "";
      if (isPageNumber(line)) return "";
      return line;
    });
    return { page_number: p.page_number, text: cleaned.join("\n") };
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
        // Sonnet is materially more reliable than Haiku at emitting stem
        // blocks and attributing question_hint on Fuvest 2022-24 cadernos
        // where the question marker is just a bare "01"/"02"/... on its
        // own line. Haiku's failure mode there was dropping the stem
        // entirely or leaving question_hint=null. Cost difference is
        // negligible at ~10 chunks/prova.
        model: MODEL_SONNET,
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

REGRAS CRÍTICAS:
- O stem NUNCA começa com "(A)" / "A)" / outro rótulo de alternativa.
  Se isso acontecer nos blocos recebidos, o bloco correto de stem é o
  shared_context (faça a troca: use shared_context como stem, e deixe
  shared_context=null a menos que haja OUTRO bloco shared_context).
- NÃO inclua cabeçalhos/rodapés de página ("FUVEST 2025", números de
  página isolados, etc.) em stem nem em shared_context.
- Se um bloco stem está vazio mas existe shared_context, promova o
  shared_context a stem (único) e defina shared_context=null.

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

// "TEXTO PARA AS QUESTÕES 27 A 29" / "... DE 27 A 29" / "... 37 E 38" / "{27}".
// Returns the list of question numbers referenced in the first few lines of
// the shared_context block, or [] if no explicit reference.
function parseSharedContextRange(text: string): number[] {
  const head = text.split("\n").slice(0, 3).join(" ").toUpperCase();
  const mRange = head.match(
    /TEXTO PARA (?:AS?\s+)?QUEST[ÕO]ES?(?:\s+DE)?\s+(\d{1,3})\s*(?:A|-|–|—|ATÉ)\s*(\d{1,3})/,
  );
  if (mRange) {
    const a = parseInt(mRange[1], 10);
    const b = parseInt(mRange[2], 10);
    if (b >= a && b - a < 20) return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  const mPair = head.match(/QUEST[ÕO]ES?\s+(\d{1,3})\s+E\s+(\d{1,3})/);
  if (mPair) return [parseInt(mPair[1], 10), parseInt(mPair[2], 10)];
  const mSingle = text.match(/\{(\d{1,3})\}/);
  if (mSingle) return [parseInt(mSingle[1], 10)];
  return [];
}

// Attach orphan shared_context blocks (question_hint=null) to the question
// numbers they apply to. Emits a COPY of the block with question_hint set
// per affected numero so `blocksByNumero` picks it up for the assembler.
//
// Resolution order per orphan:
//   1. Explicit "QUESTÕES X A Y" / "X E Y" / "{X}" header in the block text.
//   2. Fallback: the next N question stems on the same or following page,
//      where N is 2 (minimum shareable group). This keeps the behavior
//      conservative — if the segmenter didn't emit a range header we only
//      propagate to the closest 2 stems after the block, avoiding false
//      positives on contextless figures.
function propagateSharedContext(blocks: Block[]): Block[] {
  const out: Block[] = [...blocks];
  // Map of stem/question_start blocks by numero so we can find "next stems".
  const stems = blocks
    .filter(
      (b) => (b.type === "stem" || b.type === "question_start") && typeof b.question_hint === "number",
    )
    .sort((a, b) => {
      const ap = a.page ?? 0;
      const bp = b.page ?? 0;
      if (ap !== bp) return ap - bp;
      return (a.line_start ?? 0) - (b.line_start ?? 0);
    });

  let propagated = 0;
  for (const b of blocks) {
    if (b.type !== "shared_context") continue;
    if (typeof b.question_hint === "number") continue;

    // 1. Explicit range in text.
    let numeros = parseSharedContextRange(b.text);

    // 2. Fallback: next 2 stems on same or following page (after this block).
    if (numeros.length === 0) {
      const bp = b.page ?? 0;
      const bl = b.line_start ?? 0;
      const following = stems.filter((s) => {
        const sp = s.page ?? 0;
        if (sp < bp) return false;
        if (sp === bp && (s.line_start ?? 0) < bl) return false;
        if (sp > bp + 1) return false;
        return true;
      });
      numeros = following.slice(0, 2).map((s) => s.question_hint as number);
    }

    // Deduplicate and drop invalid.
    numeros = [...new Set(numeros.filter((n) => Number.isFinite(n) && n > 0))];
    if (numeros.length === 0) continue;

    for (const n of numeros) {
      out.push({ ...b, question_hint: n });
      propagated++;
    }
  }
  if (propagated > 0) {
    console.log(
      `[ASSEMBLER] propagateSharedContext: ${propagated} shared_context attachments across questions`,
    );
  }
  return out;
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

// Belt-and-suspenders: strip known running headers from a text field
// and normalize whitespace. Safe no-op if no header is declared.
function stripHeadersFromText(text: string | null, profile: ProfileResult): string | null {
  if (!text) return text;
  const header = profile.running_header?.trim();
  const footer = profile.running_footer?.trim();
  const patterns = [header, footer].filter((s): s is string => !!s);
  let out = text;
  for (const pat of patterns) {
    // Escape regex specials, then build a case-insensitive whole-line matcher.
    const esc = pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|\\n)\\s*${esc}\\s*(?=\\n|$)`, "gi"), "$1");
  }
  // Collapse runs of blank lines left by stripping.
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

// Heuristic: does text start with an option label like "(A)", "A)" or
// similar? We only swap when configured patterns match.
function stemStartsWithOption(stem: string): boolean {
  const s = stem.trim();
  return /^\(?[A-Ea-e]\)\s+\S/.test(s);
}

// Words that a stem should NEVER end with. If the last token on the stem
// matches one of these, the segmenter likely cut the stem mid-sentence at a
// page/column break. We can't recover the missing text, but we can normalize
// whitespace / remove trailing truncation artifacts so the validator's
// heuristic doesn't fire on well-formed-but-short questions.
const TRUNCATION_TRAILING = new RegExp(
  "[\\s,;:]*\\b(que|e|ou|de|do|da|dos|das|em|na|no|nas|nos|a|o|as|os|por|para|com|" +
    "sem|sobre|como|seguinte|seguintes|entre|ante|após|até|contra|desde|durante|" +
    "mediante|perante|segundo|sob|traás|última|último|primeira|primeiro)[\\s]*[:,;—–-]?[\\s]*$",
  "i",
);

// Collapse whitespace, trim trailing punctuation that looks like an
// unfinished clause. Returns a normalized stem. Does NOT change semantics
// when the stem is well-formed.
function trimDanglingConnector(stem: string): string {
  let s = stem.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  // If the final line ends with a bare connector AND the previous line is
  // non-trivial, drop the dangling trailer — this converts eg. "... analise
  // o texto e" into "... analise o texto." (readable without losing info).
  const lines = s.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (TRUNCATION_TRAILING.test(last)) {
      lines[lines.length - 1] = last.replace(TRUNCATION_TRAILING, "").replace(/[,;:—–-]+$/g, "");
      if (lines[lines.length - 1].length === 0) lines.pop();
    }
  }
  s = lines.join("\n");
  return s;
}

function postProcessAssembled(q: AssembledQuestion, profile: ProfileResult): AssembledQuestion {
  const out = { ...q };
  out.stem = stripHeadersFromText(out.stem, profile) ?? "";
  out.shared_context = stripHeadersFromText(out.shared_context, profile) ?? null;

  // Trim dangling connectors produced by page/column breaks.
  out.stem = trimDanglingConnector(out.stem);
  if (out.shared_context) {
    out.shared_context = trimDanglingConnector(out.shared_context);
  }

  // Normalize option labels: strip surrounding parens/brackets so
  // gabarito "A" compares cleanly against option.label "A"
  // (segmenter sometimes emits "(A)" verbatim).
  if (Array.isArray(out.options)) {
    out.options = out.options.map((o) => ({
      ...o,
      label: String(o?.label ?? "").replace(/[()[\]]/g, "").trim(),
    }));
  }

  // ASM-2: if stem starts with an option label and shared_context has
  // real text, swap them. This corrects a common segmenter bug where
  // the first option line was promoted to stem and the real stem went
  // into shared_context.
  if (
    stemStartsWithOption(out.stem) &&
    out.shared_context &&
    out.shared_context.trim().length >= 20
  ) {
    const newStem = out.shared_context.trim();
    out.shared_context = null;
    out.stem = newStem;
  }

  // SEG-4 fallback: if stem is trivially small but shared_context has
  // meaningful text, promote shared_context to stem.
  if (out.stem.trim().length < 20 && out.shared_context && out.shared_context.trim().length >= 40) {
    out.stem = out.shared_context.trim();
    out.shared_context = null;
  }

  return out;
}

async function runAssembler(blocks: Block[], profile: ProfileResult): Promise<AssembledQuestion[]> {
  const withSharedCtx = propagateSharedContext(blocks);
  const byNumero = blocksByNumero(withSharedCtx);
  const numeros = [...byNumero.keys()].sort((a, b) => a - b);
  console.log(`[ASSEMBLER] ${numeros.length} questões para montar (parallel=${ASSEMBLER_PARALLELISM})`);

  const out: AssembledQuestion[] = [];
  for (let i = 0; i < numeros.length; i += ASSEMBLER_PARALLELISM) {
    const slice = numeros.slice(i, i + ASSEMBLER_PARALLELISM);
    const batchStarted = Date.now();
    const results = await Promise.all(
      slice.map((n) => assembleOneQuestion(n, byNumero.get(n) ?? [], profile)),
    );
    for (const r of results) if (r) out.push(postProcessAssembled(r, profile));
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

ATENÇÃO question_type='multiple_choice_image_options': as alternativas
são IMAGENS (gráficos, figuras). É ESPERADO que o texto das alternativas
esteja em branco ou seja trivial (ex.: "A)"). NÃO reporte
alternativa_vazia, alternativas_incorretas nem texto_truncado para
alternativas desse tipo de questão — o conteúdo visual está no
media_map e será revisado manualmente.

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
  question_type?: string | null;
}

async function reviewBatch(batch: QuestionForReview[]): Promise<ReviewItem[]> {
  const payload = batch.map((q) => ({
    numero: q.numero,
    question_type: q.question_type ?? "multiple_choice_single",
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
    .select("id, numero, stem, options, correct_answer, shared_context, question_type")
    .eq("exam_id", examId)
    .eq("status", "validated")
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
    const hasBlockingIssue = issues.some(
      (i) =>
        i.severity === "high" ||
        i.severity === "critical" ||
        ["contaminacao", "alternativas_incorretas", "gabarito_invalido"].includes(i.issue_type),
    );

    const nextStatus = r.approved && !hasBlockingIssue ? "approved" : "flagged";
    const update: Record<string, unknown> = { status: nextStatus };
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

// Detects a multi-line block that looks entirely like charts/graphs
// (q69 / q60 style where each option is an image). Used by the
// validator to tag question_type and permit insertion with a
// needs_manual_review flag instead of blocking on empty text.
function looksLikeImageOptions(options: AssembledOption[]): boolean {
  if (options.length < 2) return false;
  let shortCount = 0;
  for (const o of options) {
    const text = String(o?.text ?? "").trim();
    // Consider "empty-ish": no text, or just the label (e.g., "A)"),
    // or a single word shorter than 4 chars.
    if (text.length <= 3) shortCount++;
  }
  return shortCount >= Math.ceil(options.length * 0.8);
}

function headerContaminates(text: string | null, header: string | null): boolean {
  if (!text || !header) return false;
  const h = header.trim();
  if (h.length < 4) return false;
  return text.toLowerCase().includes(h.toLowerCase());
}

async function runValidator(
  examId: string,
  jobId: string,
  profile: ProfileResult | null,
): Promise<ValidatorSummary> {
  const { data, error } = await supabase
    .from("question_raw")
    .select(
      "id, numero, stem, shared_context, options, correct_answer, confidence_score, question_type",
    )
    .eq("exam_id", examId)
    .eq("status", "raw")
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

  const runningHeader = profile?.running_header ?? null;
  const runningFooter = profile?.running_footer ?? null;

  let approved = 0;
  let flagged = 0;
  const issues: Record<string, unknown>[] = [];

  for (const q of questions) {
    const problems: Array<{ issue_type: string; severity: string; description: string }> = [];
    const opts = Array.isArray(q.options) ? (q.options as AssembledOption[]) : [];
    const isImageOptions = looksLikeImageOptions(opts);

    // If the assembler did not tag it but the shape looks like image
    // options, promote the question_type here so the reviewer sees it.
    const detectedQuestionType = isImageOptions
      ? "multiple_choice_image_options"
      : String(q.question_type ?? "multiple_choice_single");
    const needsManualReview = isImageOptions;

    let stem = String(q.stem ?? "");
    let sharedContext = q.shared_context as string | null;

    // Auto-swap: if validator sees stem starting with an option label
    // while shared_context has real text, swap them (assembler already
    // tries this, but this is a last-chance safety net).
    let stemIsOption = false;
    if (stemStartsWithOption(stem) && sharedContext && sharedContext.trim().length >= 20) {
      const newStem = sharedContext.trim();
      sharedContext = null;
      stem = newStem;
      stemIsOption = true;
    }

    // Auto-promote SC -> stem when stem is trivially small.
    let promotedFromSharedContext = false;
    if (
      stem.trim().length < 20 &&
      sharedContext &&
      sharedContext.trim().length >= 40
    ) {
      stem = sharedContext.trim();
      sharedContext = null;
      promotedFromSharedContext = true;
    }

    // Persist the swap/promotion/type updates on question_raw so
    // downstream stages see the corrected shape.
    const mutated =
      stemIsOption ||
      promotedFromSharedContext ||
      detectedQuestionType !== (q.question_type ?? "multiple_choice_single") ||
      needsManualReview;
    if (mutated) {
      const upd: Record<string, unknown> = {
        stem,
        shared_context: sharedContext,
        question_type: detectedQuestionType,
      };
      if (needsManualReview) upd.needs_manual_review = true;
      await supabase.from("question_raw").update(upd).eq("id", q.id);
    }

    if (stem.trim().length < 20) {
      problems.push({
        issue_type: "texto_truncado",
        severity: "high",
        description: `stem com apenas ${stem.trim().length} chars (mínimo 20)`,
      });
    }

    // Header contamination (non-blocking, low severity).
    if (headerContaminates(stem, runningHeader) || headerContaminates(stem, runningFooter)) {
      problems.push({
        issue_type: "texto_truncado",
        severity: "low",
        description: "stem contém cabeçalho/rodapé de página",
      });
    }
    if (
      headerContaminates(sharedContext, runningHeader) ||
      headerContaminates(sharedContext, runningFooter)
    ) {
      problems.push({
        issue_type: "texto_truncado",
        severity: "low",
        description: "shared_context contém cabeçalho/rodapé de página",
      });
    }

    if (stemIsOption) {
      problems.push({
        issue_type: "texto_truncado",
        severity: "low",
        description: "stem original começava com rótulo de alternativa; shared_context promovido a stem",
      });
    }

    if (promotedFromSharedContext) {
      problems.push({
        issue_type: "texto_truncado",
        severity: "low",
        description: "stem estava vazio/trivial; shared_context promovido a stem",
      });
    }

    if (opts.length !== 5) {
      problems.push({
        issue_type: "alternativa_faltante",
        severity: "high",
        description: `options tem ${opts.length} elementos (esperado 5)`,
      });
    } else if (!isImageOptions) {
      // Só cobre alternativa_vazia para questões de texto.
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
    } else {
      // Alternativas-imagem: labels devem existir mas texto pode estar vazio.
      for (let i = 0; i < opts.length; i++) {
        const label = String(opts[i]?.label ?? "").trim();
        if (!label) {
          problems.push({
            issue_type: "alternativa_faltante",
            severity: "high",
            description: `option[${i}] label vazio em questão image_options`,
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

    if ((stemCount.get(String(q.stem ?? "").trim()) ?? 0) > 1) {
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

    // Passed = nenhum problema BLOQUEANTE (high/critical ou tipo crítico).
    const hasBlocker = problems.some(
      (p) =>
        p.severity === "high" ||
        p.severity === "critical" ||
        CRITICAL_ISSUE_TYPES.has(p.issue_type),
    );
    const passed = !hasBlocker;
    const validator_result = {
      passed,
      checked_at: new Date().toISOString(),
      question_type: detectedQuestionType,
      needs_manual_review: needsManualReview,
      checks: {
        stem_length: stem.trim().length,
        options_count: opts.length,
        correct_answer_valid: !!ans && (ans === "*" || labels.includes(ans)),
        confidence: Number.isFinite(conf) ? conf : null,
        duplicate_stem: (stemCount.get(String(q.stem ?? "").trim()) ?? 0) > 1,
        image_options: isImageOptions,
        header_contamination:
          headerContaminates(stem, runningHeader) ||
          headerContaminates(stem, runningFooter) ||
          headerContaminates(sharedContext, runningHeader) ||
          headerContaminates(sharedContext, runningFooter),
      },
      issues: problems,
    };

    await supabase
      .from("question_raw")
      .update({
        status: passed ? "validated" : "flagged",
        validator_result,
      })
      .eq("id", q.id);

    if (passed) {
      approved++;
    } else {
      flagged++;
    }

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
      "id, numero, stem, options, shared_context, note_e_adote, correct_answer, source_pages, confidence_score, enrichment, media_map, question_type, needs_manual_review",
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
        question_type: (q.question_type as string | null) ?? "multiple_choice_single",
        needs_manual_review: (q.needs_manual_review as boolean | null) ?? false,
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
    const preParseResult = await runStage("pre_parsing", async () => {
      const buf = await downloadPdf(exam.prova_storage_path as string);
      // extractText / pdfjs transfers the underlying ArrayBuffer into its
      // worker and detaches the original view, which breaks the later
      // renderPageAsImage call in runVisionFallback ("Cannot transfer
      // object of unsupported type"). Feed a slice() clone to pdfjs and
      // keep the pristine copy for the Vision fallback.
      const parseBuf = buf.slice();
      const ps = await extractPdfPages(parseBuf);
      const totalChars = ps.reduce((s, p) => s + p.text.length, 0);
      console.log(`[PRE-PARSER] ${ps.length} páginas, ${totalChars} chars`);
      return { pages: ps, pdfBuffer: buf };
    });

    if (preParseResult.pages.reduce((s, p) => s + p.text.length, 0) < 500) {
      throw new Error("PDF escaneado não suportado");
    }

    // 1.5 VISION FALLBACK — re-transcribe any page with PUA / replacement /
    // exotic-block characters so the downstream LLM agents never see garbage
    // where a formula should be.
    const pages = await runStage("vision_fallback", async () => {
      const { pages: outPages, rewritten } = await runVisionFallback(
        preParseResult.pages,
        preParseResult.pdfBuffer,
      );
      if (rewritten.length === 0) {
        console.log("[VISION] nenhuma página precisou de Vision");
      } else {
        console.log(
          `[VISION] ${rewritten.length} página(s) substituída(s): ${rewritten.join(", ")}`,
        );
      }
      return outPages;
    });

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

    // Sanity-check the profiler's question count against a deterministic
    // regex scan of the raw pages. If the scanner finds materially more
    // standalone markers (≥ profile count + 5) we trust the scan —
    // fixes the Fuvest 2026 case where the profiler reported 35 vs real 90
    // because soft-hyphens in the PDF confused the LLM-based profiler.
    const profilerMarkers = scanQuestionMarkers(pages);
    const profilerReported = profile.objective_question_count ?? 0;
    if (profilerMarkers.length >= profilerReported + 5 && profilerMarkers.length <= 200) {
      console.log(
        `[PROFILER] override objective_question_count: profiler=${profilerReported} → scan=${profilerMarkers.length}`,
      );
      profile.objective_question_count = profilerMarkers.length;
    } else if (profilerMarkers.length > 0) {
      console.log(
        `[PROFILER] scan confirmou ${profilerMarkers.length} marcadores (profiler disse ${profilerReported})`,
      );
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
      // Reuse the pre-parser's pristine buffer instead of re-downloading. The
      // previous download had a ~20-minute Vision-fallback window before it,
      // long enough to race a Supabase storage 503 and discard all Vision
      // work. slice() hands pdfjs a fresh ArrayBuffer copy so its worker can
      // transfer it without detaching the original.
      const pdfBuf = preParseResult.pdfBuffer.slice();
      const res = await runAssetExtractor(pdfBuf, examId);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[ASSET EXTRACTOR] ${res.assets.length} imagens extraídas de ${res.pages_scanned} páginas (${sec}s)`,
      );
      return res.assets;
    });

    // 3. SEGMENTER
    // Protect question markers from the page-number stripper by passing the
    // set of (page, line) keys detected by the profiler scan. Line numbers
    // survive stripping because it replaces lines with empty strings rather
    // than deleting them, so coordinates stay aligned with the segmenter.
    const preserveLines = new Set(
      profilerMarkers.map((m) => `${m.page}:${m.line}`),
    );
    const segPages = stripRunningHeaders(pages, profile, preserveLines);
    if (profile.running_header || profile.running_footer) {
      console.log(
        `[SEGMENTER] removidos cabeçalho='${profile.running_header ?? ""}' rodapé='${profile.running_footer ?? ""}'`,
      );
    }
    const blocks = await runStage("segmenting", async () => {
      const started = Date.now();
      const bs = await runSegmenter(segPages, profile);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`[SEGMENTER] total ${bs.length} blocos (${sec}s)`);
      return bs;
    });

    // Backfill missing question_hint on stem/question_start blocks using
    // the deterministic marker scan. Haiku frequently drops the hint on
    // Fuvest 2022-24 cadernos where the marker is just a bare "01" on its
    // own line (the prompt only nudges it toward "{27}"/"27."/"27)"). The
    // walk-forward assignment here recovered ~55 hints per prova in the
    // backfill test runs.
    const segMarkers = scanQuestionMarkers(segPages);
    if (segMarkers.length > 0) {
      let filled = 0;
      const sortedMarkers = [...segMarkers].sort(
        (a, b) => a.page - b.page || a.line - b.line,
      );
      const cmp = (p: number | null, l: number | null, m: QuestionMarker) =>
        (p ?? 0) - m.page || (l ?? 0) - m.line;
      for (const b of blocks) {
        if (b.type !== "stem" && b.type !== "question_start") continue;
        if (typeof b.question_hint === "number") continue;
        // Find the latest marker at or before this block's (page, line_start).
        let chosen: QuestionMarker | null = null;
        for (const m of sortedMarkers) {
          if (cmp(b.page, b.line_start, m) >= 0) chosen = m;
          else break;
        }
        if (chosen) {
          b.question_hint = chosen.n;
          filled++;
        }
      }
      if (filled > 0) {
        console.log(
          `[SEGMENTER] backfill: ${filled} blocos recuperaram question_hint via marcadores (${segMarkers.length} marcadores encontrados)`,
        );
      }

      // Report what the assembler will see.
      const distinctHints = new Set<number>();
      for (const b of blocks) {
        if (
          (b.type === "stem" || b.type === "question_start") &&
          typeof b.question_hint === "number"
        ) {
          distinctHints.add(b.question_hint);
        }
      }
      const missingNums = segMarkers
        .filter((m) => !distinctHints.has(m.n))
        .map((m) => m.n);
      console.log(
        `[SEGMENTER] hints distintos após backfill: ${distinctHints.size}/${segMarkers.length}` +
          (missingNums.length > 0 && missingNums.length <= 20
            ? ` (faltam: ${missingNums.join(",")})`
            : missingNums.length > 0
              ? ` (${missingNums.length} questões sem stem)`
              : ""),
      );
    }

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
      await withSupaRetry("Falha upsert question_raw", () =>
        supabase
          .from("question_raw")
          .upsert(rows, { onConflict: "exam_id,numero" }),
      );
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

    // 7. VALIDATOR (pure code) — runs FIRST to tag image_options,
    //    apply stem/SC swaps, and filter out structurally-broken rows
    //    before spending LLM tokens on the reviewer.
    const validatorOut = await runStage("validating", async () => {
      const started = Date.now();
      const v = await runValidator(examId, jobId, profile);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[VALIDATOR] ${v.approved} validated, ${v.flagged} flagged, ${v.total_issues} issues (${sec}s)`,
      );
      return v;
    });

    // 8. REVIEWER — LLM review on validated rows only.
    const reviewerOut = await runStage("reviewing", async () => {
      const started = Date.now();
      const r = await runReviewer(examId, jobId);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[REVIEWER] ${r.approved_clean} aprovadas sem issues, ${r.with_issues} com issues, ${r.total_issues} issues totais (${r.critical_issues} críticos, ${sec}s)`,
      );
      return r;
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

// Only run main() when this file is invoked directly. When other scripts
// import it (e.g. check-state.ts using analyzePageText), we must not kick
// off the whole pipeline as a side effect of the import.
async function runCli() {
  const { pathToFileURL } = await import("node:url");
  const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
  if (invokedPath !== import.meta.url) return;

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY not set");
    process.exit(1);
  }
  if (!ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  const examId = process.argv[2];
  if (!examId) {
    console.error("Uso: npx tsx tools/extraction/extract-exam-local.ts <exam_id>");
    process.exit(1);
  }

  try {
    await main(examId);
  } catch (err) {
    console.error("Fatal:", err);
    process.exit(1);
  }
}

runCli();
