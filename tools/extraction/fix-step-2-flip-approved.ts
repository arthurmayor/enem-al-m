/**
 * Passo 2 (Grupo A): flip all question_raw rows that are missing from
 * question_occurrences AND have NO unresolved issues back to
 * status='approved'. These are "false-positive" flags where Fase A/B
 * already resolved every blocker but the row stayed in flagged.
 *
 * Does NOT call Claude. Does NOT run the inserter; that's done in a
 * separate step so we can inspect the count first.
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

async function main() {
  const { data: exams } = await supa
    .from("exams").select("id, ano").eq("banca", "Fuvest").gte("ano", 2022).order("ano");
  if (!exams) throw new Error("no exams");

  let totalFlipped = 0;
  for (const e of exams) {
    const examId = e.id as string;
    const { data: rawRows } = await supa
      .from("question_raw").select("id, numero, status").eq("exam_id", examId);
    const { data: occRows } = await supa
      .from("question_occurrences").select("numero_na_prova").eq("exam_id", examId);
    const occSet = new Set<number>((occRows ?? []).map((o) => o.numero_na_prova as number));

    const missing = (rawRows ?? []).filter(
      (r) => !occSet.has(r.numero as number) && r.status !== "inserted" && r.status !== "deduped",
    );
    if (missing.length === 0) { console.log(`${e.ano}: nothing to flip`); continue; }

    const ids = missing.map((m) => m.id as string);
    const CHUNK = 60;
    const unresolvedIssues = new Set<string>();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data } = await supa
        .from("question_issues")
        .select("question_raw_id")
        .in("question_raw_id", slice)
        .eq("resolved", false);
      for (const r of data ?? []) unresolvedIssues.add(r.question_raw_id as string);
    }

    const toFlip = missing.filter((m) => !unresolvedIssues.has(m.id as string));
    const numerosFlipped = toFlip.map((m) => m.numero as number).sort((a, b) => a - b);
    console.log(`${e.ano}: missing=${missing.length}, with unresolved blockers=${unresolvedIssues.size}, to flip=${toFlip.length}`);
    if (toFlip.length === 0) continue;
    console.log(`  numeros: ${numerosFlipped.join(", ")}`);

    const flipIds = toFlip.map((m) => m.id as string);
    for (let i = 0; i < flipIds.length; i += CHUNK) {
      const slice = flipIds.slice(i, i + CHUNK);
      const { error } = await supa
        .from("question_raw")
        .update({ status: "approved" })
        .in("id", slice);
      if (error) throw new Error(`flip ${e.ano}: ${error.message}`);
    }
    totalFlipped += toFlip.length;
  }
  console.log(`\nTOTAL flipped to approved: ${totalFlipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
