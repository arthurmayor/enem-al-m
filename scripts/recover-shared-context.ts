/**
 * One-off: recovers missing shared_context for question_raw rows that were
 * flagged by the reviewer with issue_type='shared_context_ausente'. The
 * segmenter already emits shared_context blocks; many are orphans
 * (question_hint = null) because the text explicitly spans multiple
 * questions (e.g. "TEXTO PARA AS QUESTÕES 27 A 29"). This script re-links
 * those orphans to the correct question numbers, updates question_raw,
 * and resolves the issue.
 *
 * For questions whose context is a figure/chart (no textual block but a
 * media_map entry exists), the issue is resolved with a note that the
 * context is the image itself.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/recover-shared-context.ts <exam_id>
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Block {
  block_id: string;
  type: string;
  page: number | null;
  line_start: number | null;
  line_end: number | null;
  question_hint: number | null;
  text: string;
}

// "TEXTO PARA AS QUESTÕES 27 A 29" / "... DE 27 A 29" / "... 37 E 38"
function parseQuestionRangeHeader(text: string): number[] | null {
  const first = text.split("\n").slice(0, 3).join(" ").toUpperCase();
  const mRange = first.match(/TEXTO PARA AS? QUEST[ÕO]ES?(?:\s+DE)?\s+(\d{1,3})\s*(?:A|-|–|—|ATÉ)\s*(\d{1,3})/);
  if (mRange) {
    const a = parseInt(mRange[1], 10);
    const b = parseInt(mRange[2], 10);
    if (b >= a && b - a < 20) return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  const mPair = first.match(/TEXTO PARA AS? QUEST[ÕO]ES?\s+(\d{1,3})\s+E\s+(\d{1,3})/);
  if (mPair) {
    return [parseInt(mPair[1], 10), parseInt(mPair[2], 10)];
  }
  return null;
}

// "{27}" header sometimes appears in shared_context blocks that are just a
// number pointing to a single question.
function parseBracketedNumero(text: string): number | null {
  const m = text.match(/\{(\d{1,3})\}/);
  return m ? parseInt(m[1], 10) : null;
}

function stemNeedsContext(stem: string): boolean {
  const s = stem.toLowerCase();
  return (
    /\b(com base|segundo o texto|conforme o texto|no texto|nos textos|a figura|o gr[áa]fico|o mapa|a charge|o cartum|a tira|analise|considere|com rela[çc][ãa]o|quadrinho|poema|na letra|verso|cartilha|modelos at[ôo]micos|dados do|material [abcde]|nas condi[çc][õo]es)\b/.test(
      s,
    )
  );
}

async function main(examId: string) {
  // 1. Load latest job's segmenter blocks.
  const { data: job, error: jobErr } = await supabase
    .from("extraction_jobs")
    .select("id, segmenter_blocks_json")
    .eq("exam_id", examId)
    .not("segmenter_blocks_json", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobErr || !job) throw new Error(`no job: ${jobErr?.message}`);
  const blocks = job.segmenter_blocks_json as Block[];
  console.log(`[REC] job=${job.id} blocks=${blocks.length}`);

  // 2. Load all question_raw rows that have an unresolved
  //    shared_context_ausente issue.
  const { data: issueRows, error: issErr } = await supabase
    .from("question_issues")
    .select(
      "id, question_raw_id, severity, description, question_raw:question_raw_id(id, numero, stem, source_pages, shared_context, media_map, status)",
    )
    .eq("issue_type", "shared_context_ausente")
    .eq("resolved", false);
  if (issErr) throw new Error(`issues: ${issErr.message}`);
  const targets = (issueRows ?? []).filter((r) => {
    const qr = r.question_raw as unknown as {
      id: string;
      numero: number;
      stem: string;
      source_pages: number[] | null;
      shared_context: string | null;
      media_map: unknown;
      status: string;
    } | null;
    return qr && (qr.status === "approved" || qr.status === "flagged");
  });
  console.log(`[REC] ${targets.length} questões com shared_context_ausente`);

  // 3. Build per-question index of explicit shared_context blocks
  //    (matched either by question_hint or by range header).
  const scByNumero = new Map<number, Block[]>();
  for (const b of blocks) {
    if (b.type !== "shared_context") continue;
    const numeros: number[] = [];
    if (typeof b.question_hint === "number") {
      numeros.push(b.question_hint);
    }
    const range = parseQuestionRangeHeader(b.text);
    if (range) numeros.push(...range);
    const single = parseBracketedNumero(b.text);
    if (single && numeros.length === 0) numeros.push(single);
    for (const n of numeros) {
      const arr = scByNumero.get(n) ?? [];
      arr.push(b);
      scByNumero.set(n, arr);
    }
  }

  // 4. Also build a page-level index so we can fall back to "nearest
  //    shared_context block on the same page that appears before the stem".
  const scByPage = new Map<number, Block[]>();
  for (const b of blocks) {
    if (b.type !== "shared_context") continue;
    if (typeof b.page !== "number") continue;
    const arr = scByPage.get(b.page) ?? [];
    arr.push(b);
    scByPage.set(b.page, arr);
  }
  for (const arr of scByPage.values()) {
    arr.sort((a, b) => (a.line_start ?? 0) - (b.line_start ?? 0));
  }

  // Find the stem block for a given numero to know its (page,line_start).
  const stemByNumero = new Map<number, Block>();
  for (const b of blocks) {
    if ((b.type === "stem" || b.type === "question_start") && typeof b.question_hint === "number") {
      const prev = stemByNumero.get(b.question_hint);
      if (!prev || (b.type === "stem" && prev.type !== "stem")) {
        stemByNumero.set(b.question_hint, b);
      }
    }
  }

  let recoveredText = 0;
  let resolvedAsImage = 0;
  let unrecoverable = 0;
  const perItem: Array<{
    numero: number;
    action: "text" | "image" | "skip";
    note: string;
  }> = [];

  for (const row of targets) {
    const qr = row.question_raw as unknown as {
      id: string;
      numero: number;
      stem: string;
      source_pages: number[] | null;
      shared_context: string | null;
      media_map: unknown;
    };

    // 4a. Try direct match by numero (question_hint or range header).
    const direct = scByNumero.get(qr.numero);
    let chosen: Block | null = null;
    if (direct && direct.length > 0) {
      // Prefer longest text when multiple match.
      chosen = direct.reduce((a, b) => (a.text.length >= b.text.length ? a : b));
    }

    // 4b. Fallback: nearest shared_context block on same page before stem.
    if (!chosen) {
      const stemBlock = stemByNumero.get(qr.numero);
      if (stemBlock && typeof stemBlock.page === "number") {
        const candidates = scByPage.get(stemBlock.page) ?? [];
        const before = candidates.filter(
          (b) => (b.line_start ?? 0) < (stemBlock.line_start ?? Infinity),
        );
        if (before.length > 0) {
          // Only use if the stem actually references a context.
          if (stemNeedsContext(qr.stem)) {
            chosen = before[before.length - 1];
          }
        }
      }
    }

    if (chosen) {
      const { error: upErr } = await supabase
        .from("question_raw")
        .update({ shared_context: chosen.text })
        .eq("id", qr.id);
      if (upErr) {
        console.log(`[REC] q${qr.numero} update err: ${upErr.message}`);
        continue;
      }
      await supabase
        .from("question_issues")
        .update({
          resolved: true,
          resolution: `Recovered from segmenter block ${chosen.block_id} (page ${chosen.page})`,
        })
        .eq("id", row.id as string);
      recoveredText++;
      perItem.push({
        numero: qr.numero,
        action: "text",
        note: `block=${chosen.block_id} len=${chosen.text.length}`,
      });
      continue;
    }

    // 4c. No textual context found. If the question has a media_map with
    //     items, assume the context IS the image and resolve the issue.
    const mediaItems = Array.isArray(qr.media_map) ? (qr.media_map as unknown[]) : [];
    if (mediaItems.length > 0) {
      await supabase
        .from("question_issues")
        .update({
          resolved: true,
          resolution: "contexto é imagem, referenciado via media_map",
        })
        .eq("id", row.id as string);
      resolvedAsImage++;
      perItem.push({ numero: qr.numero, action: "image", note: `media_items=${mediaItems.length}` });
      continue;
    }

    unrecoverable++;
    perItem.push({ numero: qr.numero, action: "skip", note: "no block, no media" });
  }

  console.table(perItem);
  console.log(
    `[REC] resumo: ${recoveredText} com texto, ${resolvedAsImage} como imagem, ${unrecoverable} sem recuperação`,
  );
}

const examId = process.argv[2];
if (!examId) {
  console.error("Uso: npx tsx scripts/recover-shared-context.ts <exam_id>");
  process.exit(1);
}

main(examId).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
