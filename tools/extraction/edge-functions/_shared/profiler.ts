import type { ParsedPage } from "./pre-parser.ts";
import { callClaudeTool } from "./anthropic.ts";

const SYSTEM_PROMPT = `Você é um profiler de provas de vestibulares brasileiros.
Receba texto extraído e retorne análise estrutural via a tool submit_profile.
NÃO extraia questões.
Se texto vazio/ilegível: source_type = 'pdf_scanned'.`;

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
    shared_context_groups: {
      type: "array",
      items: { type: "array", items: { type: "integer" } },
    },
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

export async function runProfiler(pages: ParsedPage[]): Promise<ProfileResult> {
  const first15 = pages
    .slice(0, 15)
    .map((p) => `=== Página ${p.page_number} ===\n${p.text}`)
    .join("\n\n");

  return callClaudeTool<ProfileResult>({
    system: SYSTEM_PROMPT,
    user: first15,
    maxTokens: 4096,
    toolName: "submit_profile",
    toolDescription: "Submit the structural profile of the exam PDF.",
    schema: PROFILE_SCHEMA,
  });
}
