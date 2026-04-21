import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Block } from "./segmenter.ts";
import type { ProfileResult } from "./profiler.ts";
import { callClaude, parseJsonResponse } from "./anthropic.ts";

const QUESTIONS_PER_CHUNK = 30;

const SYSTEM_PROMPT = `Monte JSON canônico por questão a partir dos blocos fornecidos.
NÃO parafraseie. NÃO assuma labels — use exatamente os labels
que aparecem nos blocos.
Question types válidos: multiple_choice_single,
multiple_choice_image_options, multiple_choice_shared_context.
Se incerto sobre qualquer campo: flagged = true.
Retorne APENAS JSON array (sem markdown, sem backticks):
[{"numero":1,"question_type":"multiple_choice_single",
  "shared_context":null,"stem":"texto completo do enunciado",
  "options":[{"label":"A","text":"texto da alternativa","media_ref":null}],
  "note_e_adote":null,"media_refs":[],"source_pages":[2],
  "confidence":0.95,"flagged":false}]`;

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
): Promise<AssembledQuestion[]> {
  const user = `Profile: ${profileSummary(profile)}\n\nBlocos:\n${JSON.stringify(chunkBlocks)}`;
  const raw = await callClaude({ system: SYSTEM_PROMPT, user, maxTokens: 8192 });
  return parseJsonResponse<AssembledQuestion[]>(raw, "Assembler");
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

  const chunkResults: AssembledQuestion[][] = [];
  for (const c of chunks) {
    chunkResults.push(await assembleChunk(c, profile));
  }
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
