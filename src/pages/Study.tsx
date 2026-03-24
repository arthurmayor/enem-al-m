import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Clock, ChevronRight, CheckCircle2, Circle, ArrowRight, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";

interface Mission {
  id: string;
  subject: string;
  subtopic: string;
  mission_type: string;
  status: string;
  date: string;
  estimated_minutes?: number;
}

const MISSION_TYPE_LABEL: Record<string, string> = {
  questions: "Questões",
  error_review: "Revisão de erros",
  short_summary: "Resumo",
  spaced_review: "Revisão espaçada",
  mixed_block: "Bloco misto",
  reading_work: "Leitura",
  writing_outline: "Planejamento de redação",
  writing_partial: "Redação parcial",
  writing_full: "Redação completa",
  summary: "Resumo",
  flashcards: "Flashcards",
  review: "Revisão de erros",
};

// ─── MissionCard ────────────────────────────────────────────────

interface MissionCardProps {
  id: string;
  subject: string;
  type: string;
  subtopic: string;
  estimated_minutes: number;
  completed: boolean;
}

const MissionCard = ({ id, subject, type, subtopic, estimated_minutes, completed }: MissionCardProps) => {
  const showSubtopic = subtopic && subtopic !== "geral" && subtopic.trim() !== "";
  const typeLabel = MISSION_TYPE_LABEL[type] || type;

  return (
    <Link
      to={`/mission/${type}/${id}`}
      className={`group flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ${completed ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {subject}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-foreground font-medium shrink-0">
              {typeLabel}
            </span>
          </div>
          {showSubtopic && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtopic}</p>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5 sm:hidden">
            <Clock className="h-3 w-3" />
            <span>{estimated_minutes} min</span>
          </div>
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground shrink-0 ml-3">
        <Clock className="h-3 w-3" />
        <span>{estimated_minutes} min</span>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 ml-2" />
    </Link>
  );
};

// ─── Date helpers (America/Sao_Paulo) ───────────────────────────

function toSaoPauloDate(dateStr: string): Date {
  // Parse YYYY-MM-DD as local date at noon to avoid timezone shifts
  return new Date(dateStr + "T12:00:00");
}

function getSaoPauloToday(): Date {
  const now = new Date();
  // Get current date in São Paulo timezone
  const spStr = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(spStr + "T12:00:00");
}

function formatDateHeader(dateStr: string): string {
  const date = toSaoPauloDate(dateStr);
  const today = getSaoPauloToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateDay = date.toISOString().split("T")[0];
  const todayDay = today.toISOString().split("T")[0];
  const tomorrowDay = tomorrow.toISOString().split("T")[0];

  if (dateDay === todayDay) return "Hoje";
  if (dateDay === tomorrowDay) return "Amanhã";

  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
}

function isBeforeToday(dateStr: string): boolean {
  const date = toSaoPauloDate(dateStr).toISOString().split("T")[0];
  const today = getSaoPauloToday().toISOString().split("T")[0];
  return date < today;
}

// ─── Study Page ─────────────────────────────────────────────────

const Study = () => {
  const { user } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  useEffect(() => {
    if (!user) return;
    const fetchMissions = async () => {
      const today = new Date();
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);
      // Also fetch past missions that might be overdue
      const pastStart = new Date(today);
      pastStart.setDate(pastStart.getDate() - 14);

      const { data } = await supabase
        .from("daily_missions")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", pastStart.toISOString().split("T")[0])
        .lte("date", weekEnd.toISOString().split("T")[0])
        .order("date", { ascending: true });
      if (data) setMissions(data);
      setLoading(false);
    };
    fetchMissions();
  }, [user]);

  const filtered = useMemo(() => {
    return missions.filter((m) => {
      if (filter === "pending") return m.status !== "completed";
      if (filter === "completed") return m.status === "completed";
      return true;
    });
  }, [missions, filter]);

  const completedCount = missions.filter((m) => m.status === "completed").length;

  // Group missions by day
  const grouped = useMemo(() => {
    const overdue: Mission[] = [];
    const byDate: Record<string, Mission[]> = {};

    for (const m of filtered) {
      if (isBeforeToday(m.date) && m.status !== "completed") {
        overdue.push(m);
      } else {
        if (!byDate[m.date]) byDate[m.date] = [];
        byDate[m.date].push(m);
      }
    }

    // Sort dates ascending
    const sortedDates = Object.keys(byDate).sort();
    const sections: { label: string; missions: Mission[] }[] = [];

    if (overdue.length > 0) {
      sections.push({ label: "Atrasadas", missions: overdue });
    }

    for (const date of sortedDates) {
      sections.push({ label: formatDateHeader(date), missions: byDate[date] });
    }

    // If "Hoje" section doesn't exist and we have missions, add an empty one
    const todayStr = getSaoPauloToday().toISOString().split("T")[0];
    const hasTodaySection = sortedDates.includes(todayStr) || sections.some(s => s.label === "Hoje");
    if (!hasTodaySection && missions.length > 0 && filter !== "completed") {
      const insertIdx = sections.findIndex(s => s.label !== "Atrasadas");
      sections.splice(insertIdx === -1 ? sections.length : insertIdx, 0, {
        label: "Hoje",
        missions: [],
      });
    }

    return sections;
  }, [filtered, missions, filter]);

  // Find next pending mission
  const nextPending = missions.find((m) => m.status !== "completed");

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-[640px] mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-foreground" />
            <span className="text-base font-semibold text-foreground">Estudar</span>
          </div>
          {missions.length > 0 && (
            <span className="text-xs text-muted-foreground">{completedCount}/{missions.length} feitas</span>
          )}
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-6">
        {missions.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Sem missões por enquanto</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
              Complete o diagnóstico para gerar seu plano de estudos personalizado.
            </p>
            <Link
              to="/diagnostic/intro"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-white text-sm font-semibold hover:bg-foreground/90 transition-colors"
            >
              Gerar plano
            </Link>
          </div>
        ) : (
          <>
            {/* Continue where you left off */}
            {nextPending && filter !== "completed" && (
              <Link
                to={`/mission/${nextPending.mission_type}/${nextPending.id}`}
                className="flex items-center justify-between p-4 bg-foreground rounded-2xl mb-6 hover:bg-foreground/90 transition-colors animate-fade-in"
              >
                <div className="flex items-center gap-3 text-white min-w-0">
                  <ArrowRight className="h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">Continuar de onde parei</p>
                    <p className="text-xs text-white/70 truncate mt-0.5">
                      {nextPending.subject} — {MISSION_TYPE_LABEL[nextPending.mission_type] || nextPending.mission_type}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-white/70 shrink-0 ml-2" />
              </Link>
            )}

            {/* Filters */}
            <div className="flex gap-2 mb-6 animate-fade-in">
              {(["all", "pending", "completed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                    filter === f
                      ? "bg-foreground text-white"
                      : "bg-white border border-gray-200 text-foreground hover:border-gray-400"
                  }`}
                >
                  {f === "all" ? "Todas" : f === "pending" ? "Pendentes" : "Concluídas"}
                </button>
              ))}
            </div>

            {/* Grouped by day */}
            <div className="space-y-6">
              {grouped.map((section, sIdx) => (
                <div key={section.label} className="animate-fade-in" style={{ animationDelay: `${sIdx * 0.03}s` }}>
                  <div className="flex items-center gap-3 mb-3">
                    {section.label === "Atrasadas" && (
                      <AlertTriangle className="h-4 w-4 text-warning" />
                    )}
                    <h3 className={`text-xs font-semibold uppercase tracking-wider ${
                      section.label === "Atrasadas" ? "text-warning" : "text-muted-foreground"
                    }`}>
                      {section.label}
                    </h3>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>

                  {section.missions.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-1">Nenhuma missão para hoje.</p>
                  ) : (
                    <div className="space-y-2">
                      {section.missions.map((mission) => (
                        <MissionCard
                          key={mission.id}
                          id={mission.id}
                          subject={mission.subject}
                          type={mission.mission_type}
                          subtopic={mission.subtopic}
                          estimated_minutes={mission.estimated_minutes || 15}
                          completed={mission.status === "completed"}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Filter empty states */}
            {filtered.length === 0 && filter === "pending" && (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">Você já concluiu tudo 🎉</p>
              </div>
            )}
            {filtered.length === 0 && filter === "completed" && (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">Nenhuma missão concluída ainda.</p>
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
