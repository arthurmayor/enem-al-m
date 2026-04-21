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
  const { data: exams, error: exErr } = await supa
    .from("exams").select("id, ano").eq("banca", "Fuvest").gte("ano", 2022).order("ano");
  if (exErr) throw new Error(exErr.message);
  if (!exams) throw new Error("no exams");
  for (const e of exams) {
    const { data: occs } = await supa
      .from("question_occurrences").select("numero_na_prova, raw_question_id").eq("exam_id", e.id);
    const distinctNumeros = new Set<number>((occs ?? []).map((o) => o.numero_na_prova as number));
    const distinctRawIds = new Set<string>((occs ?? []).map((o) => (o.raw_question_id as string) ?? ""));
    console.log(
      `${e.ano}: total_occ=${occs?.length ?? 0} distinct_numeros=${distinctNumeros.size} distinct_raw_ids=${distinctRawIds.size}`,
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
