/**
 * One-off cleanup: the previous recover-shared-context.ts had a bug where
 * it fetched question_issues globally (not filtered by exam_id) and used
 * ONE prova's segmenter_blocks to fill shared_context on rows of OTHER
 * provas when their numero happened to collide. This script:
 *
 *   1. Finds every resolved shared_context_ausente issue whose resolution
 *      references a block_id that belongs to a DIFFERENT exam than the
 *      issue's question_raw row.
 *   2. Clears the stale shared_context (sets it back to NULL).
 *   3. Re-opens the issue (resolved=false, resolution=null) so the fixed
 *      recover script can re-run.
 */
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

async function withRetry<T>(
  label: string,
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await fn();
    if (!error) return data;
    if (!/DNS cache overflow|ENOTFOUND|ECONNRESET|fetch failed|UND_ERR|timeout/i.test(error.message)) {
      throw new Error(`${label}: ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, Math.min(attempt, 5))));
  }
  throw new Error(`${label}: exceeded retries`);
}

async function mustRetry<T>(
  label: string,
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const r = await withRetry(label, fn);
  if (r === null) throw new Error(`${label}: data null`);
  return r;
}

async function main() {
  const exams = await mustRetry<Array<{ id: string; ano: number }>>(
    "exams",
    () => supa.from("exams").select("id,ano").eq("banca", "Fuvest"),
  );

  const jobRows = await mustRetry<Array<{ id: string; exam_id: string; segmenter_blocks_json: unknown }>>(
    "jobs",
    () => supa
      .from("extraction_jobs")
      .select("id,exam_id,segmenter_blocks_json")
      .in("exam_id", exams.map((e) => e.id))
      .not("segmenter_blocks_json", "is", null)
      .order("created_at", { ascending: false }),
  );
  const blockIdsByExam = new Map<string, Set<string>>();
  for (const j of jobRows) {
    if (blockIdsByExam.has(j.exam_id)) continue;
    const blocks = Array.isArray(j.segmenter_blocks_json)
      ? (j.segmenter_blocks_json as Array<{ block_id: string }>)
      : [];
    blockIdsByExam.set(j.exam_id, new Set(blocks.map((b) => b.block_id)));
  }

  const examIds = exams.map((e) => e.id);
  const CHUNK = 60;
  const rawIdRows: Array<{ id: string; exam_id: string }> = [];
  for (let i = 0; i < examIds.length; i += CHUNK) {
    const slice = examIds.slice(i, i + CHUNK);
    const part = await mustRetry<typeof rawIdRows>(
      `raws ${i}`,
      () => supa.from("question_raw").select("id,exam_id").in("exam_id", slice),
    );
    rawIdRows.push(...part);
  }
  const examByRaw = new Map(rawIdRows.map((r) => [r.id, r.exam_id]));
  const rawIds = rawIdRows.map((r) => r.id);

  const issues: Array<{
    id: string;
    question_raw_id: string;
    resolution: string | null;
  }> = [];
  for (let i = 0; i < rawIds.length; i += CHUNK) {
    const slice = rawIds.slice(i, i + CHUNK);
    const part = await mustRetry<typeof issues>(
      `issues ${i}`,
      () => supa
        .from("question_issues")
        .select("id,question_raw_id,resolution")
        .eq("issue_type", "shared_context_ausente")
        .eq("resolved", true)
        .in("question_raw_id", slice),
    );
    issues.push(...part);
  }

  const contaminated: Array<{ issue_id: string; raw_id: string }> = [];
  for (const i of issues) {
    const m = (i.resolution ?? "").match(/Recovered from segmenter block (\S+)/);
    if (!m) continue;
    const blockId = m[1];
    const targetExamId = examByRaw.get(i.question_raw_id);
    if (!targetExamId) continue;
    let sourceExamId: string | null = null;
    for (const [examId, blockIds] of blockIdsByExam) {
      if (blockIds.has(blockId)) {
        sourceExamId = examId;
        break;
      }
    }
    if (sourceExamId && sourceExamId !== targetExamId) {
      contaminated.push({ issue_id: i.id, raw_id: i.question_raw_id });
    }
  }
  console.log(`Contaminated rows to clean: ${contaminated.length}`);

  const rawsToReset = [...new Set(contaminated.map((c) => c.raw_id))];
  const issuesToReopen = [...new Set(contaminated.map((c) => c.issue_id))];

  // 1. Clear shared_context on affected question_raw.
  for (let i = 0; i < rawsToReset.length; i += CHUNK) {
    const slice = rawsToReset.slice(i, i + CHUNK);
    await withRetry<unknown>(
      `clear shared_context ${i}`,
      () => supa
        .from("question_raw")
        .update({ shared_context: null })
        .in("id", slice) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>,
    );
    console.log(`[CLEAN] cleared shared_context on ${slice.length} rows (${i + slice.length}/${rawsToReset.length})`);
  }

  // 2. Reopen the resolved issues.
  for (let i = 0; i < issuesToReopen.length; i += CHUNK) {
    const slice = issuesToReopen.slice(i, i + CHUNK);
    await withRetry<unknown>(
      `reopen issues ${i}`,
      () => supa
        .from("question_issues")
        .update({ resolved: false, resolution: null })
        .in("id", slice) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>,
    );
    console.log(`[CLEAN] reopened ${slice.length} issues (${i + slice.length}/${issuesToReopen.length})`);
  }

  console.log(`\nDone. ${rawsToReset.length} raws cleaned, ${issuesToReopen.length} issues reopened.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
