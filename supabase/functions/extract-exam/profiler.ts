import type { ParsedPage } from "./pre-parser.ts";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

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

function stripJsonFences(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

export async function runProfiler(pages: ParsedPage[]): Promise<ProfileResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurado nos secrets da edge function");
  }

  const first15 = pages
    .slice(0, 15)
    .map((p) => `=== Página ${p.page_number} ===\n${p.text}`)
    .join("\n\n");

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: first15 }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = await response.json();
  const textBlock = Array.isArray(data?.content)
    ? data.content.find((c: { type?: string }) => c.type === "text")
    : null;
  const text: string = textBlock?.text ?? "";

  if (!text) {
    throw new Error("Resposta do Claude não contém bloco de texto");
  }

  try {
    return JSON.parse(stripJsonFences(text)) as ProfileResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Falha ao parsear JSON do Profiler: ${message}. Texto bruto: ${text.slice(0, 500)}`,
    );
  }
}
