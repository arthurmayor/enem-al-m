import { useState, useRef, useEffect } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Message { id: string; role: "user" | "assistant"; content: string; }

const welcomeMessage: Message = {
  id: "welcome", role: "assistant",
  content: "Olá! Sou seu tutor com IA. Posso te ajudar a entender qualquer matéria, tirar dúvidas ou criar exercícios personalizados. Como posso te ajudar hoje?",
};

const quickActions = ["O que devo estudar hoje?", "Explique análise combinatória", "Me faça uma pergunta de física"];

const AiTutor = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [userName, setUserName] = useState("Estudante");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!user) { setHistoryLoaded(true); return; }
    const loadHistory = async () => {
      const [{ data, error }, { data: profile }] = await Promise.all([
        supabase.from("chat_history").select("id, role, message, created_at").eq("user_id", user.id).order("created_at", { ascending: true }),
        supabase.from("profiles").select("name").eq("id", user.id).single(),
      ]);
      if (profile?.name) setUserName(profile.name);
      if (!error && data?.length) {
        setMessages(data.map((row: { id: string; role: string; message: string }) => ({ id: row.id, role: row.role as "user" | "assistant", content: row.message })));
      }
      setHistoryLoaded(true);
    };
    loadHistory();
  }, [user]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !user) return;
    const userMsg: Message = { id: `temp-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    try {
      const { data: inserted } = await supabase.from("chat_history").insert({ user_id: user.id, role: "user", message: text }).select("id").single();
      if (inserted?.id) userMsg.id = inserted.id;
      const { data: profile } = await supabase.from("profiles").select("name, age, school_year, education_goal").eq("id", user.id).single();
      const { data: recentErrors } = await supabase.from("answer_history").select("question_id, selected_option, is_correct, response_time_seconds").eq("user_id", user.id).eq("is_correct", false).order("created_at", { ascending: false }).limit(10);
      const userContext = { userId: user.id, name: profile?.name ?? "Estudante", age: profile?.age ?? null, school_year: profile?.school_year ?? "Não informada", education_goal: profile?.education_goal ?? "ENEM", current_subject: "Geral", recent_errors: recentErrors ?? [] };
      const chatHistory = messages.map((m) => ({ role: m.role, message: m.content }));
      const { data: result, error: invokeError } = await supabase.functions.invoke("ai-tutor", { body: { message: text, chatHistory, userContext } });
      if (invokeError) throw new Error(invokeError.message);
      if (result?.error) throw new Error(result.error);
      const reply = result?.reply ?? "Desculpe, não consegui processar sua mensagem.";
      const { data: assistantRow } = await supabase.from("chat_history").insert({ user_id: user.id, role: "assistant", message: reply }).select("id").single();
      setMessages((prev) => [...prev, { id: assistantRow?.id ?? `assistant-${Date.now()}`, role: "assistant", content: reply }]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro ao obter resposta.";
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: `Desculpe, ocorreu um erro: ${errorMsg}` }]);
    } finally { setIsLoading(false); }
  };

  if (!historyLoaded && user) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-ink-strong border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-app flex flex-col pb-24 md:pb-0">
      {/* Header */}
      <header className="flex items-center gap-3 mb-2 animate-fade-in">
        <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-brand-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink-strong">Tutor IA</h1>
        </div>
      </header>

      {/* Welcome card (only when no real messages) */}
      {messages.length <= 1 && (
        <div className="bg-bg-card rounded-card border border-line-light shadow-card p-6 mb-4 animate-fade-in">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-brand-100 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-strong">Olá, {userName}!</p>
              <p className="text-xs text-ink-soft">Como posso te ajudar hoje?</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <button key={action} onClick={() => sendMessage(action)}
                className="px-3 py-1.5 rounded-input bg-bg-app border border-line-light text-xs font-medium text-ink hover:border-brand-500 hover:text-brand-500 transition-all">
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-3 animate-fade-in">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] md:max-w-[70%] rounded-card px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "ml-12 bg-brand-500 text-white rounded-br-sm"
                : "mr-12 bg-bg-card border border-line-light shadow-card rounded-bl-sm"
            }`}>
              {msg.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="h-3 w-3 text-brand-500" />
                  <span className="text-[10px] font-semibold text-brand-500">Tutor IA</span>
                </div>
              )}
              <span className={msg.role === "user" ? "text-white" : "text-ink"}>{msg.content}</span>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-bg-card border border-line-light rounded-card rounded-bl-sm px-4 py-3 shadow-card">
              <div className="flex gap-1.5">
                <div className="h-2 w-2 rounded-full bg-ink-muted animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="h-2 w-2 rounded-full bg-ink-muted animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="h-2 w-2 rounded-full bg-ink-muted animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="sticky bottom-16 md:bottom-0 bg-bg-app border-t border-line-light px-4 py-3 mt-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
            placeholder="Tire sua dúvida..."
            className="flex-1 h-11 px-4 rounded-input bg-bg-card border border-line-light text-ink text-sm placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading}
            className="h-11 w-11 rounded-input bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 active:scale-[0.95] transition-all disabled:opacity-40">
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default AiTutor;
