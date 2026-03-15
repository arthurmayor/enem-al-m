import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const { proficiencyScores, userProfile } = await req.json();

    const daysUntilExam = userProfile.exam_date
      ? Math.max(0, Math.ceil((new Date(userProfile.exam_date).getTime() - Date.now()) / 86400000))
      : 180;

    const prompt = "Voce eh um planejador de estudos especialista para estudantes brasileiros.\n\n" +
      "PERFIL DO ALUNO:\n" +
      "- Nome: " + (userProfile.name || "Estudante") + "\n" +
      "- Objetivo: " + (userProfile.education_goal || "ENEM") + "\n" +
      "- Curso desejado: " + (userProfile.desired_course || "Nao informado") + "\n" +
      "- Dias ate a prova: " + daysUntilExam + "\n" +
      "- Horas por dia disponiveis: " + (userProfile.hours_per_day || 2) + "\n" +
      "- Dias da semana disponiveis: " + JSON.stringify(userProfile.study_days || ["Mon","Tue","Wed","Thu","Fri"]) + "\n\n" +
      "SCORES DE PROFICIENCIA:\n" +
      JSON.stringify(proficiencyScores, null, 2) + "\n\n" +
      "REGRAS:\n" +
      "1. Priorize areas fracas (score < 0.4) com 40% do tempo\n" +
      "2. Mantenha areas fortes (score > 0.7) com 15% do tempo\n" +
      "3. Respeite os horarios e dias disponiveis do aluno\n" +
      "4. Inclua variedade: questoes, resumos, flashcards, revisao\n" +
      "5. Cada dia deve ter 2-4 missoes dependendo das horas disponiveis\n" +
      "6. Inclua uma sessao de revisao de erros por semana\n" +
      "7. Use nomes de dias em portugues: Segunda, Terca, Quarta, Quinta, Sexta, Sabado, Domingo\n\n" +
      "FORMATO DE SAIDA (JSON apenas, sem markdown, sem crases):\n" +
      '{"weeks": [{"week": 1, "focus_areas": ["subtopico1", "subtopico2"], "days": [{"day": "Segunda", "missions": [{"subject": "Matematica", "subtopic": "Funcoes", "type": "questions", "estimated_minutes": 30, "description": "Resolver 10 questoes sobre funcoes do 1o e 2o grau"}]}]}]}';

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
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

    let planText = data.content[0].text.trim();
    planText = planText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    const plan = JSON.parse(planText);

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("generate-study-plan error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
