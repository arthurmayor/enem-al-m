/**
 * Diag: for a given (exam, numero), find all question_raw rows, all
 * question_occurrences that previously pointed at that numero, and the
 * question.id they would dedup against so we know what to do.
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
  const cases: Array<{ examId: string; ano: number; numeros: number[] }> = [
    { examId: "86dbad16-ad82-429f-8afb-dda157f53f6a", ano: 2022, numeros: [35] },
    { examId: "8e257562-730b-4580-8ea0-90a3fc88cabc", ano: 2023, numeros: [29] },
  ];
  for (const c of cases) {
    for (const numero of c.numeros) {
      const { data: raws } = await supa
        .from("question_raw")
        .select("id, numero, status, content_hash, normalized_hash")
        .eq("exam_id", c.examId).eq("numero", numero);
      console.log(`\n${c.ano} q${numero}:`);
      for (const r of raws ?? []) {
        console.log(`  raw=${r.id} status=${r.status} ch=${r.content_hash?.slice(0,12)} nh=${r.normalized_hash?.slice(0,12)}`);
        const { data: occs } = await supa
          .from("question_occurrences")
          .select("id, exam_id, numero_na_prova, question_id, raw_question_id, created_at")
          .eq("raw_question_id", r.id);
        for (const o of occs ?? []) console.log(`    occ_by_raw=${o.id} exam=${o.exam_id} num=${o.numero_na_prova} qid=${o.question_id} at=${o.created_at}`);
        if (r.content_hash) {
          const { data: q } = await supa.from("questions").select("id, source, exam_id, year").eq("content_hash", r.content_hash);
          for (const qq of q ?? []) console.log(`    question by ch: qid=${qq.id} src="${qq.source}" exam=${qq.exam_id} year=${qq.year}`);
        }
      }
      const { data: allOccs } = await supa.from("question_occurrences")
        .select("id, numero_na_prova, question_id, raw_question_id, created_at")
        .eq("exam_id", c.examId).eq("numero_na_prova", numero);
      console.log(`  current occurrences with numero=${numero}:`);
      for (const o of allOccs ?? []) console.log(`    ${o.id} raw=${o.raw_question_id} q=${o.question_id}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
