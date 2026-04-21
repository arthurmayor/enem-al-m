import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Fetch real student context from database ────────────────────────────────

async function fetchStudentContext(userId: string) {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Parallel fetches for performance
  const [planResult, errorsResult, profResult, profileResult] = await Promise.all([
    // Active study plan
    sb.from("study_plans")
      .select("plan_json, status")
      .eq("user_id", userId)
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    // Last 5 incorrect answers with question details
    sb.from("answer_history")
      .select("question_id, created_at, context")
      .eq("user_id", userId)
      .eq("is_correct", false)
      .order("created_at", { ascending: false })
      .limit(5),
    // Latest proficiency scores per subject
    sb.from("proficiency_scores")
      .select("subject, score, source, measured_at")
      .eq("user_id", userId)
      .order("measured_at", { ascending: false })
      .limit(20),
    // Profile with course info
    sb.from("profiles")
      .select("name, education_goal, desired_course, exam_config_id")
      .eq("id", userId)
      .single(),
  ]);

  // Extract focus subjects from plan
  let focusSubjects: string[] = [];
  let placementBand = "Nao avaliado";
  const planJson = planResult.data?.plan_json;
  if (planJson) {
    const weeks = planJson.weeks || [];
    if (weeks.length > 0) {
      focusSubjects = weeks[0].focus_areas || [];
    }
    placementBand = planJson.metadata?.placement_band || placementBand;
  }

  // Get question subjects/subtopics for recent errors
  const recentErrors: { subject: string; subtopic: string }[] = [];
  if (errorsResult.data && errorsResult.data.length > 0) {
    const questionIds = errorsResult.data.map(e => e.question_id);
    // Fetch from both question tables
    const [{ data: diagQ }, { data: mainQ }] = await Promise.all([
      sb.from("diagnostic_questions").select("id, subject, subtopic").in("id", questionIds),
      sb.from("questions").select("id, subject, subtopic").in("id", questionIds),
    ]);
    const qMap = new Map<string, { subject: string; subtopic: string }>();
    for (const q of [...(diagQ || []), ...(mainQ || [])]) {
      qMap.set(q.id, { subject: q.subject, subtopic: q.subtopic });
    }
    for (const e of errorsResult.data) {
      const q = qMap.get(e.question_id);
      if (q) recentErrors.push(q);
    }
  }

  // Deduplicate proficiency scores (latest per subject)
  const profMap = new Map<string, number>();
  for (const p of profResult.data || []) {
    if (!profMap.has(p.subject)) {
      profMap.set(p.subject, p.score);
    }
  }

  // Get course name from exam config
  let courseName = profileResult.data?.desired_course || profileResult.data?.education_goal || "Vestibular";
  if (profileResult.data?.exam_config_id) {
    const { data: ec } = await sb.from("exam_configs")
      .select("course_name, exam_name")
      .eq("id", profileResult.data.exam_config_id)
      .single();
    if (ec) courseName = `${ec.course_name} (${ec.exam_name})`;
  }

  return {
    courseName,
    placementBand,
    focusSubjects,
    recentErrors,
    proficiencies: Object.fromEntries(profMap),
    studentName: profileResult.data?.name || "Estudante",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const { message, chatHistory, userContext, questionContext } = await req.json();

    // ─── Fetch real context if userId provided ────────────────────
    let enrichedContext = "";
    const userId = userContext?.userId;
    if (userId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const ctx = await fetchStudentContext(userId);

        const errorsStr = ctx.recentErrors.length > 0
          ? ctx.recentErrors.map(e => `  - ${e.subject}: ${e.subtopic}`).join("\n")
          : "  Nenhum erro recente registrado";

        const profStr = Object.entries(ctx.proficiencies).length > 0
          ? Object.entries(ctx.proficiencies)
              .map(([subj, score]) => `  - ${subj}: ${Math.round((score as number) * 100)}%`)
              .join("\n")
          : "  Nao avaliado ainda";

        const focusStr = ctx.focusSubjects.length > 0
          ? ctx.focusSubjects.join(", ")
          : "Nao definidas";

        enrichedContext = "\n\nCONTEXTO REAL DO ALUNO (dados do sistema):\n" +
          "- Curso alvo: " + ctx.courseName + "\n" +
          "- Nivel (placement band): " + ctx.placementBand + "\n" +
          "- Materias foco do plano: " + focusStr + "\n" +
          "- Ultimos erros:\n" + errorsStr + "\n" +
          "- Proficiencia por materia:\n" + profStr + "\n\n" +
          "Use esses dados para personalizar suas respostas. Se o aluno perguntar 'o que estudar', " +
          "referencie o plano atual e as materias foco. Se ele errou algo recentemente, mencione isso " +
          "de forma encorajadora (ex: 'Vi que voce teve dificuldade em X, vamos revisar?').";
      } catch (ctxErr) {
        console.error("Context fetch error (non-fatal):", ctxErr);
        // Continue without enriched context
      }
    }

    // ─── Question context injection (mission-native tutor) ──────
    let questionContextBlock = "";
    if (questionContext && questionContext.is_question_mode) {
      questionContextBlock =
        "\n\nQUESTAO ATUAL DO ALUNO:\n" +
        "Materia: " + (questionContext.subject || "Nao informada") + "\n" +
        "Subtopico: " + (questionContext.subtopic || "Nao informado") + "\n" +
        "Enunciado: " + (questionContext.question_text || "Nao disponivel") + "\n" +
        "Alternativas:\n" + (questionContext.options || []).join("\n") + "\n" +
        (questionContext.selected_answer
          ? "O aluno selecionou: " + questionContext.selected_answer + "\n"
          : "") +
        "\nREGRA ESPECIAL — MODO QUESTAO:\n" +
        "O aluno esta resolvendo uma questao agora. NAO de a resposta " +
        "direta. Guie o raciocinio passo a passo. Pergunte o que ele " +
        "ja tentou ou o que esta em duvida. De pistas progressivas, " +
        "nao a solucao. Se ele insistir, de UMA dica conceitual sem " +
        "revelar a alternativa correta.";
    }

    // Use questionContext.subject when available, otherwise fallback
    const currentSubject = questionContext?.subject || userContext?.current_subject || "Geral";

    const systemPrompt = "Voce eh um tutor paciente e encorajador ajudando um estudante brasileiro a se preparar para vestibulares.\n\n" +
      "PERFIL DO ALUNO:\n" +
      "- Nome: " + (userContext.name || "Estudante") + "\n" +
      "- Idade: " + (userContext.age || "Nao informada") + "\n" +
      "- Serie: " + (userContext.school_year || "Nao informada") + "\n" +
      "- Objetivo: " + (userContext.education_goal || "ENEM") + "\n" +
      "- Materia atual: " + currentSubject + "\n" +
      "- Nivel de proficiencia: " + (userContext.proficiency_level || "Nao avaliado") + "\n\n" +
      "ULTIMOS ERROS DO ALUNO:\n" +
      (userContext.recent_errors ? JSON.stringify(userContext.recent_errors) : "Nenhum registrado") +
      enrichedContext +
      questionContextBlock + "\n\n" +
      "REGRAS:\n" +
      "1. Explique conceitos passo a passo com exemplos do dia a dia\n" +
      "2. Use analogias e linguagem acessivel\n" +
      "3. Se o aluno perguntar sobre uma questao especifica, guie o raciocinio sem dar a resposta direta primeiro\n" +
      "4. Adapte a profundidade da explicacao ao nivel do aluno\n" +
      "5. Encoraje o aluno quando estiver com dificuldade\n" +
      "6. Responda sempre em Portugues do Brasil\n" +
      "7. Mantenha respostas focadas e com no maximo 400 palavras\n" +
      "8. Se o aluno perguntar o que devo estudar hoje, sugira com base nas materias foco do plano e nos erros recentes\n" +
      "9. Se o aluno disser que esta perdido ou desanimado, seja empatico e sugira revisar o basico\n" +
      "10. Quando tiver dados de proficiencia, use-os para adaptar a dificuldade das explicacoes";

    const messages = [];

    if (chatHistory && chatHistory.length > 0) {
      chatHistory.slice(-10).forEach((msg: { role: string; message: string }) => {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.message,
        });
      });
    }

    messages.push({ role: "user", content: message });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error("Anthropic API error " + response.status + ": " + errorBody);
    }

    const data = await response.json();

    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error("Unexpected API response: " + JSON.stringify(data));
    }

    const reply = data.content[0].text;

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("ai-tutor error:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
