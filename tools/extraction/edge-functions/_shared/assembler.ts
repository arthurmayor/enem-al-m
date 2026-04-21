import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Block } from "./segmenter.ts";
import type { ProfileResult } from "./profiler.ts";
import { callClaudeTool } from "./anthropic.ts";

const QUESTIONS_PER_CHUNK = 12;
const ASSEMBLER_MAX_TOKENS = 16384;

const SYSTEM_PROMPT = `Monte JSON canônico por questão a partir dos blocos fornecidos
chamando a tool submit_questions.
NÃO parafraseie. NÃO assuma labels — use exatamente os labels
que aparecem nos blocos.
Question types válidos: multiple_choice_single,
multiple_choice_image_options, multiple_choice_shared_context.
Se incerto sobre qualquer campo: flagged = true.
Campos por questão:
- numero: inteiro.
- question_type: um dos três tipos acima.
- shared_context: texto do contexto compartilhado (ou null).
- stem: enunciado completo.
- options: array de { label, text, media_ref }.
- note_e_adote: texto do bloco "note e adote" (ou null).
- media_refs: array (pode ficar vazio).
- source_pages: array de inteiros (páginas).
- confidence: número entre 0 e 1.
- flagged: true se ambíguo.`;

const QUESTIONS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
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
      },
    },
  },
  required: ["questions"],
};

interface AssemblerChunkResponse {
  questions?: AssembledQuestion[];
}

export interface AssembledQuestion {
  numero: number;
  question_type: string;
  shared_context: string | null;
  stem: string;
  options: Array<{ label: string; text: string; media_ref: string | null }>;
  note_e_adote: string | null;
  media_refs: unknown[];
  source_pages: number[];
  confidence: number;
  flagged?: boolean;
  [k: string]: unknown;
}

function profileSummary(profile: ProfileResult): string {
  return JSON.stringify({
    banca: profile.banca,
    ano: profile.ano,
    option_label_pattern: profile.option_label_pattern,
    has_shared_context: profile.has_shared_context,
    has_note_e_adote: profile.has_note_e_adote,
    objective_question_count: profile.objective_question_count,
  });
}

// Group blocks into chunks of ~N consecutive question numbers.
function chunkBlocksByQuestionHint(
  blocks: Block[],
  questionsPerChunk: number,
): Block[][] {
  const hintsSet = new Set<number>();
  for (const b of blocks) {
    if (typeof b.question_hint === "number") hintsSet.add(b.question_hint);
  }
  const sortedHints = Array.from(hintsSet).sort((a, b) => a - b);
  if (sortedHints.length === 0) return [blocks];

  const chunks: Block[][] = [];
  for (let i = 0; i < sortedHints.length; i += questionsPerChunk) {
    const slice = sortedHints.slice(i, i + questionsPerChunk);
    const min = slice[0];
    const max = slice[slice.length - 1];
    const chunkBlocks = blocks.filter(
      (b) =>
        typeof b.question_hint === "number" &&
        b.question_hint >= min &&
        b.question_hint <= max,
    );
    chunks.push(chunkBlocks);
  }
  return chunks;
}

async function assembleChunk(
  chunkBlocks: Block[],
  profile: ProfileResult,
  chunkIndex: number,
): Promise<AssembledQuestion[]> {
  const user = `Profile: ${profileSummary(profile)}\n\nBlocos:\n${JSON.stringify(chunkBlocks)}`;
  const started = Date.now();
  console.log(`[assembler] chunk ${chunkIndex} start blocks=${chunkBlocks.length}`);
  // Assembler stays on Sonnet (ANTHROPIC_DEFAULT_MODEL): the rich question
  // payload benefits from a stronger model. Tool Use keeps the output
  // guaranteed schema-valid.
  const parsed = await callClaudeTool<AssemblerChunkResponse>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: ASSEMBLER_MAX_TOKENS,
    toolName: "submit_questions",
    toolDescription: "Submit the canonical list of questions assembled from the blocks.",
    schema: QUESTIONS_SCHEMA,
  });
  const questions = parsed.questions ?? [];
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[assembler] chunk ${chunkIndex} done in ${elapsed}s questions=${questions.length}`,
  );
  return questions;
}

export interface AssemblerResult {
  questions: AssembledQuestion[];
  inserted_count: number;
}

export async function runAssembler(
  supabase: SupabaseClient,
  examId: string,
  jobId: string,
  blocks: Block[],
  profile: ProfileResult,
): Promise<AssemblerResult> {
  const chunks = chunkBlocksByQuestionHint(blocks, QUESTIONS_PER_CHUNK);
  console.log(
    `[assembler] starting: blocks=${blocks.length} chunks=${chunks.length}`,
  );

  const chunkResults = await Promise.all(
    chunks.map((c, i) => assembleChunk(c, profile, i)),
  );
  const questions = chunkResults.flat();

  if (questions.length === 0) {
    return { questions, inserted_count: 0 };
  }

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
    confidence_score:
      typeof q.confidence === "number" ? Number(q.confidence.toFixed(2)) : null,
    status: "raw",
  }));

  const { error: upsertErr } = await supabase
    .from("question_raw")
    .upsert(rows, { onConflict: "exam_id,numero" });
  if (upsertErr) {
    throw new Error(`Falha ao inserir question_raw: ${upsertErr.message}`);
  }

  await supabase
    .from("extraction_jobs")
    .update({ extracted_questions: rows.length })
    .eq("id", jobId);

  return { questions, inserted_count: rows.length };
}
