import type { ParsedPage } from "./pre-parser.ts";
import type { ProfileResult } from "./profiler.ts";
import { callClaude, parseJsonResponse } from "./anthropic.ts";

const CHUNK_PAGES = 8;

const SYSTEM_PROMPT = `Segmente esta parte da prova em blocos canônicos.
NÃO reescreva texto. Copie literalmente.
NÃO monte a questão final.
Tipos de bloco: shared_context, question_start, stem, option_item,
note_e_adote, figure_ref, caption, source_reference.
CUIDADO com layout de 2 colunas — não misture questões.
Blocos ambíguos: flagged = true.
Retorne APENAS JSON (sem markdown, sem backticks):
{"blocks":[
  {"block_id":"b001","type":"stem","question_hint":1,
   "page":2,"text":"...","label":null,"flagged":false}
]}`;

export interface Block {
  block_id: string;
  type: string;
  question_hint: number | null;
  page: number | null;
  text: string;
  label: string | null;
  flagged?: boolean;
  [k: string]: unknown;
}

interface SegmenterChunkResponse {
  blocks?: Block[];
}

function chunkPages(pages: ParsedPage[], size: number): ParsedPage[][] {
  const chunks: ParsedPage[][] = [];
  for (let i = 0; i < pages.length; i += size) {
    chunks.push(pages.slice(i, i + size));
  }
  return chunks;
}

function profileSummary(profile: ProfileResult): string {
  return JSON.stringify({
    banca: profile.banca,
    ano: profile.ano,
    option_label_pattern: profile.option_label_pattern,
    column_layout: profile.column_layout,
    has_shared_context: profile.has_shared_context,
    has_note_e_adote: profile.has_note_e_adote,
    objective_question_count: profile.objective_question_count,
  });
}

async function segmentChunk(chunk: ParsedPage[], profile: ProfileResult): Promise<Block[]> {
  const pagesText = chunk
    .map((p) => `=== Página ${p.page_number} ===\n${p.text}`)
    .join("\n\n");
  const user = `Profile: ${profileSummary(profile)}\n\nTexto:\n${pagesText}`;
  const raw = await callClaude({ system: SYSTEM_PROMPT, user, maxTokens: 8192 });
  const parsed = parseJsonResponse<SegmenterChunkResponse>(raw, "Segmenter");
  return parsed.blocks ?? [];
}

export async function runSegmenter(
  pages: ParsedPage[],
  profile: ProfileResult,
): Promise<{ blocks: Block[] }> {
  const chunks = chunkPages(pages, CHUNK_PAGES);

  const chunkResults = await Promise.all(chunks.map((c) => segmentChunk(c, profile)));

  const merged = chunkResults.flat();
  merged.forEach((b, i) => {
    b.block_id = `b${String(i + 1).padStart(4, "0")}`;
  });

  return { blocks: merged };
}
