import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Clock, ChevronRight, CheckCircle2, ArrowRight, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";

// ─── Types ──────────────────────────────────────────────────────

interface Mission {
  id: string;
  subject: string;
  subtopic: string | null;
  mission_type: string;
  status: string;
  date: string;
  estimated_minutes: number | null;
  score: number | null;
}

// ─── Label mapper (single source of truth) ──────────────────────

const MISSION_TYPE_LABELS: Record<string, string> = {
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

// ─── Date helpers (America/Sao_Paulo) ───────────────────────────

function getSaoPauloTodayStr(): string {
  const now = new Date();
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function getSaoPauloTomorrowStr(): string {
  const today = new Date(getSaoPauloTodayStr() + "T12:00:00");
  today.setDate(today.getDate() + 1);
  return today.toISOString().split("T")[0];
}

function formatDateHeader(dateStr: string): string {
  const todayStr = getSaoPauloTodayStr();
  const tomorrowStr = getSaoPauloTomorrowStr();
  if (dateStr === todayStr) return "Hoje";
  if (dateStr === tomorrowStr) return "Amanhã";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Subtopic helper ────────────────────────────────────────────

function showableSubtopic(subtopic: string | null | undefined): string | null {
  if (!subtopic) return null;
  const trimmed = subtopic.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "geral") return null;
  return trimmed;
}

// ─── MissionCard ────────────────────────────────────────────────

interface MissionCardProps {
  id: string;
  subject: string;
  subtopic: string | null;
  missionType: string;
  status: string;
  estimatedMinutes: number | null;
  score: number | null;
  isNextRecommended?: boolean;
}

const MissionCard = ({
  id,
  subject,
  subtopic,
  missionType,
  status,
  estimatedMinutes,
  score,
  isNextRecommended,
}: MissionCardProps) => {
  const completed = status === "completed";
  const minutes = estimatedMinutes ?? 15;
  const typeLabel = MISSION_TYPE_LABELS[missionType] || missionType;
  const visibleSubtopic = showableSubtopic(subtopic);

  // Score badge colors (no red)
  let scoreBadge: { bg: string; text: string } | null = null;
  if (completed && score != null) {
    if (score >= 70) scoreBadge = { bg: "bg-green-500/10", text: "text-green-600" };
    else if (score >= 40) scoreBadge = { bg: "bg-amber-500/10", text: "text-amber-600" };
    else scoreBadge = { bg: "bg-gray-100", text: "text-muted-foreground" };
  }

  return (
    <Link
      to={`/mission/${missionType}/${id}`}
      className={`group flex items-center justify-between p-4 bg-white rounded-2xl border transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${
        completed
          ? "opacity-60 border-gray-100"
          : isNextRecommended
            ? "border-foreground/20 bg-foreground/[0.02]"
            : "border-gray-100"
      }`}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {/* Status icon */}
        {completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
        ) : (
          <div className="h-5 w-5 shrink-0 mt-0.5 flex items-center justify-center">
            <div className="h-2.5 w-2.5 rounded-full bg-foreground" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Subject + type badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {subject}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-foreground font-medium shrink-0">
              {typeLabel}
            </span>
            {scoreBadge && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${scoreBadge.bg} ${scoreBadge.text}`}>
                {score}%
              </span>
            )}
          </div>

          {/* Subtopic (only if meaningful) */}
          {visibleSubtopic && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{visibleSubtopic}</p>
          )}

          {/* Time — mobile: below title */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5 sm:hidden">
            <Clock className="h-3 w-3" />
            <span>{minutes} min</span>
          </div>
        </div>
      </div>

      {/* Time — desktop: right-aligned */}
      <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground shrink-0 ml-3">
        <Clock className="h-3 w-3" />
        <span>{minutes} min</span>
      </div>

      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 ml-2" />
    </Link>
  );
};

// ─── Study Page ─────────────────────────────────────────────────

const Study = () => {
  const { user } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  useEffect(() => {
    if (!user) return;
    const fetchMissions = async () => {
      // 1. Try to get active study plan for date range
      const { data: activePlan } = await supabase
        .from("study_plans")
        .select("id, start_date, end_date")
        .eq("user_id", user.id)
        .eq("is_current", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const startDate = (activePlan as any)?.start_date || new Date().toISOString().split("T")[0];
      const endDate = (activePlan as any)?.end_date || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

      // 2. Fetch missions in range
      const { data } = await supabase
        .from("daily_missions")
        .select("id, subject, subtopic, mission_type, status, date, estimated_minutes, score")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (data) setMissions(data as Mission[]);
      setLoading(false);
    };
    fetchMissions();
  }, [user]);

  const todayStr = getSaoPauloTodayStr();

  // ─── Filtering ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    return missions.filter((m) => {
      if (filter === "pending") return m.status !== "completed";
      if (filter === "completed") return m.status === "completed";
      return true;
    });
  }, [missions, filter]);

  const completedCount = filtered.filter((m) => m.status === "completed").length;
  const totalCount = filtered.length;

  // ─── Group by day ──────────────────────────────────────────
  const grouped = useMemo(() => {
    const overdue: Mission[] = [];
    const byDate: Record<string, Mission[]> = {};

    for (const m of filtered) {
      if (m.date < todayStr && m.status === "pending") {
        overdue.push(m);
      } else {
        if (!byDate[m.date]) byDate[m.date] = [];
        byDate[m.date].push(m);
      }
    }

    // Sort within each day: pending first, then completed, preserving original order
    for (const date of Object.keys(byDate)) {
      const pending = byDate[date].filter(m => m.status !== "completed");
      const done = byDate[date].filter(m => m.status === "completed");
      byDate[date] = [...pending, ...done];
    }

    const sortedDates = Object.keys(byDate).sort();
    const sections: { label: string; date: string | null; missions: Mission[] }[] = [];

    if (overdue.length > 0) {
      sections.push({ label: "Atrasadas", date: null, missions: overdue });
    }

    for (const date of sortedDates) {
      sections.push({ label: formatDateHeader(date), date, missions: byDate[date] });
    }

    // If "Hoje" section doesn't exist, inject it
    const hasTodaySection = sortedDates.includes(todayStr);
    if (!hasTodaySection && filter !== "completed") {
      const insertIdx = sections.findIndex(s => s.label !== "Atrasadas");
      sections.splice(insertIdx === -1 ? sections.length : insertIdx, 0, {
        label: "Hoje",
        date: todayStr,
        missions: [],
      });
    }

    // Remove empty sections (except "Hoje" which shows "sem missões")
    return sections.filter(s => s.missions.length > 0 || s.label === "Hoje");
  }, [filtered, todayStr, filter]);

  // ─── "Continuar de onde parei" — first pending today, else first overdue ───
  const continueCard = useMemo(() => {
    // First pending from today
    const todayPending = missions.find(m => m.date === todayStr && m.status !== "completed");
    if (todayPending) return todayPending;
    // First overdue
    return missions.find(m => m.date < todayStr && m.status === "pending") || null;
  }, [missions, todayStr]);

  // ─── Today's progress bar data ────────────────────────────
  const todayProgress = useMemo(() => {
    const todayMissions = missions.filter(m => m.date === todayStr);
    if (todayMissions.length === 0) return null;
    const done = todayMissions.filter(m => m.status === "completed");
    const totalMin = todayMissions.reduce((s, m) => s + (m.estimated_minutes ?? 15), 0);
    const doneMin = done.reduce((s, m) => s + (m.estimated_minutes ?? 15), 0);
    const hasMinuteData = todayMissions.some(m => m.estimated_minutes != null);
    return {
      completed: done.length,
      total: todayMissions.length,
      doneMin,
      totalMin,
      hasMinuteData,
      pct: (done.length / todayMissions.length) * 100,
    };
  }, [missions, todayStr]);

  // ─── All-week completion check ────────────────────────────
  const allWeekDone = missions.length > 0 && missions.every(m => m.status === "completed");

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-[640px] mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-foreground" />
            <span className="text-base font-semibold text-foreground">Estudar</span>
          </div>
          {missions.length > 0 && (
            <span className="text-xs text-muted-foreground">{completedCount}/{totalCount} feitas</span>
          )}
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-6">
        {/* ─── Empty: no missions at all ─── */}
        {missions.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Seu plano ainda não foi gerado.</h2>
            <Link
              to="/diagnostic/intro"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-white text-sm font-semibold hover:bg-foreground/90 transition-colors"
            >
              Fazer diagnóstico
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : allWeekDone ? (
          /* ─── All-week completed ─── */
          <div className="text-center py-16 animate-fade-in">
            <h2 className="text-lg font-semibold text-foreground">Plano da semana concluído! 🎉</h2>
            <p className="text-sm text-muted-foreground mt-2">Bom trabalho. Descanse ou pratique por conta própria.</p>
            <Link
              to="/exams"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-white text-sm font-semibold hover:bg-foreground/90 transition-colors"
            >
              Explorar simulados
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            {/* ─── Filters ─── */}
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

            {/* ─── "Continuar de onde parei" ─── */}
            {continueCard && filter !== "completed" && (
              <Link
                to={`/mission/${continueCard.mission_type}/${continueCard.id}`}
                className="block mb-6 p-4 bg-foreground rounded-2xl hover:bg-foreground/90 transition-colors animate-fade-in"
              >
                <p className="text-xs text-white/60 font-medium">Próxima</p>
                <div className="flex items-center justify-between mt-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">
                      {continueCard.subject} — {MISSION_TYPE_LABELS[continueCard.mission_type] || continueCard.mission_type}
                    </p>
                    {showableSubtopic(continueCard.subtopic) && (
                      <p className="text-xs text-white/60 truncate mt-0.5">
                        {showableSubtopic(continueCard.subtopic)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-white/60 shrink-0 ml-3">
                    <Clock className="h-3 w-3" />
                    <span>{continueCard.estimated_minutes ?? 15} min</span>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 mt-3 text-sm font-semibold text-white">
                  Continuar estudo
                  <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            )}

            {/* ─── Filter empty states ─── */}
            {filtered.length === 0 && filter === "pending" && (
              <div className="text-center py-12 animate-fade-in">
                <p className="text-sm text-muted-foreground">Tudo feito por hoje! 🎉</p>
              </div>
            )}
            {filtered.length === 0 && filter === "completed" && (
              <div className="text-center py-12 animate-fade-in">
                <p className="text-sm text-muted-foreground">Nenhuma missão concluída ainda. Que tal começar?</p>
              </div>
            )}

            {/* ─── Grouped by day ─── */}
            <div className="space-y-6">
              {grouped.map((section, sIdx) => {
                const isOverdue = section.label === "Atrasadas";
                const isTodaySection = section.label === "Hoje";

                return (
                  <div key={section.label + sIdx} className="animate-fade-in" style={{ animationDelay: `${sIdx * 0.03}s` }}>
                    {/* Section header */}
                    <div className="flex items-center gap-3 mb-3">
                      {isOverdue && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      <h3 className={`text-xs font-semibold uppercase tracking-wider ${
                        isOverdue ? "text-amber-500" : "text-muted-foreground"
                      }`}>
                        {section.label}
                      </h3>

                      {/* Today's progress bar inline */}
                      {isTodaySection && todayProgress && todayProgress.total > 0 && (
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {todayProgress.completed}/{todayProgress.total} feitas
                          {todayProgress.hasMinuteData && ` · ${todayProgress.doneMin} de ${todayProgress.totalMin} min`}
                        </span>
                      )}

                      {!isTodaySection && <div className="flex-1 h-px bg-gray-100" />}
                    </div>

                    {/* Today: progress bar */}
                    {isTodaySection && todayProgress && todayProgress.total > 0 && (
                      <div className="mb-3">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-foreground rounded-full transition-all duration-500"
                            style={{ width: `${todayProgress.pct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Missions or empty */}
                    {section.missions.length === 0 ? (
                      <p className="text-sm text-muted-foreground pl-1">Hoje — sem missões planejadas</p>
                    ) : (
                      <div className="space-y-2">
                        {section.missions.map((mission) => {
                          // isNextRecommended = first pending mission of today's section
                          const isNext = isTodaySection
                            && mission.status !== "completed"
                            && mission.id === section.missions.find(m => m.status !== "completed")?.id;

                          return (
                            <MissionCard
                              key={mission.id}
                              id={mission.id}
                              subject={mission.subject}
                              subtopic={mission.subtopic}
                              missionType={mission.mission_type}
                              status={mission.status}
                              estimatedMinutes={mission.estimated_minutes}
                              score={mission.score}
                              isNextRecommended={isNext}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default Study;
