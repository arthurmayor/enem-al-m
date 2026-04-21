import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

async function supabaseFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      let msg = err instanceof Error ? err.message : String(err);
      let cause: unknown = err;
      while (cause && typeof cause === "object" && "cause" in cause) {
        cause = (cause as { cause?: unknown }).cause;
        if (cause instanceof Error) msg += ` | ${cause.message}`;
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

async function withRetry<T>(
  label: string,
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await fn();
    if (!error) {
      if (data === null) throw new Error(`${label}: data null`);
      return data;
    }
    if (!/DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR|timeout/i.test(error.message)) {
      throw new Error(`${label}: ${error.message}`);
    }
    console.warn(`[RETRY ${label}] ${error.message}`);
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, Math.min(attempt, 5))));
  }
  throw new Error(`${label}: exceeded retries`);
}

async function main() {
  // Load all Fuvest exams + per-question shared_context + resolved issues
  // pointing at segmenter block ids from DIFFERENT provas.
  const exams = await withRetry<Array<{ id: string; ano: number; versao: string }>>(
    "exams",
    () => supa.from("exams").select("id,ano,versao").eq("banca", "Fuvest"),
  );
  const examById = new Map(exams.map((e) => [e.id, e]));

  // Load jobs with segmenter_blocks_json per exam, and their block_ids set.
  const jobRows = await withRetry<Array<{ id: string; exam_id: string; segmenter_blocks_json: unknown }>>(
    "jobs",
    () => supa
      .from("extraction_jobs")
      .select("id,exam_id,segmenter_blocks_json")
      .in("exam_id", exams.map((e) => e.id))
      .not("segmenter_blocks_json", "is", null)
      .order("created_at", { ascending: false }),
  );
  // For each exam, pick the latest job (first occurrence due to DESC order).
  const blockIdsByExam = new Map<string, Set<string>>();
  for (const j of jobRows) {
    if (blockIdsByExam.has(j.exam_id)) continue;
    const blocks = Array.isArray(j.segmenter_blocks_json)
      ? (j.segmenter_blocks_json as Array<{ block_id: string }>)
      : [];
    blockIdsByExam.set(j.exam_id, new Set(blocks.map((b) => b.block_id)));
  }

  // Load resolved issues with resolution referencing a block id, and join to
  // question_raw to get exam_id.
  const CHUNK = 60;
  const examIds = exams.map((e) => e.id);
  const rawIdRows: Array<{ id: string; exam_id: string }> = [];
  for (let i = 0; i < examIds.length; i += CHUNK) {
    const slice = examIds.slice(i, i + CHUNK);
    const part = await withRetry<typeof rawIdRows>(
      `raws ${i}`,
      () => supa.from("question_raw").select("id,exam_id").in("exam_id", slice),
    );
    rawIdRows.push(...part);
  }
  const examByRaw = new Map(rawIdRows.map((r) => [r.id, r.exam_id]));

  const rawIds = rawIdRows.map((r) => r.id);
  const issues: Array<{ question_raw_id: string; issue_type: string; resolved: boolean; resolution: string | null }> = [];
  for (let i = 0; i < rawIds.length; i += CHUNK) {
    const slice = rawIds.slice(i, i + CHUNK);
    const part = await withRetry<typeof issues>(
      `issues ${i}`,
      () => supa
        .from("question_issues")
        .select("question_raw_id,issue_type,resolved,resolution")
        .eq("issue_type", "shared_context_ausente")
        .eq("resolved", true)
        .in("question_raw_id", slice),
    );
    issues.push(...part);
  }

  console.log(`Resolved shared_context_ausente issues: ${issues.length}`);

  let crossProvaCount = 0;
  const suspects: Array<{ raw_id: string; exam_ano: number; block_id: string; block_from_ano: number | "?" }> = [];
  for (const i of issues) {
    const m = (i.resolution ?? "").match(/Recovered from segmenter block (\S+)/);
    if (!m) continue;
    const blockId = m[1];
    const targetExamId = examByRaw.get(i.question_raw_id);
    if (!targetExamId) continue;
    const targetExam = examById.get(targetExamId)!;
    // Find which exam's blocks contain this block_id.
    let sourceExamId: string | null = null;
    for (const [examId, blockIds] of blockIdsByExam) {
      if (blockIds.has(blockId)) {
        sourceExamId = examId;
        break;
      }
    }
    const sourceAno = sourceExamId ? examById.get(sourceExamId)?.ano ?? "?" : "?";
    if (sourceExamId && sourceExamId !== targetExamId) {
      crossProvaCount++;
      suspects.push({
        raw_id: i.question_raw_id,
        exam_ano: targetExam.ano,
        block_id: blockId,
        block_from_ano: sourceAno,
      });
    }
  }
  console.log(`\nCross-prova contaminações detectadas: ${crossProvaCount}`);
  if (suspects.length > 0) {
    console.log("\nSample (primeiros 30):");
    for (const s of suspects.slice(0, 30)) {
      console.log(
        `  raw=${s.raw_id} prova=${s.exam_ano} block=${s.block_id} from_prova=${s.block_from_ano}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
