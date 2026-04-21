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

    const { answers, userProfile } = await req.json();

    if (!answers || answers.length === 0) {
      throw new Error("No answers provided");
    }

    const prompt = "Voce eh um especialista em avaliacao educacional para vestibulares brasileiros.\n\n" +
      "Analise os resultados do teste diagnostico abaixo e produza scores de proficiencia.\n\n" +
      "PERFIL DO ALUNO:\n" +
      "- Objetivo: " + (userProfile.education_goal || "ENEM") + "\n" +
      "- Serie: " + (userProfile.school_year || "Nao informado") + "\n" +
      "- Curso desejado: " + (userProfile.desired_course || "Nao informado") + "\n\n" +
      "RESPOSTAS DO DIAGNOSTICO:\n" +
      JSON.stringify(answers, null, 2) + "\n\n" +
      "Considere: acerto/erro, tempo de resposta (rapido e correto = forte, lento e correto = moderado, incorreto = fraco), nivel de dificuldade de cada questao, e padroes de erro.\n\n" +
      "FORMATO DE SAIDA (JSON apenas, sem markdown, sem crases):\n" +
      '{"proficiency": [{"subject": "nome da materia", "subtopic": "subtopico", "score": 0.0, "confidence": 0.0, "weakness_notes": "observacao sobre pontos fracos"}], "overall_readiness": 0.0, "priority_areas": ["subtopico1", "subtopico2"], "summary": "Resumo em portugues para o aluno, 3-4 frases encorajadoras mas honestas"}';

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2000,
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

    let resultText = data.content[0].text.trim();
    resultText = resultText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    const analysis = JSON.parse(resultText);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("analyze-diagnostic error:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
