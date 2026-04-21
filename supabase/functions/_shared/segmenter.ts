import type { ParsedPage } from "./pre-parser.ts";
import type { ProfileResult } from "./profiler.ts";
import { callClaude, parseJsonResponse } from "./anthropic.ts";

const CHUNK_PAGES = 8;

// Segmenter now returns block metadata only — line ranges into the
// original page text — instead of copying the text literal into the
// response JSON. This keeps Claude's output small enough to fit under
// max_tokens even for dense 8-page chunks. The actual block text is
// reconstructed locally via hydrateBlockText() after parsing.
const SYSTEM_PROMPT = `Você recebe as páginas de uma prova com cada linha
prefixada por "Lx: " (onde x é o número da linha DENTRO daquela página,
começando em 1). Segmente o texto em blocos canônicos retornando APENAS
as coordenadas de cada bloco — NÃO copie o texto.

Tipos de bloco: shared_context, question_start, stem, option_item,
note_e_adote, figure_ref, caption, source_reference.
CUIDADO com layout de 2 colunas — não misture questões.
Blocos ambíguos: flagged = true.
Um bloco deve ficar sempre dentro de uma única página. Se um trecho
atravessa páginas, gere um bloco por página.

Retorne APENAS JSON (sem markdown, sem backticks):
{"blocks":[
  {"block_id":"b001","type":"stem","question_hint":1,
   "page":2,"line_start":3,"line_end":7,
   "label":null,"flagged":false}
]}

Campos:
- block_id: identificador sequencial (será reatribuído depois, pode ser qualquer string).
- type: um dos tipos listados acima.
- question_hint: número da questão a que o bloco pertence (ou null).
- page: número da página (o que aparece em "=== Página N ===").
- line_start / line_end: números das linhas (Lx) inclusive, dentro da página.
- label: para option_item, a letra/rótulo exatamente como aparece (A, B, C, D, E, a), ...); caso contrário null.
- flagged: true se o bloco for ambíguo.`;

export interface SegmenterBlock {
  block_id: string;
  type: string;
  question_hint: number | null;
  page: number | null;
  line_start: number | null;
  line_end: number | null;
  label: string | null;
  flagged?: boolean;
  [k: string]: unknown;
}

export interface Block extends SegmenterBlock {
  text: string;
}

interface SegmenterChunkResponse {
  blocks?: SegmenterBlock[];
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

function annotatePageWithLineNumbers(page: ParsedPage): {
  header: string;
  annotated: string;
  lines: string[];
} {
  const lines = page.text.split("\n");
  const annotated = lines.map((line, i) => `L${i + 1}: ${line}`).join("\n");
  const header = `=== Página ${page.page_number} ===`;
  return { header, annotated, lines };
}

function buildChunkPayload(chunk: ParsedPage[]): string {
  return chunk
    .map((p) => {
      const { header, annotated } = annotatePageWithLineNumbers(p);
      return `${header}\n${annotated}`;
    })
    .join("\n\n");
}

export function hydrateBlockText(
  block: SegmenterBlock,
  pagesByNumber: Map<number, ParsedPage>,
): string {
  if (block.page == null) return "";
  const page = pagesByNumber.get(block.page);
  if (!page) return "";
  const lines = page.text.split("\n");
  if (lines.length === 0) return "";
  const start = Math.max(1, block.line_start ?? 1);
  const end = Math.min(lines.length, block.line_end ?? start);
  if (end < start) return "";
  return lines.slice(start - 1, end).join("\n").trim();
}

async function segmentChunk(
  chunk: ParsedPage[],
  profile: ProfileResult,
): Promise<SegmenterBlock[]> {
  const pagesText = buildChunkPayload(chunk);
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

  // Sequential: distributes CPU/network across the function's runtime
  // instead of racing the Anthropic rate limit with N parallel calls.
  // Responses are now small (metadata only), so each chunk is quick.
  const chunkResults: SegmenterBlock[][] = [];
  for (const c of chunks) {
    chunkResults.push(await segmentChunk(c, profile));
  }

  const pagesByNumber = new Map<number, ParsedPage>();
  for (const p of pages) pagesByNumber.set(p.page_number, p);

  const hydrated: Block[] = chunkResults.flat().map((b) => ({
    ...b,
    text: hydrateBlockText(b, pagesByNumber),
  }));

  hydrated.forEach((b, i) => {
    b.block_id = `b${String(i + 1).padStart(4, "0")}`;
  });

  return { blocks: hydrated };
}
