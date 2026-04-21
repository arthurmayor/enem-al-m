import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runPreParser } from "../_shared/pre-parser.ts";
import { runProfiler, type ProfileResult } from "../_shared/profiler.ts";
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
  exam_id?: string;
  prova_storage_path?: string;
  gabarito_storage_path?: string;
  // If true, return after persisting phase-1 state without invoking phase 2.
  // Useful for debugging or for callers that want to trigger phase 2 themselves.
  skip_phase_two?: boolean;
}

// Fire-and-forget invocation of the phase-2 function. We don't await the
// response — that would block this function on the 60s budget of phase 2.
// Instead we just kick off the request; Supabase's runtime keeps the fetch
// alive for us.
async function triggerPhaseTwo(jobId: string) {
  const url = `${SUPABASE_URL}/functions/v1/extract-exam-process`;
  const req = fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ job_id: jobId }),
  });

  // Swallow the promise so it doesn't become an unhandled rejection if the
  // caller returns before the fetch settles. Errors inside phase 2 are
  // persisted to extraction_jobs.stages_log by that function itself.
  req.catch((err) => {
    console.error(`[extract-exam] triggerPhaseTwo fetch failed: ${err}`);
  });
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

  const { exam_id, prova_storage_path, gabarito_storage_path, skip_phase_two } = body;
  if (!exam_id || !prova_storage_path) {
    return jsonResponse(
      { error: "Campos obrigatórios: exam_id, prova_storage_path" },
      400,
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: job, error: jobErr } = await supabase
    .from("extraction_jobs")
    .insert({
      exam_id,
      status: "pending",
      current_stage: "pending",
      started_at: new Date().toISOString(),
      prova_storage_path,
      gabarito_storage_path: gabarito_storage_path ?? null,
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

    // Persist phase-1 output so phase 2 can resume from here.
    const { error: persistErr } = await supabase
      .from("extraction_jobs")
      .update({
        pre_parser_pages: preResult.pages,
        profile_json: profile,
        current_stage: "phase_one_done",
      })
      .eq("id", jobId);
    if (persistErr) {
      throw new Error(`Falha ao persistir estado phase-1: ${persistErr.message}`);
    }

    if (!skip_phase_two) {
      await triggerPhaseTwo(jobId);
    }

    return jsonResponse({
      job_id: jobId,
      status: "pending",
      current_stage: skip_phase_two ? "phase_one_done" : "segmenting",
      phase_two_triggered: !skip_phase_two,
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
