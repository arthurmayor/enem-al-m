import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ParsedPage } from "../_shared/pre-parser.ts";
import type { ProfileResult } from "../_shared/profiler.ts";
import { runSegmenter } from "../_shared/segmenter.ts";
import { runAssembler } from "../_shared/assembler.ts";
import { runGabaritoLinker } from "../_shared/gabarito-linker.ts";
import { runStage, markJobError } from "../_shared/stages.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface RequestBody {
  job_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST with JSON body." }, 405);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados" },
      500,
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Body inválido — esperado JSON" }, 400);
  }

  const jobId = body.job_id;
  if (!jobId) {
    return jsonResponse({ error: "Campo obrigatório: job_id" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: job, error: jobErr } = await supabase
    .from("extraction_jobs")
    .select("id, exam_id, pre_parser_pages, profile_json, gabarito_storage_path")
    .eq("id", jobId)
    .single();
  if (jobErr || !job) {
    return jsonResponse(
      { error: `Job ${jobId} não encontrado: ${jobErr?.message ?? "unknown"}` },
      404,
    );
  }

  const pages = job.pre_parser_pages as ParsedPage[] | null;
  const profile = job.profile_json as ProfileResult | null;
  const examId = job.exam_id as string;
  const gabaritoPath = job.gabarito_storage_path as string | null;

  if (!Array.isArray(pages) || pages.length === 0) {
    const msg = "Job sem pre_parser_pages — rode a phase 1 (extract-exam) primeiro.";
    await markJobError(supabase, jobId, msg);
    return jsonResponse({ job_id: jobId, status: "error", error: msg }, 400);
  }
  if (!profile) {
    const msg = "Job sem profile_json — rode a phase 1 (extract-exam) primeiro.";
    await markJobError(supabase, jobId, msg);
    return jsonResponse({ job_id: jobId, status: "error", error: msg }, 400);
  }

  try {
    // ───── SEGMENTER ─────
    const segResult = await runStage(supabase, jobId, "segmenting", () =>
      runSegmenter(pages, profile),
    );

    // ───── ASSEMBLER ─────
    const asmResult = await runStage(supabase, jobId, "assembling", () =>
      runAssembler(supabase, examId, jobId, segResult.blocks, profile),
    );

    // ───── GABARITO LINKER ─────
    const gabaritoResult = await runStage(supabase, jobId, "linking_gabarito", () =>
      runGabaritoLinker(supabase, examId, jobId, gabaritoPath),
    );

    // Pipeline paused here — next modules (validator/enrichment) continue from gabarito_done
    await supabase
      .from("extraction_jobs")
      .update({ current_stage: "gabarito_done", status: "pending" })
      .eq("id", jobId);

    return jsonResponse({
      job_id: jobId,
      status: "pending",
      current_stage: "gabarito_done",
      blocks_count: segResult.blocks.length,
      questions_extracted: asmResult.inserted_count,
      gabarito: gabaritoResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markJobError(supabase, jobId, message);
    return jsonResponse({ job_id: jobId, status: "error", error: message }, 500);
  }
});
