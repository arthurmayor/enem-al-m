/**
 * Passo 4 (Grupo B2): Haiku-assisted shared_context recovery for the rows
 * that Passos 3a–3c could not heal heuristically.
 *
 * For each unresolved `shared_context_ausente` issue we send Haiku a
 * narrow slice of the segmenter blocks (same page ± 1 as the stem, plus
 * any block whose text or question_hint mentions our numero) and ask it
 * to pick which block (if any) is the missing context. Haiku returns
 * either a block_id to copy verbatim or a verdict that says "no textual
 * context; the image is the context".
 *
 * The tool_use contract is strict:
 *   { verdict: "text" | "image" | "none",
 *     block_id?: string,
 *     reason: string }
 *
 * We never let Haiku invent text — we always copy the chosen block's
 * text verbatim from the segmenter output.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

async function supabaseFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try { return await fetch(input, init); } catch (err) {
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

const supa: SupabaseClient = createClient(
  process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: supabaseFetch as typeof fetch } },
);

interface Block {
  block_id: string;
  type: string;
  text: string;
  question_hint: number | null;
  page: number | null;
  line_start: number | null;
  line_end: number | null;
}

const TOOL = {
  name: "pick_shared_context",
  description:
    "Identifica qual block_id contém o shared_context faltante de uma questão, ou indica que o contexto é imagem.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["text", "image", "none"],
        description:
          "'text' se um dos blocks é o contexto; 'image' se o contexto é uma figura/gráfico sem texto; 'none' se não dá pra recuperar.",
      },
      block_id: {
        type: "string",
        description: "block_id escolhido — obrigatório quando verdict='text'.",
      },
      reason: { type: "string", description: "Justificativa curta." },
    },
    required: ["verdict", "reason"],
  },
} as const;

function pickRelevantBlocks(allBlocks: Block[], numero: number, stemPage: number | null): Block[] {
  const rangeMin = stemPage !== null ? stemPage - 1 : null;
  const rangeMax = stemPage !== null ? stemPage + 1 : null;
  const selected: Block[] = [];
  for (const b of allBlocks) {
    if (b.type === "option" || b.type === "answer") continue;
    let keep = false;
    if (b.question_hint === numero) keep = true;
    if (
      !keep &&
      (b.type === "shared_context" || b.type === "figure_caption" || b.type === "figure" || b.type === "stem") &&
      b.page !== null &&
      rangeMin !== null &&
      rangeMax !== null &&
      b.page >= rangeMin &&
      b.page <= rangeMax
    ) {
      keep = true;
    }
    if (keep) selected.push(b);
  }
  return selected.slice(0, 25);
}

async function askHaiku(
  numero: number,
  stem: string,
  blocks: Block[],
): Promise<{ verdict: "text" | "image" | "none"; block_id?: string; reason: string } | null> {
  const blockJson = blocks.map((b) => ({
    block_id: b.block_id,
    type: b.type,
    page: b.page,
    question_hint: b.question_hint,
    text: b.text.slice(0, 4000),
  }));

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content:
          `Questão ${numero}. Enunciado (stem):\n"""\n${stem.slice(0, 2500)}\n"""\n\nBlocos candidatos extraídos do PDF:\n\n${JSON.stringify(blockJson, null, 2)}\n\nQual block_id é o shared_context dessa questão? Se nenhum for textual e o contexto for uma imagem/gráfico, responda verdict='image'. Se nem texto nem imagem cobrirem, responda 'none'.`,
      },
    ],
  });

  for (const c of msg.content) {
    if (c.type === "tool_use" && c.name === TOOL.name) {
      return c.input as { verdict: "text" | "image" | "none"; block_id?: string; reason: string };
    }
  }
  return null;
}

async function main() {
  const { data: exams } = await supa
    .from("exams").select("id, ano").eq("banca", "Fuvest").gte("ano", 2022).order("ano");
  if (!exams) throw new Error("no exams");

  let totalResolved = 0;
  let totalCalls = 0;

  for (const e of exams) {
    const examId = e.id as string;
    const { data: job } = await supa
      .from("extraction_jobs")
      .select("id, segmenter_blocks_json")
      .eq("exam_id", examId)
      .not("segmenter_blocks_json", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!job) { console.log(`${e.ano}: no job`); continue; }
    const blocks = (job.segmenter_blocks_json ?? []) as Block[];

    const { data: rawRows } = await supa
      .from("question_raw")
      .select("id, numero, stem, shared_context, media_map, source_pages")
      .eq("exam_id", examId);
    if (!rawRows) continue;

    const ids = rawRows.map((r) => r.id as string);
    const CHUNK = 60;
    const issues: Array<{ id: string; question_raw_id: string }> = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data } = await supa
        .from("question_issues")
        .select("id, question_raw_id")
        .eq("issue_type", "shared_context_ausente")
        .eq("resolved", false)
        .in("question_raw_id", slice);
      issues.push(...((data as typeof issues) ?? []));
    }
    if (issues.length === 0) { console.log(`${e.ano}: 0 pending`); continue; }
    console.log(`${e.ano}: ${issues.length} pending shared_context_ausente`);

    const byId = new Map<string, typeof rawRows[number]>();
    for (const r of rawRows) byId.set(r.id as string, r);

    let resolved = 0;
    for (const iss of issues) {
      const row = byId.get(iss.question_raw_id);
      if (!row) continue;
      const numero = row.numero as number;
      const stem = (row.stem as string | null) ?? "";
      if (row.shared_context && (row.shared_context as string).length > 30) {
        await supa
          .from("question_issues")
          .update({ resolved: true, resolution: "shared_context already present (haiku step confirmed)" })
          .eq("id", iss.id);
        resolved++;
        continue;
      }
      const stemPages = (row.source_pages as number[] | null) ?? [];
      const stemPage = stemPages.length > 0 ? stemPages[0] : null;
      const candidates = pickRelevantBlocks(blocks, numero, stemPage);
      if (candidates.length === 0) {
        // No candidate blocks; check for media.
        const media = Array.isArray(row.media_map) ? (row.media_map as unknown[]) : [];
        if (media.length > 0) {
          await supa
            .from("question_issues")
            .update({ resolved: true, resolution: "contexto é imagem, sem bloco textual (haiku skip)" })
            .eq("id", iss.id);
          resolved++;
        }
        continue;
      }

      totalCalls++;
      let verdict: Awaited<ReturnType<typeof askHaiku>> = null;
      try {
        verdict = await askHaiku(numero, stem, candidates);
      } catch (err) {
        console.log(`  q${numero}: haiku error ${err instanceof Error ? err.message : err}`);
        continue;
      }
      if (!verdict) continue;

      if (verdict.verdict === "text" && verdict.block_id) {
        const chosen = candidates.find((b) => b.block_id === verdict!.block_id);
        if (!chosen) {
          console.log(`  q${numero}: haiku returned unknown block_id=${verdict.block_id}`);
          continue;
        }
        await supa.from("question_raw").update({ shared_context: chosen.text }).eq("id", row.id as string);
        await supa
          .from("question_issues")
          .update({
            resolved: true,
            resolution: `Recovered via Haiku, block ${chosen.block_id} (p${chosen.page}). ${verdict.reason.slice(0, 180)}`,
          })
          .eq("id", iss.id);
        console.log(`  q${numero}: TEXT block ${chosen.block_id} (len=${chosen.text.length})`);
        resolved++;
      } else if (verdict.verdict === "image") {
        const media = Array.isArray(row.media_map) ? (row.media_map as unknown[]) : [];
        if (media.length > 0) {
          await supa
            .from("question_issues")
            .update({ resolved: true, resolution: `Haiku: contexto é imagem via media_map. ${verdict.reason.slice(0, 180)}` })
            .eq("id", iss.id);
          console.log(`  q${numero}: IMAGE (media_map has ${media.length})`);
          resolved++;
        } else {
          console.log(`  q${numero}: haiku said image but media_map is empty — skip, precisa asset extractor`);
        }
      } else {
        console.log(`  q${numero}: haiku verdict=none (${verdict.reason.slice(0, 80)})`);
      }
    }
    console.log(`${e.ano}: resolved ${resolved} / ${issues.length}`);
    totalResolved += resolved;
  }
  console.log(`\nTOTAL resolved via haiku: ${totalResolved} (calls=${totalCalls})`);
}

main().catch((err) => { console.error(err); process.exit(1); });
