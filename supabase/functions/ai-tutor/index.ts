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
    const { message, chatHistory, userContext } = await req.json();

    const systemPrompt = `Você é um tutor paciente e encorajador ajudando um estudante brasileiro a se preparar para vestibulares.

PERFIL DO ALUNO:
- Nome: ${userContext.name || "Estudante"}
- Idade: ${userContext.age || "Não informada"}
- Série: ${userContext.school_year || "Não informada"}
- Objetivo: ${userContext.education_goal || "ENEM"}
- Matéria atual: ${userContext.current_subject || "Geral"}
- Nível de proficiência: ${userContext.proficiency_level || "Não avaliado"}

ÚLTIMOS ERROS DO ALUNO:
${userContext.recent_errors ? JSON.stringify(userContext.recent_errors) : "Nenhum registrado"}

REGRAS:
1. Explique conceitos passo a passo com exemplos do dia a dia
2. Use analogias e linguagem acessível
3. Se o aluno perguntar sobre uma questão específica, guie o raciocínio sem dar a resposta direta primeiro
4. Adapte a profundidade da explicação ao nível do aluno
5. Encoraje o aluno quando estiver com dificuldade
6. Responda sempre em Português do Brasil
7. Mantenha respostas focadas e com no máximo 400 palavras
8. Se o aluno perguntar "o que devo estudar hoje?", sugira com base na matéria atual e nível
9. Se o aluno disser que está perdido ou desanimado, seja empático e sugira revisar o básico`;

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
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages,
      }),
    });

    const data = await response.json();
    const reply = data.content[0].text;

    return new Response(JSON.stringify({ reply }), {
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
```

Salve com **Ctrl + S** e faça o deploy:
```
supabase functions deploy ai-tutor