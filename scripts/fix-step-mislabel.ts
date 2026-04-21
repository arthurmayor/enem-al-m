/**
 * Targeted fix for the 2023 Q29/Q31 label swap uncovered during the
 * 90/90 sweep. The stored questions row cf2adb6e has the xiquexique
 * content (which belongs to Q29) but was labeled "Fuvest 2023 V Q31".
 * Its occurrence pointed at numero=31 with raw=17dc9901 (David Hume).
 *
 * Fix:
 *   1. Relabel question cf2adb6e source → "Fuvest 2023 V Q29" (keeps
 *      xiquexique content; avoids DELETE that would FK-conflict with
 *      answer_history).
 *   2. Rewire occurrence 306535f6 to numero=29 + raw=90ecfd4b (xiquexique
 *      raw).
 *   3. Flip raw 90ecfd4b: status deduped → inserted.
 *   4. Insert a new occurrence for qid=c5344c36 (the already-existing
 *      row with "David Hume" content, source "Fuvest 2023 V Q31") at
 *      numero=31 linked to raw 17dc9901.
 *
 * For 2022 the same sort of swap was already fixed in an earlier
 * invocation of this script (delete + reinsert path worked because no
 * answer_history rows pointed at that question).
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

const EXAM_2023 = "8e257562-730b-4580-8ea0-90a3fc88cabc";
const XIQUEXIQUE_QID = "cf2adb6e-b6ea-4821-b4b0-ed7f7929e26e";
const XIQUEXIQUE_OCC = "306535f6-0fb2-4dc6-bf5e-707ff8489985";
const RAW_Q29 = "90ecfd4b-d26e-4735-8d3a-7408934ee32e";
const RAW_Q31 = "17dc9901-f37c-493e-bc66-fbb5aa1725e0";
const DAVID_HUME_QID = "c5344c36-fb97-45fc-a269-5d6631b4d8f3";

async function main() {
  // 1. Relabel stored question cf2adb6e from Q31 → Q29 (matches content).
  const { error: qErr } = await supa.from("questions")
    .update({ source: "Fuvest 2023 V Q29" }).eq("id", XIQUEXIQUE_QID);
  if (qErr) throw new Error(`relabel question: ${qErr.message}`);
  console.log(`relabeled question ${XIQUEXIQUE_QID} → Q29`);

  // 2. Rewire occurrence 306535f6 to Q29 + raw_q29.
  const { data: rawQ29 } = await supa.from("question_raw")
    .select("source_pages").eq("id", RAW_Q29).maybeSingle();
  const { error: oErr } = await supa.from("question_occurrences")
    .update({
      numero_na_prova: 29,
      raw_question_id: RAW_Q29,
      source: "Fuvest 2023 V Q29",
      source_pages: (rawQ29?.source_pages as number[] | null) ?? null,
    })
    .eq("id", XIQUEXIQUE_OCC);
  if (oErr) throw new Error(`rewire occurrence: ${oErr.message}`);
  console.log(`rewired occurrence ${XIQUEXIQUE_OCC} → numero=29 raw=${RAW_Q29}`);

  // 3. Flip raw Q29: deduped → inserted.
  const { error: r29Err } = await supa.from("question_raw")
    .update({ status: "inserted" }).eq("id", RAW_Q29);
  if (r29Err) throw new Error(`flip raw q29: ${r29Err.message}`);
  console.log(`raw ${RAW_Q29} status → inserted`);

  // 4. Insert occurrence for the real Q31 (David Hume content).
  const { data: rawQ31 } = await supa.from("question_raw")
    .select("source_pages").eq("id", RAW_Q31).maybeSingle();
  const { error: occ2Err } = await supa.from("question_occurrences")
    .insert({
      question_id: DAVID_HUME_QID,
      exam_id: EXAM_2023,
      raw_question_id: RAW_Q31,
      numero_na_prova: 31,
      versao: "V",
      source: "Fuvest 2023 V Q31",
      source_pages: (rawQ31?.source_pages as number[] | null) ?? null,
    });
  if (occ2Err) throw new Error(`insert q31 occurrence: ${occ2Err.message}`);
  console.log(`inserted occurrence numero=31 → question ${DAVID_HUME_QID}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
