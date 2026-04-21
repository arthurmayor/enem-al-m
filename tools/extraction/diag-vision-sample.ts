/**
 * End-to-end smoke test for the Vision fallback:
 *   1. Download a prova PDF from storage (latest extraction_job).
 *   2. Render a specific page to PNG via `renderPageAsImage` + @napi-rs/canvas.
 *   3. Call `transcribeWithVision` (Claude Sonnet).
 *   4. Print the first N characters of the transcription so the operator can
 *      eyeball whether problem chars (¬, PUA, Ethiopic, …) were cleaned up.
 *
 * Does NOT touch the database.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
 *   npx tsx tools/extraction/diag-vision-sample.ts <banca> <ano> <versao> <page>
 *
 *   e.g.  diag-vision-sample.ts Fuvest 2026 V1 8
 *         diag-vision-sample.ts Fuvest 2025 V  21
 */
import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
import {
  analyzePageText,
  transcribeWithVision,
} from "./extract-exam-local.js";
import { renderPageAsImage } from "unpdf";

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
      } else {
        parts.push(String(cur));
        break;
      }
    }
    return parts.join(" | ");
  };
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      const msg = messages(err);
      if (transient.test(msg)) {
        await new Promise((r) =>
          setTimeout(r, 500 * Math.pow(2, Math.min(attempt, 5))),
        );
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

function splitStoragePath(p: string): { bucket: string; path: string } {
  const t = p.replace(/^\/+/, "");
  const i = t.indexOf("/");
  if (i === -1) return { bucket: "exam-files", path: t };
  return { bucket: t.slice(0, i), path: t.slice(i + 1) };
}

async function main() {
  const [banca, anoStr, versao, pageStr] = process.argv.slice(2);
  if (!banca || !anoStr || !versao || !pageStr) {
    console.error(
      "Uso: npx tsx tools/extraction/diag-vision-sample.ts <banca> <ano> <versao> <page>",
    );
    process.exit(1);
  }
  const ano = Number(anoStr);
  const pageNumber = Number(pageStr);

  const { data: exam, error: examErr } = await supa
    .from("exams")
    .select("id,banca,ano,versao")
    .eq("banca", banca)
    .eq("ano", ano)
    .eq("versao", versao)
    .maybeSingle();
  if (examErr || !exam) {
    console.error(`exam não encontrado: ${examErr?.message ?? "null"}`);
    process.exit(1);
  }

  const { data: job } = await supa
    .from("extraction_jobs")
    .select("prova_storage_path")
    .eq("exam_id", exam.id)
    .not("prova_storage_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const storagePath = job?.prova_storage_path as string | undefined;
  if (!storagePath) {
    console.error(`sem extraction_job com prova_storage_path`);
    process.exit(1);
  }

  const { bucket, path } = splitStoragePath(storagePath);
  console.log(`baixando ${bucket}/${path} ...`);
  const { data, error } = await supa.storage.from(bucket).download(path);
  if (error || !data) {
    console.error(`download falhou: ${error?.message}`);
    process.exit(1);
  }
  const buf = new Uint8Array(await data.arrayBuffer());
  console.log(`PDF: ${buf.byteLength} bytes`);

  console.log(`renderizando página ${pageNumber} (scale=2.0)...`);
  const ab = await renderPageAsImage(buf, pageNumber, {
    scale: 2.0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvas: () => import("@napi-rs/canvas") as any,
  });
  const png = Buffer.from(ab);
  console.log(`PNG: ${png.byteLength} bytes`);

  console.log(`chamando Claude Vision...`);
  const t0 = Date.now();
  const text = await transcribeWithVision(png, pageNumber);
  const dt = Date.now() - t0;
  console.log(`Vision retornou ${text.length} chars em ${dt}ms`);

  const a = analyzePageText(text);
  console.log(
    `análise do texto Vision: pua=${a.puaCount} repl=${a.replacementCount} exotic=${a.exoticCount} subst=${a.substCount} ratio=${(a.problematicRatio * 100).toFixed(2)}% → needsVision=${a.needsVision}`,
  );

  const preview = text.slice(0, 1500);
  console.log("\n── preview (primeiros 1500 chars) ──");
  console.log(preview);
  if (text.length > 1500) console.log(`\n... (+${text.length - 1500} chars)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
