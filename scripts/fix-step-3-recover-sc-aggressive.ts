/**
 * Passo 3 (Grupo B1): aggressive shared_context recovery.
 *
 * For every question_raw row with an unresolved shared_context_ausente
 * issue, try the following in order until one matches:
 *
 *   1. If a sibling question (numero ± 1..3) in the same exam already
 *      has a non-null shared_context AND this row's stem references a
 *      text ("o texto", "texto I/II/III", "o gráfico", "a figura"),
 *      copy the sibling's shared_context.
 *
 *   2. If any segmenter_blocks_json entry of type='shared_context'
 *      has a question_hint that equals our numero + 1 or numero - 1
 *      AND its text contains a numero reference matching ours (e.g.
 *      "TEXTO PARA AS QUESTÕES 46 A 48" when we're q46), use that.
 *
 *   3. If a block of type='figure_caption' or 'figure' mentions our
 *      numero explicitly, use its text as shared_context (for questions
 *      whose context is a figure/chart rendered as text).
 *
 * Resolves the shared_context_ausente issue(s) on the row.
 */
import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

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

const supa = createClient(
  "https://nbfgqrjcrzgrprzqedtl.supabase.co",
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
}

function stemNeedsSC(stem: string): boolean {
  const s = stem.toLowerCase();
  return (
    /\b(com base|segundo o texto|conforme o texto|no texto|nos textos|a figura|o gr[áa]fico|o mapa|a charge|o cartum|a tira|analise|considere|com rela[çc][ãa]o|quadrinho|poema|na letra|verso|cartilha|modelos at[ôo]micos|dados do|material [abcde]|nas condi[çc][õo]es|observe|apresentado|mostrado|texto [iI][iI]?[iI]?|reação|esquema|exposto|vers[ao]|no anúncio|no poema)\b/.test(s)
  );
}

function extractNumerosFromText(text: string): number[] {
  const out: number[] = [];
  const re = /QUEST[ÕO]ES?\s+(?:DE\s+)?(\d{1,3})\s*(?:A|-|–|—|ATÉ|E)\s*(\d{1,3})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    if (b >= a && b - a < 20) for (let i = a; i <= b; i++) out.push(i);
  }
  const re2 = /\{(\d{1,3})\}/g;
  while ((m = re2.exec(text)) !== null) out.push(parseInt(m[1], 10));
  return [...new Set(out)];
}

async function main() {
  const { data: exams } = await supa
    .from("exams").select("id, ano").eq("banca", "Fuvest").gte("ano", 2022).order("ano");
  if (!exams) throw new Error("no exams");

  let totalResolved = 0;
  for (const e of exams) {
    const examId = e.id as string;
    // Load segmenter blocks (latest job)
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

    // Load all question_raw rows with their SC.
    const { data: allRows } = await supa
      .from("question_raw")
      .select("id, numero, stem, shared_context, status")
      .eq("exam_id", examId);
    if (!allRows) continue;
    const byNumero = new Map<number, { id: string; numero: number; stem: string; shared_context: string | null; status: string }>();
    for (const r of allRows) {
      byNumero.set(r.numero as number, {
        id: r.id as string, numero: r.numero as number, stem: (r.stem ?? "") as string,
        shared_context: (r.shared_context ?? null) as string | null, status: (r.status ?? "") as string,
      });
    }

    // Load unresolved shared_context_ausente issues.
    const ids = allRows.map((r) => r.id as string);
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
    console.log(`${e.ano}: ${issues.length} shared_context_ausente unresolved`);
    if (issues.length === 0) continue;

    // Build per-numero SC candidates from blocks that mention numeros in text.
    const blockHintByNumero = new Map<number, Block[]>();
    for (const b of blocks) {
      if (b.type !== "shared_context") continue;
      const declared = extractNumerosFromText(b.text);
      if (typeof b.question_hint === "number") declared.push(b.question_hint);
      for (const n of [...new Set(declared)]) {
        const arr = blockHintByNumero.get(n) ?? [];
        arr.push(b);
        blockHintByNumero.set(n, arr);
      }
    }

    let resolved = 0;
    for (const iss of issues) {
      // Find the numero for this issue.
      let target: ReturnType<typeof byNumero.get> | undefined;
      for (const [n, r] of byNumero) {
        if (r.id === iss.question_raw_id) { target = r; void n; break; }
      }
      if (!target) continue;
      if (target.shared_context && target.shared_context.length > 30) {
        // Already has SC — just resolve the issue.
        await supa.from("question_issues").update({ resolved: true, resolution: "shared_context already present (aggressive recover confirmed)" }).eq("id", iss.id);
        resolved++; continue;
      }
      const stem = target.stem;
      if (!stemNeedsSC(stem)) continue;

      let chosen: Block | null = null;
      let reason = "";

      // 1. Look at segmenter blocks referencing this numero (via declared range).
      const candidates1 = blockHintByNumero.get(target.numero) ?? [];
      if (candidates1.length > 0) {
        chosen = candidates1.reduce((a, b) => (a.text.length >= b.text.length ? a : b));
        reason = `block ${chosen.block_id} declared numero ${target.numero}`;
      }

      // 2. Look at sibling question (numero - 1..3, numero + 1..3) shared_context.
      if (!chosen) {
        for (const delta of [-1, 1, -2, 2, -3, 3]) {
          const sib = byNumero.get(target.numero + delta);
          if (sib?.shared_context && sib.shared_context.length > 30) {
            target.shared_context = sib.shared_context;
            reason = `sibling q${sib.numero} shared_context`;
            break;
          }
        }
        if (reason) {
          // Apply sibling SC.
          await supa.from("question_raw").update({ shared_context: target.shared_context }).eq("id", target.id);
          await supa.from("question_issues").update({ resolved: true, resolution: `Recovered from ${reason}` }).eq("id", iss.id);
          resolved++;
          continue;
        }
      }

      // 3. Try figure_caption / figure blocks referencing numero.
      if (!chosen) {
        const fig = blocks.filter(
          (b) => (b.type === "figure_caption" || b.type === "figure") && (b.question_hint === target.numero || extractNumerosFromText(b.text).includes(target.numero)),
        );
        if (fig.length > 0) {
          chosen = fig.reduce((a, b) => (a.text.length >= b.text.length ? a : b));
          reason = `figure block ${chosen.block_id}`;
        }
      }

      if (chosen) {
        await supa.from("question_raw").update({ shared_context: chosen.text }).eq("id", target.id);
        await supa.from("question_issues").update({ resolved: true, resolution: `Recovered from ${reason}` }).eq("id", iss.id);
        resolved++;
      }
    }
    console.log(`${e.ano}: resolved ${resolved} / ${issues.length}`);
    totalResolved += resolved;
  }
  console.log(`\nTOTAL resolved: ${totalResolved}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
