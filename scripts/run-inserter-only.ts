/**
 * Minimal runner that only invokes the INSERTER stage of the local
 * pipeline — used to re-process approved rows after their blocking
 * issues have been resolved out-of-band.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
 *   npx tsx scripts/run-inserter-only.ts <exam_id>
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://nbfgqrjcrzgrprzqedtl.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CRITICAL_ISSUE_TYPES = new Set([
  "contaminacao",
  "imagem_incorreta",
  "legenda_quebrada",
  "alternativas_incorretas",
  "gabarito_invalido",
  "duplicata_provavel",
]);

interface AssembledOption {
  label: string;
  text: string;
  media_ref?: string | null;
}

function computeContentHash(stem: string, options: unknown[]): string {
  return createHash("sha256").update(stem + JSON.stringify(options)).digest("hex");
}
function computeNormalizedHash(stem: string, options: unknown[]): string {
  const normalized = stem
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized + JSON.stringify(options)).digest("hex");
}

async function loadExamMeta(examId: string) {
  const { data, error } = await supabase
    .from("exams")
    .select("banca, ano, versao")
    .eq("id", examId)
    .single();
  if (error || !data) throw new Error(`exam meta: ${error?.message}`);
  return data as { banca: string; ano: number; versao: string | null };
}

async function loadJobId(examId: string) {
  const { data } = await supabase
    .from("extraction_jobs")
    .select("id")
    .eq("exam_id", examId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function main(examId: string) {
  const examMeta = await loadExamMeta(examId);
  const jobId = await loadJobId(examId);
  if (!jobId) throw new Error("no job for exam");

  const { data: questions, error } = await supabase
    .from("question_raw")
    .select(
      "id, numero, stem, options, shared_context, note_e_adote, correct_answer, source_pages, confidence_score, enrichment, media_map",
    )
    .eq("exam_id", examId)
    .eq("status", "approved")
    .gte("confidence_score", 0.8)
    .order("numero", { ascending: true });
  if (error) throw new Error(`load: ${error.message}`);
  if (!questions?.length) {
    console.log("[INSERTER] nothing to insert");
    return;
  }

  const { data: blockerIssues } = await supabase
    .from("question_issues")
    .select("question_raw_id, severity, issue_type, resolved")
    .in("question_raw_id", questions.map((q) => q.id))
    .eq("resolved", false);
  const blockedIds = new Set<string>();
  for (const iss of blockerIssues ?? []) {
    if (
      iss.severity === "high" ||
      iss.severity === "critical" ||
      CRITICAL_ISSUE_TYPES.has(iss.issue_type as string)
    ) {
      blockedIds.add(iss.question_raw_id as string);
    }
  }

  let inserted = 0;
  let dedupedExact = 0;
  let flaggedNearDup = 0;
  let skippedNoEnrichment = 0;
  let skippedBlocked = 0;
  const insertedNumeros: number[] = [];
  const blockedNumeros: number[] = [];

  for (const q of questions) {
    if (blockedIds.has(q.id)) {
      skippedBlocked++;
      blockedNumeros.push(q.numero);
      continue;
    }
    const enrichment = q.enrichment as
      | {
          subject?: string;
          subtopic?: string;
          difficulty?: number;
          tags?: string[];
          competency?: string;
        }
      | null;
    if (!enrichment?.subject || !enrichment?.subtopic) {
      skippedNoEnrichment++;
      continue;
    }

    const rawOpts = Array.isArray(q.options) ? (q.options as AssembledOption[]) : [];
    const correctAns = String(q.correct_answer ?? "").trim();
    const convertedOptions = rawOpts.map((o) => ({
      label: o.label,
      text: o.text,
      is_correct: correctAns !== "" && correctAns !== "*" && o.label === correctAns,
    }));

    const stem = String(q.stem ?? "");
    const contentHash = computeContentHash(stem, convertedOptions);
    const normalizedHash = computeNormalizedHash(stem, convertedOptions);

    const { data: exact } = await supabase
      .from("questions")
      .select("id")
      .eq("content_hash", contentHash)
      .limit(1)
      .maybeSingle();
    if (exact?.id) {
      await supabase.from("question_occurrences").insert({
        question_id: exact.id,
        exam_id: examId,
        raw_question_id: q.id,
        numero_na_prova: q.numero,
        versao: examMeta.versao,
        source: `${examMeta.banca} ${examMeta.ano}${examMeta.versao ? " " + examMeta.versao : ""} Q${q.numero}`,
        source_pages: Array.isArray(q.source_pages) ? q.source_pages : null,
      });
      await supabase
        .from("question_raw")
        .update({ status: "deduped", content_hash: contentHash, normalized_hash: normalizedHash })
        .eq("id", q.id);
      dedupedExact++;
      continue;
    }

    const { data: near } = await supabase
      .from("questions")
      .select("id")
      .eq("normalized_hash", normalizedHash)
      .limit(1)
      .maybeSingle();
    if (near?.id) {
      await supabase.from("question_issues").insert({
        question_raw_id: q.id,
        job_id: jobId,
        issue_type: "duplicata_provavel",
        severity: "medium",
        description: `Possível duplicata de questions.id=${near.id} (mesmo normalized_hash)`,
        agent: "inserter",
      });
      await supabase
        .from("question_raw")
        .update({ status: "flagged", content_hash: contentHash, normalized_hash: normalizedHash })
        .eq("id", q.id);
      flaggedNearDup++;
      continue;
    }

    const difficulty =
      typeof enrichment.difficulty === "number" &&
      enrichment.difficulty >= 1 &&
      enrichment.difficulty <= 5
        ? enrichment.difficulty
        : 3;
    const source = `${examMeta.banca} ${examMeta.ano}${examMeta.versao ? " " + examMeta.versao : ""} Q${q.numero}`;

    const { data: ins, error: insErr } = await supabase
      .from("questions")
      .insert({
        exam_type: examMeta.banca,
        subject: enrichment.subject,
        subtopic: enrichment.subtopic,
        difficulty,
        question_text: stem,
        options: convertedOptions,
        year: examMeta.ano,
        tags: Array.isArray(enrichment.tags) ? enrichment.tags : null,
        source,
        shared_context: (q.shared_context as string | null) ?? null,
        note_e_adote: (q.note_e_adote as string | null) ?? null,
        exam_id: examId,
        raw_question_id: q.id,
        source_pages: Array.isArray(q.source_pages) ? q.source_pages : null,
        media_refs: Array.isArray(q.media_map) ? q.media_map : null,
        content_hash: contentHash,
        normalized_hash: normalizedHash,
        ingestion_version: 1,
        status: "approved",
      })
      .select("id")
      .single();
    if (insErr || !ins) {
      throw new Error(`insert q${q.numero}: ${insErr?.message ?? "unknown"}`);
    }
    await supabase.from("question_occurrences").insert({
      question_id: ins.id,
      exam_id: examId,
      raw_question_id: q.id,
      numero_na_prova: q.numero,
      versao: examMeta.versao,
      source,
      source_pages: Array.isArray(q.source_pages) ? q.source_pages : null,
    });
    await supabase
      .from("question_raw")
      .update({ status: "inserted", content_hash: contentHash, normalized_hash: normalizedHash })
      .eq("id", q.id);
    inserted++;
    insertedNumeros.push(q.numero);
  }

  console.log(
    `[INSERTER] inseridas=${inserted} dedup_exatas=${dedupedExact} flagged_near_dup=${flaggedNearDup} sem_enrichment=${skippedNoEnrichment} bloqueadas=${skippedBlocked}`,
  );
  console.log(`[INSERTER] inseridas numeros: ${insertedNumeros.join(", ")}`);
  if (blockedNumeros.length) {
    console.log(`[INSERTER] bloqueadas numeros: ${blockedNumeros.join(", ")}`);
  }
}

const examId = process.argv[2];
if (!examId) {
  console.error("Uso: npx tsx scripts/run-inserter-only.ts <exam_id>");
  process.exit(1);
}
main(examId).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
