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
    const { answers, userProfile } = await req.json();

    const prompt = `Você é um especialista em avaliação educacional para vestibulares brasileiros.

Analise os resultados do teste diagnóstico abaixo e produza scores de proficiência.

PERFIL DO ALUNO:
- Objetivo: ${userProfile.education_goal || "ENEM"}
- Série: ${userProfile.school_year || "Não informado"}
- Curso desejado: ${userProfile.desired_course || "Não informado"}

RESPOSTAS DO DIAGNÓSTICO:
${JSON.stringify(answers, null, 2)}

Considere: acerto/erro, tempo de resposta (rápido e correto = forte, lento e correto = moderado, incorreto = fraco), nível de dificuldade de cada questão, e padrões de erro.

FORMATO DE SAÍDA (JSON apenas, sem markdown, sem crases):
{
  "proficiency": [
    {
      "subject": "nome da matéria",
      "subtopic": "subtópico",
      "score": 0.0,
      "confidence": 0.0,
      "weakness_notes": "observação sobre pontos fracos"
    }
  ],
  "overall_readiness": 0.0,
  "priority_areas": ["subtópico1", "subtópico2"],
  "summary": "Resumo em português para o aluno, 3-4 frases encorajadoras mas honestas"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const data = await response.json();
    const resultText = data.content[0].text;

    // Parse the JSON response from Claude
    const analysis = JSON.parse(resultText);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});