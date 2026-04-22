import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ParsedPage } from "../_shared/pre-parser.ts";
import type { ProfileResult } from "../_shared/profiler.ts";
import { runSegmenter, type Block } from "../_shared/segmenter.ts";
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

type Stage = "segmenting" | "assembling" | "linking_gabarito";

interface RequestBody {
  job_id?: string;
  stage?: Stage;
}

// Each phase-2 stage runs in its own invocation so no single call has to fit
// segmenter + assembler + gabarito inside the 60s/150s edge-function budget.
// When a stage finishes it schedules the next one via fire-and-forget fetch
// to this same function.
function triggerNextStage(jobId: string, stage: Stage) {
  const url = `${SUPABASE_URL}/functions/v1/extract-exam-process`;
  const req = fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ job_id: jobId, stage }),
  });
  req.catch((err) => {
    console.error(`[process] triggerNextStage(${stage}) fetch failed: ${err}`);
  });
}

async function loadJob(supabase: SupabaseClient, jobId: string) {
  const { data, error } = await supabase
    .from("extraction_jobs")
    .select(
      "id, exam_id, pre_parser_pages, profile_json, gabarito_storage_path, segmenter_blocks_json",
    )
    .eq("id", jobId)
    .single();
  if (error || !data) {
    throw new Error(`Job ${jobId} não encontrado: ${error?.message ?? "unknown"}`);
  }
  return data;
}

async function runSegmentingStage(
  supabase: SupabaseClient,
  jobId: string,
  pages: ParsedPage[],
  profile: ProfileResult,
) {
  const result = await runStage(supabase, jobId, "segmenting", () =>
    runSegmenter(pages, profile),
  );
  const { error: persistErr } = await supabase
    .from("extraction_jobs")
    .update({ segmenter_blocks_json: result.blocks })
    .eq("id", jobId);
  if (persistErr) {
    throw new Error(`Falha ao persistir blocks: ${persistErr.message}`);
  }
  triggerNextStage(jobId, "assembling");
  return { blocks_count: result.blocks.length };
}

async function runAssemblingStage(
  supabase: SupabaseClient,
  jobId: string,
  examId: string,
  blocks: Block[],
  profile: ProfileResult,
) {
  const result = await runStage(supabase, jobId, "assembling", () =>
    runAssembler(supabase, examId, jobId, blocks, profile),
  );
  triggerNextStage(jobId, "linking_gabarito");
  return { questions_extracted: result.inserted_count };
}

async function runLinkingStage(
  supabase: SupabaseClient,
  jobId: string,
  examId: string,
  gabaritoPath: string | null,
) {
  const result = await runStage(supabase, jobId, "linking_gabarito", () =>
    runGabaritoLinker(supabase, examId, jobId, gabaritoPath),
  );
  await supabase
    .from("extraction_jobs")
    .update({ current_stage: "gabarito_done", status: "pending" })
    .eq("id", jobId);
  return { gabarito: result };
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
  const stage: Stage = body.stage ?? "segmenting";
  if (!jobId) {
    return jsonResponse({ error: "Campo obrigatório: job_id" }, 400);
  }
  if (!["segmenting", "assembling", "linking_gabarito"].includes(stage)) {
    return jsonResponse({ error: `stage inválido: ${stage}` }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let job;
  try {
    job = await loadJob(supabase, jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 404);
  }

  const examId = job.exam_id as string;
  const pages = job.pre_parser_pages as ParsedPage[] | null;
  const profile = job.profile_json as ProfileResult | null;
  const gabaritoPath = job.gabarito_storage_path as string | null;
  const cachedBlocks = job.segmenter_blocks_json as Block[] | null;

  try {
    if (stage === "segmenting") {
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
      const out = await runSegmentingStage(supabase, jobId, pages, profile);
      return jsonResponse({
        job_id: jobId,
        status: "pending",
        current_stage: "assembling",
        next_stage_triggered: true,
        ...out,
      });
    }

    if (stage === "assembling") {
      if (!profile) {
        throw new Error("Job sem profile_json");
      }
      if (!Array.isArray(cachedBlocks) || cachedBlocks.length === 0) {
        throw new Error("Job sem segmenter_blocks_json — rode stage segmenting antes");
      }
      const out = await runAssemblingStage(
        supabase,
        jobId,
        examId,
        cachedBlocks,
        profile,
      );
      return jsonResponse({
        job_id: jobId,
        status: "pending",
        current_stage: "linking_gabarito",
        next_stage_triggered: true,
        ...out,
      });
    }

    // stage === "linking_gabarito"
    const out = await runLinkingStage(supabase, jobId, examId, gabaritoPath);
    return jsonResponse({
      job_id: jobId,
      status: "pending",
      current_stage: "gabarito_done",
      ...out,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markJobError(supabase, jobId, message);
    return jsonResponse({ job_id: jobId, status: "error", stage, error: message }, 500);
  }
});
