import type { ParsedPage } from "./pre-parser.ts";
import { callClaude, parseJsonResponse } from "./anthropic.ts";

const SYSTEM_PROMPT = `Você é um profiler de provas de vestibulares brasileiros.
Receba texto extraído e retorne análise estrutural.
NÃO extraia questões.
Se texto vazio/ilegível: source_type = 'pdf_scanned'.
Retorne APENAS JSON (sem markdown, sem backticks):
{"banca":"...","ano":2026,"versao":"V1","language":"pt-BR",
 "source_type":"pdf_digital|pdf_scanned",
 "question_numbering_pattern":"...",
 "option_label_pattern":"A-E",
 "objective_question_count":90,
 "has_shared_context":true,
 "shared_context_groups":[[1,2],[15,16]],
 "has_note_e_adote":true,
 "note_e_adote_questions":[18,28],
 "has_images":true,
 "questions_with_images":[5,10],
 "mixed_with_discursive":false,
 "column_layout":"two_column",
 "structural_risks":[],
 "recommended_strategy":"..."}`;

export interface ProfileResult {
  banca?: string;
  ano?: number;
  versao?: string;
  language?: string;
  source_type?: "pdf_digital" | "pdf_scanned" | string;
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

export async function runProfiler(pages: ParsedPage[]): Promise<ProfileResult> {
  const first15 = pages
    .slice(0, 15)
    .map((p) => `=== Página ${p.page_number} ===\n${p.text}`)
    .join("\n\n");

  const raw = await callClaude({ system: SYSTEM_PROMPT, user: first15, maxTokens: 4096 });
  return parseJsonResponse<ProfileResult>(raw, "Profiler");
}
