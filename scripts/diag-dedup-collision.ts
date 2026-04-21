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
  const qids = [
    { qid: "425a4715-6026-4144-a363-7ff30dab34bb", label: "2022 Q39 (collision with q35)" },
    { qid: "cf2adb6e-b6ea-4821-b4b0-ed7f7929e26e", label: "2023 Q31 (collision with q29)" },
  ];
  for (const { qid, label } of qids) {
    console.log(`\n=== ${label} ===`);
    const { data: q } = await supa.from("questions").select("id, source, question_text, options").eq("id", qid).maybeSingle();
    if (q) {
      console.log(`  source="${q.source}" stem="${(q.question_text as string).slice(0, 80)}..."`);
      const opts = q.options as Array<{ label: string; text: string }>;
      for (const o of opts) console.log(`    (${o.label}) "${(o.text ?? "").slice(0, 60)}"`);
    }
    const { data: occs } = await supa.from("question_occurrences").select("id, exam_id, numero_na_prova, raw_question_id, source").eq("question_id", qid);
    for (const o of occs ?? []) console.log(`  occ: exam=${o.exam_id} num=${o.numero_na_prova} src="${o.source}" raw=${o.raw_question_id}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
