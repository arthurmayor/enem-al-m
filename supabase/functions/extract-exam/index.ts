import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runPreParser } from "./pre-parser.ts";
import { runProfiler, type ProfileResult } from "./profiler.ts";

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
  exam_id?: string;
  prova_storage_path?: string;
  gabarito_storage_path?: string;
}

interface StageLogEntry {
  stage: string;
  started_at: string;
  completed_at: string;
  status: "done" | "error";
  error?: string;
}

async function appendStageLog(
  supabase: SupabaseClient,
  jobId: string,
  entry: StageLogEntry,
) {
  const { data, error } = await supabase
    .from("extraction_jobs")
    .select("stages_log")
    .eq("id", jobId)
    .single();
  if (error) throw new Error(`Falha ao ler stages_log do job: ${error.message}`);

  const log = Array.isArray(data?.stages_log) ? data.stages_log : [];
  log.push(entry);

  const { error: updErr } = await supabase
    .from("extraction_jobs")
    .update({ stages_log: log })
    .eq("id", jobId);
  if (updErr) throw new Error(`Falha ao escrever stages_log: ${updErr.message}`);
}

async function runStage<T>(
  supabase: SupabaseClient,
  jobId: string,
  stageName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const started_at = new Date().toISOString();
  await supabase
    .from("extraction_jobs")
    .update({ current_stage: stageName })
    .eq("id", jobId);

  try {
    const result = await fn();
    await appendStageLog(supabase, jobId, {
      stage: stageName,
      started_at,
      completed_at: new Date().toISOString(),
      status: "done",
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendStageLog(supabase, jobId, {
      stage: stageName,
      started_at,
      completed_at: new Date().toISOString(),
      status: "error",
      error: message,
    });
    throw err;
  }
}

async function markJobError(supabase: SupabaseClient, jobId: string, message: string) {
  await appendStageLog(supabase, jobId, {
    stage: "terminated",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: "error",
    error: message,
  });
  await supabase
    .from("extraction_jobs")
    .update({
      status: "error",
      errors_count: 1,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
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

  const { exam_id, prova_storage_path } = body;
  if (!exam_id || !prova_storage_path) {
    return jsonResponse(
      { error: "Campos obrigatórios: exam_id, prova_storage_path" },
      400,
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create extraction job
  const { data: job, error: jobErr } = await supabase
    .from("extraction_jobs")
    .insert({
      exam_id,
      status: "pending",
      current_stage: "pending",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    return jsonResponse(
      { error: `Falha ao criar extraction_job: ${jobErr?.message ?? "unknown"}` },
      500,
    );
  }
  const jobId = job.id as string;

  try {
    // ───── PRE-PARSER ─────
    const preResult = await runStage(supabase, jobId, "pre_parsing", () =>
      runPreParser(supabase, prova_storage_path),
    );

    if (preResult.total_chars < 500) {
      const msg = "PDF escaneado não suportado na v1";
      await markJobError(supabase, jobId, msg);
      return jsonResponse(
        {
          job_id: jobId,
          status: "error",
          error: msg,
          total_chars: preResult.total_chars,
          total_pages: preResult.total_pages,
        },
        200,
      );
    }

    // ───── PROFILER ─────
    const profile: ProfileResult = await runStage(supabase, jobId, "profiling", () =>
      runProfiler(preResult.pages),
    );

    // Persist profile on exam row
    const examUpdate: Record<string, unknown> = { profile_json: profile };
    if (typeof profile.objective_question_count === "number") {
      examUpdate.total_questions_detected = profile.objective_question_count;
    }
    if (typeof profile.option_label_pattern === "string") {
      examUpdate.option_label_pattern = profile.option_label_pattern;
    }
    if (typeof profile.has_shared_context === "boolean") {
      examUpdate.has_shared_context = profile.has_shared_context;
    }
    if (typeof profile.has_note_e_adote === "boolean") {
      examUpdate.has_note_e_adote = profile.has_note_e_adote;
    }
    if (typeof profile.has_images === "boolean") {
      examUpdate.has_images = profile.has_images;
    }

    const { error: examErr } = await supabase
      .from("exams")
      .update(examUpdate)
      .eq("id", exam_id);
    if (examErr) {
      throw new Error(`Falha ao atualizar exam com profile: ${examErr.message}`);
    }

    if (profile.source_type === "pdf_scanned") {
      const msg = "Profiler detectou pdf_scanned — OCR não suportado na v1";
      await markJobError(supabase, jobId, msg);
      return jsonResponse(
        { job_id: jobId, status: "error", error: msg, profile },
        200,
      );
    }

    // Pipeline paused here — future modules will continue from profiling_done
    await supabase
      .from("extraction_jobs")
      .update({ current_stage: "profiling_done", status: "pending" })
      .eq("id", jobId);

    return jsonResponse({
      job_id: jobId,
      status: "pending",
      current_stage: "profiling_done",
      total_pages: preResult.total_pages,
      total_chars: preResult.total_chars,
      profile,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markJobError(supabase, jobId, message);
    return jsonResponse({ job_id: jobId, status: "error", error: message }, 500);
  }
});
