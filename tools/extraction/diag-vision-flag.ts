/**
 * Dry-run: downloads a prova PDF, runs the pre-parser, and reports which
 * pages would be flagged for the Vision fallback based on the same rules
 * encoded in extract-exam-local.ts. Does NOT call Claude Vision or touch
 * question_raw — purely diagnostic.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
 *   npx tsx tools/extraction/diag-vision-flag.ts <banca> <ano> [<versao>]
 *
 *   e.g.  diag-vision-flag.ts Fuvest 2025
 *         diag-vision-flag.ts Fuvest 2026 V1
 */
import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
import { extractText, getDocumentProxy } from "unpdf";
import {
  analyzePageText,
  VISION_PUA_THRESHOLD,
  VISION_RATIO_THRESHOLD,
} from "./extract-exam-local.js";

dns.setDefaultResultOrder("ipv4first");

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co";

const supabaseFetch: typeof fetch = async (input, init) => {
  const transient =
    /DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR|ETIMEDOUT|socket hang up|EAI_AGAIN|other side closed/i;
  const messages = (err: unknown): string => {
    const parts: string[] = [];
    let cur: unknown = err;
    for (let i = 0; i < 4 && cur; i++) {
      if (cur instanceof Error) {
        parts.push(cur.message);
        cur = (cur as Error & { cause?: unknown }).cause;
      } else { parts.push(String(cur)); break; }
    }
    return parts.join(" | ");
  };
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try { return await fetch(input, init); }
    catch (err) {
      lastErr = err;
      const msg = messages(err);
      if (transient.test(msg)) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, Math.min(attempt, 5))));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
};

const supa = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  global: { fetch: supabaseFetch },
});

async function withSupaRetry<T>(label: string, op: () => Promise<{ error: { message: string } | null; data?: T | null }>): Promise<T | null> {
  const transient = /DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR|ETIMEDOUT|socket hang up|EAI_AGAIN|other side closed/i;
  let lastMsg = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await op();
    if (!error) return (data ?? null) as T | null;
    lastMsg = error.message;
    if (!transient.test(lastMsg)) throw new Error(`${label}: ${lastMsg}`);
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, Math.min(attempt, 5))));
  }
  throw new Error(`${label}: ${lastMsg}`);
}

function splitStoragePath(p: string): { bucket: string; path: string } {
  const t = p.replace(/^\/+/, "");
  const i = t.indexOf("/");
  if (i === -1) return { bucket: "exam-files", path: t };
  return { bucket: t.slice(0, i), path: t.slice(i + 1) };
}

async function downloadPdf(storagePath: string): Promise<Uint8Array> {
  const { bucket, path } = splitStoragePath(storagePath);
  const { data, error } = await supa.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Falha ao baixar ${bucket}/${path}: ${error?.message}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

async function extractPages(buffer: Uint8Array) {
  const pdf = await getDocumentProxy(buffer);
  const result = await extractText(pdf, { mergePages: false });
  const rawPages: string[] = Array.isArray(result.text)
    ? result.text
    : [String(result.text ?? "")];
  return rawPages.map((text, i) => ({ page_number: i + 1, text: text ?? "" }));
}

function preview(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

async function main() {
  const [banca, anoStr, versao] = process.argv.slice(2);
  if (!banca || !anoStr) {
    console.error(
      "Uso: npx tsx tools/extraction/diag-vision-flag.ts <banca> <ano> [<versao>]",
    );
    process.exit(1);
  }
  const ano = Number(anoStr);

  const exams = await withSupaRetry<Array<{
    id: string; banca: string; ano: number; versao: string; total_questions_detected: number | null;
  }>>("select exams", async () => {
    let q = supa
      .from("exams")
      .select("id,banca,ano,versao,total_questions_detected")
      .eq("banca", banca)
      .eq("ano", ano);
    if (versao) q = q.eq("versao", versao);
    return await q;
  });
  if (!exams || exams.length === 0) {
    console.error(
      `nenhum exam encontrado para ${banca} ${ano}${versao ? " " + versao : ""}`,
    );
    process.exit(1);
  }

  for (const e of exams) {
    console.log(`\n=== ${e.banca} ${e.ano} ${e.versao} (${e.id}) ===`);
    // Find the latest seeded job that has a prova_storage_path.
    const jobs = await withSupaRetry<Array<{ prova_storage_path: string | null }>>(
      "select jobs",
      async () => await supa
        .from("extraction_jobs")
        .select("prova_storage_path,created_at")
        .eq("exam_id", e.id)
        .not("prova_storage_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(1),
    );
    const job = jobs?.[0];
    if (!job?.prova_storage_path) {
      console.log("  sem extraction_job com prova_storage_path");
      continue;
    }
    console.log(`  prova: ${job.prova_storage_path}`);

    const buf = await downloadPdf(job.prova_storage_path as string);
    const pages = await extractPages(buf);
    const totalChars = pages.reduce((s, p) => s + p.text.length, 0);
    console.log(`  ${pages.length} páginas, ${totalChars} chars`);
    console.log(
      `  thresholds: PUA≥${VISION_PUA_THRESHOLD} ou problemáticos≥${(VISION_RATIO_THRESHOLD * 100).toFixed(0)}%`,
    );

    const flagged: number[] = [];
    const verbose = process.env.VERBOSE === "1";
    for (const p of pages) {
      const a = analyzePageText(p.text);
      if (verbose && (a.puaCount + a.replacementCount + a.exoticCount > 0)) {
        console.log(
          `  [ALL]  página ${p.page_number.toString().padStart(2)}: pua=${a.puaCount} repl=${a.replacementCount} exotic=${a.exoticCount} subst=${a.substCount}` +
            (a.exoticBlocks.length ? ` (${a.exoticBlocks.join(",")})` : "") +
            ` | ${a.totalPrintable} chars | ${(a.problematicRatio * 100).toFixed(2)}%`,
        );
      }
      if (!a.needsVision) continue;
      flagged.push(p.page_number);
      console.log(
        `  [FLAG] página ${p.page_number.toString().padStart(2)}: pua=${a.puaCount} repl=${a.replacementCount} exotic=${a.exoticCount} subst=${a.substCount}` +
          (a.exoticBlocks.length ? ` (${a.exoticBlocks.join(",")})` : "") +
          ` | ${a.totalPrintable} chars | ${(a.problematicRatio * 100).toFixed(2)}%` +
          ` — ${a.reason}`,
      );
      console.log(`         preview: ${JSON.stringify(preview(p.text))}`);
    }

    if (flagged.length === 0) {
      // Still show a zero-problem summary per page for debugging.
      let worst = { page: 0, pua: 0, repl: 0, exotic: 0, subst: 0, ratio: 0 };
      for (const p of pages) {
        const a = analyzePageText(p.text);
        const score = a.puaCount + a.replacementCount + a.exoticCount + a.substCount;
        const worstScore = worst.pua + worst.repl + worst.exotic + worst.subst;
        if (score > worstScore) {
          worst = {
            page: p.page_number,
            pua: a.puaCount,
            repl: a.replacementCount,
            exotic: a.exoticCount,
            subst: a.substCount,
            ratio: a.problematicRatio,
          };
        }
      }
      console.log(
        `  ✔ nenhuma página flaggada. Pior página: ${worst.page} (pua=${worst.pua} repl=${worst.repl} exotic=${worst.exotic} subst=${worst.subst} ratio=${(worst.ratio * 100).toFixed(2)}%)`,
      );
    } else {
      console.log(
        `  TOTAL flaggado: ${flagged.length}/${pages.length} página(s) → ${flagged.join(",")}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
