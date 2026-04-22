/**
 * Fase C — re-extract a range of numeros for an exam.
 *
 * Surgical re-run of the assembler stage over a specific list of numeros
 * using the already-persisted segmenter_blocks_json + profile_json from
 * the latest extraction_jobs row for that exam. Writes back stem,
 * options, shared_context, note_e_adote, source_pages, question_type
 * into the existing question_raw row (matched by numero) and resolves
 * unresolved issues on that row with "superseded by re-extract (Fase C)".
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
 *   npx tsx tools/extraction/re-extract-range.ts <exam_id> <first> <last>
 */
import Anthropic from "@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const MODEL_SONNET = "claude-sonnet-4-5-20250929";
const ASM_MAX_TOKENS = 8192;
const ASM_PARALLELISM = 6;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
async function supabaseFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
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
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: supabaseFetch as typeof fetch },
});

interface Block {
  block_id: string;
  type: string;
  question_hint: number | null;
  page: number | null;
  line_start: number | null;
  line_end: number | null;
  label: string | null;
  text: string;
}

interface AssembledOption { label: string; text: string; media_ref: string | null }
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

interface ProfileResult {
  running_header?: string;
  running_footer?: string;
  [k: string]: unknown;
}

const ASM_SYSTEM = `Monte o JSON canônico de UMA questão a partir dos blocos fornecidos,
chamando a tool submit_question.
NÃO parafraseie. NÃO assuma labels — use exatamente os labels
que aparecem nos blocos.
Question types válidos: multiple_choice_single,
multiple_choice_image_options, multiple_choice_shared_context.

REGRAS CRÍTICAS:
- O stem NUNCA começa com "(A)" / "A)" / outro rótulo de alternativa.
- NÃO inclua cabeçalhos/rodapés de página em stem nem em shared_context.
- Use APENAS blocos cujo question_hint (ou propagação) bate com o número
  pedido. Não "pegue emprestado" stems/alternativas de questões vizinhas.
- Se um bloco stem está vazio mas existe shared_context, promova o
  shared_context a stem (único) e defina shared_context=null.

Se incerto sobre qualquer campo: flagged = true.`;

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

function propagateSharedContext(blocks: Block[]): Block[] {
  const out: Block[] = [...blocks];
  const stems = blocks
    .filter(
      (b) => (b.type === "stem" || b.type === "question_start") && typeof b.question_hint === "number",
    )
    .sort((a, b) => {
      const ap = a.page ?? 0, bp = b.page ?? 0;
      if (ap !== bp) return ap - bp;
      return (a.line_start ?? 0) - (b.line_start ?? 0);
    });
  for (const b of blocks) {
    if (b.type !== "shared_context") continue;
    if (typeof b.question_hint === "number") continue;
    let numeros = parseSharedContextRange(b.text);
    if (numeros.length === 0) {
      const bp = b.page ?? 0, bl = b.line_start ?? 0;
      const following = stems.filter((s) => {
        const sp = s.page ?? 0;
        if (sp < bp) return false;
        if (sp === bp && (s.line_start ?? 0) < bl) return false;
        if (sp > bp + 1) return false;
        return true;
      });
      numeros = following.slice(0, 2).map((s) => s.question_hint as number);
    }
    numeros = [...new Set(numeros.filter((n) => Number.isFinite(n) && n > 0))];
    for (const n of numeros) out.push({ ...b, question_hint: n });
  }
  return out;
}

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

