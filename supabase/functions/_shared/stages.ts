import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface StageLogEntry {
  stage: string;
  started_at: string;
  completed_at: string;
  status: "done" | "error";
  error?: string;
}

export async function appendStageLog(
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

export async function runStage<T>(
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

export async function markJobError(
  supabase: SupabaseClient,
  jobId: string,
  message: string,
) {
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
