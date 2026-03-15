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

    const { message, chatHistory, userContext } = await req.json();

    const systemPrompt = "Voce eh um tutor paciente e encorajador ajudando um estudante brasileiro a se preparar para vestibulares.\n\n" +
      "PERFIL DO ALUNO:\n" +
      "- Nome: " + (userContext.name || "Estudante") + "\n" +
      "- Idade: " + (userContext.age || "Nao informada") + "\n" +
      "- Serie: " + (userContext.school_year || "Nao informada") + "\n" +
      "- Objetivo: " + (userContext.education_goal || "ENEM") + "\n" +
      "- Materia atual: " + (userContext.current_subject || "Geral") + "\n" +
      "- Nivel de proficiencia: " + (userContext.proficiency_level || "Nao avaliado") + "\n\n" +
      "ULTIMOS ERROS DO ALUNO:\n" +
      (userContext.recent_errors ? JSON.stringify(userContext.recent_errors) : "Nenhum registrado") + "\n\n" +
      "REGRAS:\n" +
      "1. Explique conceitos passo a passo com exemplos do dia a dia\n" +
      "2. Use analogias e linguagem acessivel\n" +
      "3. Se o aluno perguntar sobre uma questao especifica, guie o raciocinio sem dar a resposta direta primeiro\n" +
      "4. Adapte a profundidade da explicacao ao nivel do aluno\n" +
      "5. Encoraje o aluno quando estiver com dificuldade\n" +
      "6. Responda sempre em Portugues do Brasil\n" +
      "7. Mantenha respostas focadas e com no maximo 400 palavras\n" +
      "8. Se o aluno perguntar o que devo estudar hoje, sugira com base na materia atual e nivel\n" +
      "9. Se o aluno disser que esta perdido ou desanimado, seja empatico e sugira revisar o basico";

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
        model: "claude-sonnet-4-20250514",
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
  } catch (error) {
    console.error("ai-tutor error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
