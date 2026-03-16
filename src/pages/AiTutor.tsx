import { useState, useRef, useEffect } from "react";
import { Send, ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const welcomeMessage: Message = {
  id: "welcome",
  role: "assistant",
  content: "Olá! 👋 Sou seu tutor com IA. Posso te ajudar a entender qualquer matéria, tirar dúvidas ou criar exercícios personalizados. Como posso te ajudar hoje?",
};

const quickActions = [
  "O que devo estudar hoje?",
  "Explique análise combinatória",
  "Me faça uma pergunta de física",
];

const AiTutor = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!user) { setHistoryLoaded(true); return; }
    const loadHistory = async () => {
      const { data, error } = await supabase
        .from("chat_history").select("id, role, message, created_at")
        .eq("user_id", user.id).order("created_at", { ascending: true });
      if (!error && data?.length) {
        setMessages(data.map((row: { id: string; role: string; message: string }) => ({
          id: row.id, role: row.role as "user" | "assistant", content: row.message,
        })));
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

      const userContext = {
        name: profile?.name ?? "Estudante", age: profile?.age ?? null,
        school_year: profile?.school_year ?? "Não informada", education_goal: profile?.education_goal ?? "ENEM",
        current_subject: "Geral", recent_errors: recentErrors ?? [],
      };

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
    } finally {
      setIsLoading(false);
    }
  };

  if (!historyLoaded && user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-16">
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4 max-w-3xl">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="h-7 w-7 rounded-lg bg-xp/10 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-xp" />
          </div>
          <span className="text-base font-bold text-foreground">Tutor IA</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "gradient-bg text-primary-foreground rounded-br-md"
                  : "bg-card border border-border/50 text-foreground rounded-bl-md"
              }`}>
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1 mb-1.5">
                    <Sparkles className="h-3 w-3 text-xp" />
                    <span className="text-[10px] font-semibold text-xp">IA</span>
                  </div>
                )}
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {messages.length <= 1 && (
        <div className="px-4 pb-2 max-w-3xl mx-auto w-full">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {quickActions.map((action) => (
              <button key={action} onClick={() => sendMessage(action)}
                className="shrink-0 px-4 py-2 rounded-full bg-card border border-border/50 text-xs font-medium text-foreground hover:shadow-interactive hover:border-primary/30 transition-all">
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sticky bottom-16 bg-background border-t border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
            placeholder="Tire sua dúvida..."
            className="flex-1 h-11 px-4 rounded-xl bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading}
            className="h-11 w-11 rounded-xl gradient-bg text-primary-foreground flex items-center justify-center hover:opacity-90 active:scale-[0.95] transition-all disabled:opacity-40 shadow-[0_2px_8px_rgba(99,102,241,0.25)]">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default AiTutor;
