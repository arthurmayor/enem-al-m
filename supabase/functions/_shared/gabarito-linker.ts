import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { splitStoragePath } from "./pre-parser.ts";
import { callClaude, parseJsonResponse } from "./anthropic.ts";

const SYSTEM_PROMPT = `Extraia o gabarito oficial desta prova de vestibular.
NÃO assuma que as alternativas são A-E ou que há 90 questões.
Leia exatamente o que está no documento.
Questões anuladas = "*".
Retorne APENAS JSON (sem markdown, sem backticks):
{"version_detected":"V1","total_questions":90,
 "answers":{"1":"E","2":"B","3":"*"},
 "annulled":[3],"format_notes":"..."}`;

export interface GabaritoResult {
  version_detected?: string;
  total_questions?: number;
  answers?: Record<string, string>;
  annulled?: number[];
  format_notes?: string;
}

export interface GabaritoLinkerSkipped {
  skipped: true;
  reason: string;
}

export interface GabaritoLinkerApplied {
  skipped: false;
  gabarito: GabaritoResult;
  answers_applied: number;
  issues_opened: number;
}

export type GabaritoLinkerResult = GabaritoLinkerSkipped | GabaritoLinkerApplied;

export async function runGabaritoLinker(
  supabase: SupabaseClient,
  examId: string,
  jobId: string,
  gabaritoStoragePath: string | undefined | null,
): Promise<GabaritoLinkerResult> {
  if (!gabaritoStoragePath) {
    return { skipped: true, reason: "gabarito não fornecido" };
  }

  const { bucket, path } = splitStoragePath(gabaritoStoragePath);
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(
      `Falha ao baixar gabarito de storage://${bucket}/${path}: ${error?.message ?? "unknown"}`,
    );
  }

  const buffer = new Uint8Array(await data.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const extracted = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(extracted.text)
    ? extracted.text.join("\n")
    : String(extracted.text ?? "");

  const raw = await callClaude({ system: SYSTEM_PROMPT, user: text, maxTokens: 4096 });
  const gabarito = parseJsonResponse<GabaritoResult>(raw, "GabaritoLinker");

  const answers = gabarito.answers ?? {};
  const annulledSet = new Set((gabarito.annulled ?? []).map((n) => Number(n)));

  const { data: questions, error: qErr } = await supabase
    .from("question_raw")
    .select("id, numero")
    .eq("exam_id", examId);
  if (qErr) {
    throw new Error(`Falha ao listar question_raw do exam: ${qErr.message}`);
  }

  let answersApplied = 0;
  const issues: Array<{
    question_raw_id: string;
    job_id: string;
    issue_type: string;
    severity: string;
    description: string;
    agent: string;
  }> = [];

  for (const q of questions ?? []) {
    const answer = answers[String(q.numero)];
    if (answer !== undefined) {
      const isAnnulled = answer === "*" || annulledSet.has(q.numero);
      const { error: upErr } = await supabase
        .from("question_raw")
        .update({
          correct_answer: answer,
          is_annulled: isAnnulled,
        })
        .eq("id", q.id);
      if (upErr) {
        throw new Error(`Falha ao atualizar question_raw ${q.id}: ${upErr.message}`);
      }
      answersApplied++;
    } else {
      issues.push({
        question_raw_id: q.id,
        job_id: jobId,
        issue_type: "gabarito_invalido",
        severity: "medium",
        description: `Questão ${q.numero} não tem resposta no gabarito extraído`,
        agent: "gabarito_linker",
      });
    }
  }

  if (issues.length > 0) {
    const { error: issErr } = await supabase.from("question_issues").insert(issues);
    if (issErr) {
      throw new Error(`Falha ao registrar issues de gabarito: ${issErr.message}`);
    }
  }

  return {
    skipped: false,
    gabarito,
    answers_applied: answersApplied,
    issues_opened: issues.length,
  };
}