function stripHeadersFromText(text: string | null, profile: ProfileResult): string | null {
  if (!text) return text;
  const header = profile.running_header?.trim();
  const footer = profile.running_footer?.trim();
  const patterns = [header, footer].filter((s): s is string => !!s);
  let out = text;
  for (const pat of patterns) {
    const esc = pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|\\n)\\s*${esc}\\s*(?=\\n|$)`, "gi"), "$1");
  }
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

function stemStartsWithOption(stem: string): boolean {
  return /^\(?[A-Ea-e]\)\s+\S/.test(stem.trim());
}

const TRUNCATION_TRAILING = new RegExp(
  "[\\s,;:]*\\b(que|e|ou|de|do|da|dos|das|em|na|no|nas|nos|a|o|as|os|por|para|com|" +
    "sem|sobre|como|seguinte|seguintes|entre|ante|após|até|contra|desde|durante|" +
    "mediante|perante|segundo|sob|traás|última|último|primeira|primeiro)[\\s]*[:,;—–-]?[\\s]*$",
  "i",
);

function trimDanglingConnector(stem: string): string {
  let s = stem.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const lines = s.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (TRUNCATION_TRAILING.test(last)) {
      lines[lines.length - 1] = last.replace(TRUNCATION_TRAILING, "").replace(/[,;:—–-]+$/g, "");
      if (lines[lines.length - 1].length === 0) lines.pop();
    }
  }
  return lines.join("\n");
}

function postProcess(q: AssembledQuestion, profile: ProfileResult): AssembledQuestion {
  const out = { ...q };
  out.stem = stripHeadersFromText(out.stem, profile) ?? "";
  out.shared_context = stripHeadersFromText(out.shared_context, profile) ?? null;
  out.stem = trimDanglingConnector(out.stem);
  if (out.shared_context) out.shared_context = trimDanglingConnector(out.shared_context);
  if (Array.isArray(out.options)) {
    out.options = out.options.map((o) => ({
      ...o,
      label: String(o?.label ?? "").replace(/[()[\]]/g, "").trim(),
    }));
  }
  if (stemStartsWithOption(out.stem) && out.shared_context && out.shared_context.trim().length >= 20) {
    const newStem = out.shared_context.trim();
    out.shared_context = null;
    out.stem = newStem;
  }
  if (out.stem.trim().length < 20 && out.shared_context && out.shared_context.trim().length >= 40) {
    out.stem = out.shared_context.trim();
    out.shared_context = null;
  }
  return out;
}

async function callAssembler(numero: number, blocks: Block[], profile: ProfileResult): Promise<AssembledQuestion | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const user =
        `Profile running_header=${profile.running_header ?? "-"} footer=${profile.running_footer ?? "-"}\n\n` +
        `Monte a questão numero=${numero} a partir dos blocos abaixo. ` +
        `Retorne options SEMPRE como array JSON (nunca como string).\n` +
        `Blocos:\n${JSON.stringify(blocks)}`;
      const res = await anthropic.messages.create({
        model: MODEL_SONNET,
        max_tokens: ASM_MAX_TOKENS,
        system: ASM_SYSTEM,
        tools: [{ name: "submit_question", description: "Canonical JSON for one question.", input_schema: QUESTION_SCHEMA as unknown as Record<string, unknown> }],
        tool_choice: { type: "tool", name: "submit_question" },
        messages: [{ role: "user", content: user }],
      });
      const b = res.content.find((c) => c.type === "tool_use" && c.name === "submit_question");
      if (!b || b.type !== "tool_use") throw new Error(`submit_question ausente (stop=${res.stop_reason})`);
      const raw = b.input as AssembledQuestion;
      if (typeof raw.options === "string") {
        try { raw.options = JSON.parse(raw.options); } catch { /* ignore */ }
      }
      if (!Array.isArray(raw.options)) throw new Error("options não-array");
      if (typeof raw.numero !== "number") throw new Error("numero inválido");
      return raw;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  [ASM] q${numero} attempt ${attempt} err: ${msg}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return null;
}

async function main() {
  const examId = process.argv[2];
  const first = parseInt(process.argv[3], 10);
  const last = parseInt(process.argv[4], 10);
  if (!examId || !Number.isFinite(first) || !Number.isFinite(last)) {
    console.error("Uso: npx tsx tools/extraction/re-extract-range.ts <exam_id> <first> <last>");
    process.exit(1);
  }
  const targetNumeros = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  console.log(`=== Re-extract ${examId} q${first}–q${last} (${targetNumeros.length} questões) ===`);

  const { data: job, error: jobErr } = await supabase
    .from("extraction_jobs")
    .select("id, segmenter_blocks_json, profile_json")
    .eq("exam_id", examId)
    .not("segmenter_blocks_json", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobErr || !job) throw new Error(`no job: ${jobErr?.message}`);
  const allBlocks = (job.segmenter_blocks_json ?? []) as Block[];
  const profile = (job.profile_json ?? {}) as ProfileResult;
  console.log(`  job=${job.id} blocks=${allBlocks.length}`);

  const withSC = propagateSharedContext(allBlocks);
  const byNum = blocksByNumero(withSC);

  const tasks: Array<{ numero: number; blocks: Block[] }> = [];
  for (const n of targetNumeros) {
    const blocks = byNum.get(n) ?? [];
    if (blocks.length === 0) {
      console.warn(`  q${n}: sem blocos (pulando)`);
      continue;
    }
    tasks.push({ numero: n, blocks });
  }
  console.log(`  ${tasks.length} questões com blocos; ASM_PARALLELISM=${ASM_PARALLELISM}`);

  const assembled: AssembledQuestion[] = [];
  for (let i = 0; i < tasks.length; i += ASM_PARALLELISM) {
    const slice = tasks.slice(i, i + ASM_PARALLELISM);
    const t0 = Date.now();
    const results = await Promise.all(slice.map((t) => callAssembler(t.numero, t.blocks, profile)));
    for (const r of results) if (r) assembled.push(postProcess(r, profile));
    console.log(`  [ASM] batch ${Math.floor(i / ASM_PARALLELISM) + 1} done (${slice.length} q, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  console.log(`  ${assembled.length}/${tasks.length} montadas com sucesso`);

  // Fetch existing question_raw rows by (exam_id, numero)
  const { data: existingRows, error: rErr } = await supabase
    .from("question_raw")
    .select("id, numero, correct_answer")
    .eq("exam_id", examId)
    .in("numero", assembled.map((q) => q.numero));
  if (rErr) throw new Error(`load rows: ${rErr.message}`);
  const rowByNumero = new Map<number, { id: string; correct_answer: string | null }>();
  for (const r of existingRows ?? []) {
    rowByNumero.set(r.numero as number, { id: r.id as string, correct_answer: r.correct_answer as string | null });
  }

  // Update each row in place + resolve old issues + set status.
  for (const q of assembled) {
    const row = rowByNumero.get(q.numero);
    if (!row) { console.warn(`  q${q.numero}: sem question_raw (skip)`); continue; }
    const nextStatus = q.flagged ? "flagged" : "approved";
    const { error: upErr } = await supabase
      .from("question_raw")
      .update({
        stem: q.stem,
        options: q.options,
        shared_context: q.shared_context,
        note_e_adote: q.note_e_adote,
        source_pages: q.source_pages ?? [],
        question_type: q.question_type,
        confidence_score: typeof q.confidence === "number" ? q.confidence : null,
        status: nextStatus,
        enrichment: null,
      })
      .eq("id", row.id);
    if (upErr) { console.error(`  q${q.numero} update err: ${upErr.message}`); continue; }

    // Resolve all previously unresolved issues on this row.
    await supabase
      .from("question_issues")
      .update({ resolved: true, resolution: "superseded by re-extract (Fase C)" })
      .eq("question_raw_id", row.id)
      .eq("resolved", false);

    console.log(`  q${q.numero}: status=${nextStatus} options=${q.options.length} stem_len=${q.stem.length} sc=${q.shared_context ? "sim" : "não"}`);
  }

  console.log(`\nDone. ${assembled.length} rows re-extracted.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
