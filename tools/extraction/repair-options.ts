/**
 * Targeted repair: re-runs the assembler for a specific set of question
 * numbers in an exam, using the segmenter blocks already cached on the
 * most recent extraction_job row. Upserts the resulting rows into
 * question_raw, replacing any previously malformed records.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx tools/extraction/repair-options.ts <exam_id> <n1,n2,...>
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

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

const MODEL_SONNET = "claude-sonnet-4-5-20250929";
const ANTHROPIC = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Block {
  block_id: string;
  type: string;
  question_hint: number | null;
  page: number | null;
  line_start: number | null;
  line_end: number | null;
  label: string | null;
  text: string;
  flagged?: boolean;
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

function normalizeQuestionShape(q: AssembledQuestion): AssembledQuestion {
  const out = { ...q };
  if (typeof (out as unknown as { options: unknown }).options === "string") {
    try {
      const parsed = JSON.parse((out as unknown as { options: string }).options);
      if (Array.isArray(parsed)) out.options = parsed as AssembledOption[];
    } catch {
      /* ignore */
    }
  }
  return out;
}

async function assembleOneQuestion(
  numero: number,
  blocksForQ: Block[],
): Promise<AssembledQuestion | null> {
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    const extraHint =
      attempt === 1
        ? ""
        : `ATENÇÃO: tentativa ${attempt}. Na chamada anterior o campo "options" veio como string ` +
          `malformada em vez de array JSON. Retorne options COMO ARRAY JSON, e em qualquer ` +
          `texto literal substitua aspas duplas por aspas simples para não quebrar o JSON.\n`;
    const user =
      extraHint +
      `Monte a questão numero=${numero} a partir dos blocos abaixo.\n` +
      `Retorne options SEMPRE como array JSON (nunca como string).\n` +
      `Blocos:\n${JSON.stringify(blocksForQ)}`;
    try {
      const res = await ANTHROPIC.messages.create({
        model: MODEL_SONNET,
        max_tokens: 8192,
        system: ASM_SYSTEM,
        tools: [
          {
            name: "submit_question",
            description: "Submit the canonical JSON for one question.",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            input_schema: QUESTION_SCHEMA as any,
          },
        ],
        tool_choice: { type: "tool", name: "submit_question" },
        messages: [{ role: "user", content: user }],
      });
      const block = res.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") {
        console.log(`[REPAIR] q${numero} attempt ${attempt}: no tool_use block`);
        continue;
      }
      const raw = block.input as AssembledQuestion;
      const q = normalizeQuestionShape(raw);
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      if (!q || typeof q.numero !== "number") {
        console.log(`[REPAIR] q${numero} invalid (numero=${q?.numero}, ${sec}s)`);
        continue;
      }
      if (!Array.isArray(q.options)) {
        console.log(
          `[REPAIR] q${q.numero} attempt ${attempt}: options ${typeof q.options} — retry`,
        );
        continue;
      }
      console.log(
        `[REPAIR] q${q.numero} ok (${q.options.length} opts, conf=${q.confidence ?? "?"}, ${sec}s, attempt=${attempt})`,
      );
      return q;
    } catch (err) {
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[REPAIR] q${numero} attempt ${attempt} falhou (${sec}s): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return null;
}

async function main(examId: string, numeros: number[]) {
  const { data: job, error: jobErr } = await supabase
    .from("extraction_jobs")
    .select("id, segmenter_blocks_json")
    .eq("exam_id", examId)
    .not("segmenter_blocks_json", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobErr || !job) throw new Error(`Sem job com blocks: ${jobErr?.message}`);
  const blocks = job.segmenter_blocks_json as Block[];
  console.log(`[REPAIR] job=${job.id} blocks=${blocks.length}`);

  const byNumero = new Map<number, Block[]>();
  for (const b of blocks) {
    if (typeof b.question_hint !== "number") continue;
    const arr = byNumero.get(b.question_hint) ?? [];
    arr.push(b);
    byNumero.set(b.question_hint, arr);
  }

  const results = await Promise.all(
    numeros.map((n) => assembleOneQuestion(n, byNumero.get(n) ?? [])),
  );

  let updated = 0;
  for (const q of results) {
    if (!q) continue;
    const { error } = await supabase
      .from("question_raw")
      .update({
        question_type: q.question_type ?? "multiple_choice_single",
        shared_context: q.shared_context ?? null,
        stem: q.stem ?? "",
        options: q.options,
        note_e_adote: q.note_e_adote ?? null,
        source_pages: Array.isArray(q.source_pages) ? q.source_pages : null,
        confidence_score:
          typeof q.confidence === "number" ? Number(q.confidence.toFixed(2)) : null,
      })
      .eq("exam_id", examId)
      .eq("numero", q.numero);
    if (error) {
      console.error(`[REPAIR] q${q.numero} update err: ${error.message}`);
    } else {
      updated++;
    }
  }

  console.log(`[REPAIR] ${updated}/${numeros.length} questões atualizadas`);
}

const examId = process.argv[2];
const numeros = (process.argv[3] ?? "")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter(Number.isFinite);

if (!examId || numeros.length === 0) {
  console.error("Uso: npx tsx tools/extraction/repair-options.ts <exam_id> <n1,n2,...>");
  process.exit(1);
}

main(examId, numeros).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
