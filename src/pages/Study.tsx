import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Clock, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";

interface Mission { id: string; subject: string; subtopic: string; mission_type: string; status: string; date: string; }

const missionTypeLabels: Record<string, string> = { questions: "Questões", summary: "Resumo", flashcards: "Flashcards", review: "Revisão" };

const Study = () => {
  const { user } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  useEffect(() => {
    if (!user) return;
    const fetchMissions = async () => {
      const today = new Date(); const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
      const { data } = await supabase.from("daily_missions").select("*").eq("user_id", user.id).gte("date", today.toISOString().split("T")[0]).lte("date", weekEnd.toISOString().split("T")[0]).order("date", { ascending: true });
      if (data) setMissions(data);
      setLoading(false);
    };
    fetchMissions();
  }, [user]);

  const filtered = missions.filter((m) => { if (filter === "pending") return m.status !== "completed"; if (filter === "completed") return m.status === "completed"; return true; });
  const completedCount = missions.filter((m) => m.status === "completed").length;

  if (loading) { return (<div className="min-h-screen bg-white flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>); }

  return (
    <div className="min-h-screen bg-white pb-20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto flex h-14 items-center justify-between px-4 max-w-3xl">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-foreground" />
            <span className="text-base font-semibold text-foreground">Estudar</span>
          </div>
          {missions.length > 0 && (<span className="text-xs text-muted-foreground">{completedCount}/{missions.length} feitas</span>)}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {missions.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Nenhuma missão agendada</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">Complete o diagnóstico para gerar seu plano de estudos personalizado.</p>
            <Link to="/diagnostic/intro" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-foreground">Fazer diagnóstico <ChevronRight className="h-4 w-4" /></Link>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-6 animate-fade-in">
              {(["all", "pending", "completed"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${filter === f ? "bg-foreground text-white" : "bg-white border border-gray-200 text-foreground hover:border-gray-400"}`}>
                  {f === "all" ? "Todas" : f === "pending" ? "Pendentes" : "Concluídas"}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {filtered.map((mission, i) => {
                const isCompleted = mission.status === "completed";
                const dateLabel = new Date(mission.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
                return (
                  <Link key={mission.id} to={`/mission/${mission.mission_type}/${mission.id}`}
                    className="group flex items-center justify-between p-5 bg-white rounded-2xl border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 animate-fade-in"
                    style={{ animationDelay: `${i * 0.03}s` }}>
                    <div className="flex items-start gap-3">
                      {isCompleted ? <CheckCircle2 className="h-5 w-5 text-foreground shrink-0 mt-0.5" /> : <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-foreground" />
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{mission.subject}</span>
                        </div>
                        <h3 className={`mt-0.5 font-medium text-sm ${isCompleted ? "text-muted-foreground line-through" : "text-foreground"}`}>{mission.subtopic}</h3>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-foreground font-medium">{missionTypeLabels[mission.mission_type] || mission.mission_type}</span>
                          <span className="text-[10px] text-muted-foreground">{dateLabel}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </Link>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">{filter === "completed" ? "Nenhuma missão concluída ainda." : "Todas as missões foram concluídas!"}</p>
              </div>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default Study;
