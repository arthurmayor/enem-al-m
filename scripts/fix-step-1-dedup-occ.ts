/**
 * Passo 1: dedup question_occurrences for Fuvest provas.
 *
 * Multiple inserter re-runs created duplicate rows with the same
 * (exam_id, numero_na_prova). Keep the earliest (by created_at or id
 * order) and delete the rest. Doesn't touch questions / question_raw.
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
  const { data: exams, error: eErr } = await supa
    .from("exams").select("id, ano").eq("banca", "Fuvest").gte("ano", 2022);
  if (eErr) throw new Error(eErr.message);
  if (!exams) throw new Error("no exams");

  let totalDeleted = 0;
  for (const e of exams) {
    const { data: occs, error } = await supa
      .from("question_occurrences")
      .select("id, numero_na_prova, created_at, question_id")
      .eq("exam_id", e.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const byKey = new Map<number, { id: string; created_at: string; question_id: string }[]>();
    for (const o of occs ?? []) {
      const arr = byKey.get(o.numero_na_prova as number) ?? [];
      arr.push({ id: o.id as string, created_at: o.created_at as string, question_id: o.question_id as string });
      byKey.set(o.numero_na_prova as number, arr);
    }
    const toDelete: string[] = [];
    for (const [, rows] of byKey) {
      if (rows.length <= 1) continue;
      // Keep the earliest; delete the rest.
      for (let i = 1; i < rows.length; i++) toDelete.push(rows[i].id);
    }
    if (toDelete.length === 0) {
      console.log(`${e.ano}: ${occs?.length ?? 0} occurrences, no duplicates`);
      continue;
    }
    const CHUNK = 60;
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const slice = toDelete.slice(i, i + CHUNK);
      const { error: delErr } = await supa.from("question_occurrences").delete().in("id", slice);
      if (delErr) throw new Error(`delete ${e.ano}: ${delErr.message}`);
    }
    totalDeleted += toDelete.length;
    console.log(`${e.ano}: ${occs?.length ?? 0} occs → deleted ${toDelete.length} dups → kept ${(occs?.length ?? 0) - toDelete.length}`);
  }
  console.log(`\nTOTAL deleted: ${totalDeleted}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
