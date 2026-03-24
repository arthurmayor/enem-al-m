import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Clock, ChevronRight, CheckCircle2, Circle, ArrowRight, Target, Zap, Trophy, Play, RotateCcw } from "lucide-react";
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

interface RecentAnswer {
  is_correct: boolean;
  subject: string;
}

const MISSION_TYPE_LABEL: Record<string, string> = {
  questions: "Questoes",
  error_review: "Revisao de erros",
  short_summary: "Resumo",
  spaced_review: "Revisao espacada",
  mixed_block: "Bloco misto",
  reading_work: "Leitura",
  writing_outline: "Planejamento de redacao",
  writing_partial: "Redacao parcial",
  writing_full: "Redacao completa",
  summary: "Resumo",
  flashcards: "Flashcards",
  review: "Revisao de erros",
};

const MISSION_TYPE_ICON: Record<string, string> = {
  questions: "pencil",
  error_review: "rotate",
  short_summary: "book",
  spaced_review: "clock",
  mixed_block: "layers",
  reading_work: "book",
  writing_outline: "edit",
  writing_partial: "edit",
  writing_full: "edit",
  summary: "book",
  flashcards: "cards",
  review: "rotate",
};

// Mission priority for smart ordering
const MISSION_PRIORITY: Record<string, number> = {
  questions: 1,       // highest impact — gargalo focus
  error_review: 2,    // unlock — fix mistakes
  mixed_block: 3,     // practice
  spaced_review: 4,   // reinforcement
  short_summary: 5,
  reading_work: 6,
  summary: 7,
  flashcards: 8,
  writing_outline: 9,
  writing_partial: 10,
  writing_full: 11,
  review: 12,
};

// ─── Date helpers (America/Sao_Paulo) ───────────────────────────

function toSaoPauloDate(dateStr: string): Date {
  return new Date(dateStr + "T12:00:00");
}

function getSaoPauloToday(): Date {
  const now = new Date();
  const spStr = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(spStr + "T12:00:00");
}

function isToday(dateStr: string): boolean {
  const date = toSaoPauloDate(dateStr).toISOString().split("T")[0];
  const today = getSaoPauloToday().toISOString().split("T")[0];
  return date === today;
}

function isBeforeToday(dateStr: string): boolean {
  const date = toSaoPauloDate(dateStr).toISOString().split("T")[0];
  const today = getSaoPauloToday().toISOString().split("T")[0];
  return date < today;
}

// ─── Mission objective text ─────────────────────────────────────

function getMissionObjective(
  mission: Mission,
  subjectAccuracy: Record<string, number>,
  gargaloSubject: string | null,
): string {
  const acc = subjectAccuracy[mission.subject];
  const isGargalo = mission.subject === gargaloSubject;

  // If we have accuracy data, show a concrete goal
  if (acc !== undefined && acc >= 0) {
    const target = Math.min(acc + 10, 100);
    if (isGargalo) return `Subir de ${acc}% para ${target}%`;
    if (acc >= 70) return `Manter acima de ${acc}%`;
    return `Melhorar de ${acc}% para ${target}%`;
  }

  // Fallback by mission type
  switch (mission.mission_type) {
    case "error_review":
    case "review":
      return "Corrigir erros anteriores";
    case "spaced_review":
      return "Fixar o que aprendeu";
    case "short_summary":
    case "summary":
    case "reading_work":
      return "Aprofundar conhecimento";
    case "writing_outline":
    case "writing_partial":
    case "writing_full":
      return "Melhorar escrita";
    default:
      return "Melhorar desempenho";
  }
}

function getMissionTag(
  mission: Mission,
  gargaloSubject: string | null,
  idx: number,
): { label: string; color: string } {
  if (mission.subject === gargaloSubject && idx === 0) {
    return { label: "Maior impacto", color: "bg-amber-100 text-amber-700" };
  }
  if (mission.mission_type === "error_review" || mission.mission_type === "review") {
    return { label: "Destrave", color: "bg-blue-100 text-blue-700" };
  }
  if (mission.mission_type === "spaced_review") {
    return { label: "Reforco", color: "bg-green-100 text-green-700" };
  }
  return { label: MISSION_TYPE_LABEL[mission.mission_type] || mission.mission_type, color: "bg-gray-100 text-gray-600" };
}

// ─── SessionMissionCard ─────────────────────────────────────────

interface SessionMissionCardProps {
  mission: Mission;
  index: number;
  objective: string;
  tag: { label: string; color: string };
  completed: boolean;
  isNext: boolean;
}

const SessionMissionCard = ({ mission, index, objective, tag, completed, isNext }: SessionMissionCardProps) => {
  const typeLabel = MISSION_TYPE_LABEL[mission.mission_type] || mission.mission_type;

  return (
    <Link
      to={`/mission/${mission.mission_type}/${mission.id}`}
      className={`group relative flex items-start gap-3 p-4 rounded-2xl border transition-all duration-300
        ${completed
          ? "bg-gray-50 border-gray-100 opacity-70"
          : isNext
            ? "bg-white border-foreground/20 shadow-sm hover:shadow-md hover:-translate-y-0.5"
            : "bg-white border-gray-100 hover:shadow-sm hover:-translate-y-0.5"
        }`}
    >
      {/* Step number / check */}
      <div className={`flex items-center justify-center h-7 w-7 rounded-full shrink-0 mt-0.5 text-xs font-bold
        ${completed
          ? "bg-green-100 text-green-600"
          : isNext
            ? "bg-foreground text-white"
            : "bg-gray-100 text-gray-500"
        }`}
      >
        {completed ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
      </div>

      <div className="min-w-0 flex-1">
        {/* Subject + tag */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {mission.subject}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${tag.color}`}>
            {tag.label}
          </span>
        </div>

        {/* Type + time */}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-muted-foreground">{typeLabel}</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {mission.estimated_minutes || 15} min
          </span>
        </div>

        {/* Objective */}
        {!completed && (
          <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
            <Target className="h-3 w-3 shrink-0" />
            {objective}
          </p>
        )}
      </div>

      {/* Arrow */}
      {!completed && (
        <ChevronRight className={`h-5 w-5 shrink-0 mt-1 transition-colors
          ${isNext ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}
        />
      )}
    </Link>
  );
};

// ─── Study Page ─────────────────────────────────────────────────

const RECENT_WINDOW = 25;

const Study = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [recentAnswers, setRecentAnswers] = useState<RecentAnswer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // Fetch missions (today + overdue + upcoming)
      const today = new Date();
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const pastStart = new Date(today);
      pastStart.setDate(pastStart.getDate() - 14);

      const [missionRes, answerRes] = await Promise.all([
        supabase
          .from("daily_missions")
          .select("*")
          .eq("user_id", user.id)
          .gte("date", pastStart.toISOString().split("T")[0])
          .lte("date", weekEnd.toISOString().split("T")[0])
          .order("date", { ascending: true }),
        supabase
          .from("answer_history")
          .select("is_correct, questions!inner(subject)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      if (missionRes.data) setMissions(missionRes.data);
      if (answerRes.data) {
        setRecentAnswers(
          answerRes.data.map((a: any) => ({
            is_correct: a.is_correct,
            subject: (a.questions as any)?.subject || "",
          }))
        );
      }
      setLoading(false);
    };
    fetchData();
  }, [user]);

  // ─── Subject accuracy from recent answers (same logic as Performance) ───
  const subjectAccuracy = useMemo(() => {
    const acc: Record<string, number> = {};
    const subjects = [...new Set(recentAnswers.map(a => a.subject).filter(Boolean))];
    for (const s of subjects) {
      const recent = recentAnswers.filter(a => a.subject === s).slice(0, RECENT_WINDOW);
      if (recent.length >= 5) {
        acc[s] = Math.round((recent.filter(a => a.is_correct).length / recent.length) * 100);
      }
    }
    return acc;
  }, [recentAnswers]);

  // Gargalo = subject with lowest accuracy (min 5 answers)
  const gargaloSubject = useMemo(() => {
    const entries = Object.entries(subjectAccuracy);
    if (entries.length === 0) return null;
    entries.sort((a, b) => a[1] - b[1]);
    return entries[0][1] < 70 ? entries[0][0] : null;
  }, [subjectAccuracy]);

  // ─── Today's session: overdue + today's missions, smart-ordered ───
  const sessionMissions = useMemo(() => {
    const todayStr = getSaoPauloToday().toISOString().split("T")[0];
    // Include overdue pending + today's missions
    const candidates = missions.filter(m =>
      (isToday(m.date)) || (isBeforeToday(m.date) && m.status !== "completed")
    );

    // Smart ordering: gargalo subject first, then by priority type
    return [...candidates].sort((a, b) => {
      // Completed always last
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (b.status === "completed" && a.status !== "completed") return -1;

      // Gargalo subject first
      const aIsGargalo = a.subject === gargaloSubject ? 0 : 1;
      const bIsGargalo = b.subject === gargaloSubject ? 0 : 1;
      if (aIsGargalo !== bIsGargalo) return aIsGargalo - bIsGargalo;

      // Then by mission type priority
      const aPrio = MISSION_PRIORITY[a.mission_type] ?? 99;
      const bPrio = MISSION_PRIORITY[b.mission_type] ?? 99;
      return aPrio - bPrio;
    });
  }, [missions, gargaloSubject]);

  const sessionCompleted = sessionMissions.filter(m => m.status === "completed").length;
  const sessionTotal = sessionMissions.length;
  const allSessionDone = sessionTotal > 0 && sessionCompleted === sessionTotal;
  const sessionProgress = sessionTotal > 0 ? (sessionCompleted / sessionTotal) * 100 : 0;

  // Total estimated time for pending session missions
  const sessionTimeMinutes = useMemo(() => {
    return sessionMissions
      .filter(m => m.status !== "completed")
      .reduce((sum, m) => sum + (m.estimated_minutes || 15), 0);
  }, [sessionMissions]);

  // Next pending mission in session (for "Comecar sessao" button)
  const nextSessionMission = sessionMissions.find(m => m.status !== "completed");

  // Focus subject = first pending mission's subject (after smart ordering)
  const focusSubject = nextSessionMission?.subject || null;
  const focusReason = useMemo(() => {
    if (!focusSubject) return "";
    if (focusSubject === gargaloSubject) return "Maior oportunidade de evolucao";
    const acc = subjectAccuracy[focusSubject];
    if (acc !== undefined && acc < 50) return "Precisa de atencao";
    if (acc !== undefined && acc >= 70) return "Manter desempenho forte";
    return "Proximo passo do seu plano";
  }, [focusSubject, gargaloSubject, subjectAccuracy]);

  // Upcoming missions (future, not today)
  const upcomingMissions = useMemo(() => {
    return missions.filter(m => !isToday(m.date) && !isBeforeToday(m.date));
  }, [missions]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/60 pb-20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-[640px] mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-foreground" />
            <span className="text-base font-semibold text-foreground">Estudar</span>
          </div>
          {sessionTotal > 0 && (
            <span className="text-xs text-muted-foreground">{sessionCompleted}/{sessionTotal} concluidas</span>
          )}
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-5">
        {missions.length === 0 ? (
          /* ─── Empty state ─── */
          <div className="text-center py-16 animate-fade-in">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Sem missoes por enquanto</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
              Complete o diagnostico para gerar seu plano de estudos personalizado.
            </p>
            <Link
              to="/diagnostic/intro"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-white text-sm font-semibold hover:bg-foreground/90 transition-colors"
            >
              Gerar plano
            </Link>
          </div>
        ) : allSessionDone ? (
          /* ─── Completion state ─── */
          <div className="animate-fade-in">
            <div className="bg-white rounded-2xl border border-green-100 p-6 text-center">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-green-100 mb-4">
                <Trophy className="h-7 w-7 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Sessao concluida!</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Voce completou {sessionCompleted} {sessionCompleted === 1 ? "missao" : "missoes"} hoje.
              </p>

              {/* Estimated progress */}
              {gargaloSubject && subjectAccuracy[gargaloSubject] !== undefined && (
                <div className="mt-4 p-3 bg-green-50 rounded-xl">
                  <p className="text-xs text-green-700 font-medium">
                    Progresso estimado em {gargaloSubject}
                  </p>
                  <p className="text-sm text-green-800 font-semibold mt-0.5">
                    {subjectAccuracy[gargaloSubject]}% &rarr; ~{Math.min(subjectAccuracy[gargaloSubject] + 5, 100)}%
                  </p>
                </div>
              )}

              {/* Next step */}
              <div className="mt-5 space-y-2">
                <Link
                  to="/desempenho"
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-foreground text-white rounded-xl text-sm font-semibold hover:bg-foreground/90 transition-colors"
                >
                  Ver seu desempenho
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {upcomingMissions.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Amanha: {upcomingMissions.filter(m => {
                      const tomorrow = new Date(getSaoPauloToday());
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      return m.date === tomorrow.toISOString().split("T")[0];
                    }).length || upcomingMissions.length} {upcomingMissions.length === 1 ? "missao" : "missoes"} programadas
                  </p>
                )}
              </div>
            </div>

            {/* Completed missions summary */}
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Concluidas hoje
              </h3>
              <div className="space-y-2">
                {sessionMissions.map((m, i) => (
                  <SessionMissionCard
                    key={m.id}
                    mission={m}
                    index={i}
                    objective=""
                    tag={getMissionTag(m, gargaloSubject, i)}
                    completed={true}
                    isNext={false}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ─── Active session ─── */
          <div className="space-y-5 animate-fade-in">

            {/* ── HERO: Sessao de hoje ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Sessao de hoje</p>
                  {focusSubject && (
                    <h2 className="text-lg font-bold text-foreground mt-1">
                      Foco: {focusSubject}
                    </h2>
                  )}
                  {focusReason && (
                    <p className="text-xs text-muted-foreground mt-0.5">{focusReason}</p>
                  )}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="font-semibold text-foreground">{sessionTimeMinutes} min</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {sessionTotal - sessionCompleted} {sessionTotal - sessionCompleted === 1 ? "missao" : "missoes"}
                  </p>
                </div>
              </div>

              {/* Session progress bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">
                    {sessionCompleted}/{sessionTotal} concluidas
                  </span>
                  <span className="text-xs font-medium text-foreground">{Math.round(sessionProgress)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-500"
                    style={{ width: `${sessionProgress}%` }}
                  />
                </div>
              </div>

              {/* CTA button */}
              {nextSessionMission && (
                <Link
                  to={`/mission/${nextSessionMission.mission_type}/${nextSessionMission.id}`}
                  className="mt-4 flex items-center justify-center gap-2 w-full py-3 bg-foreground text-white rounded-xl text-sm font-semibold hover:bg-foreground/90 transition-colors"
                >
                  <Play className="h-4 w-4" />
                  {sessionCompleted === 0 ? "Comecar sessao" : "Continuar sessao"}
                </Link>
              )}
            </div>

            {/* ── MISSOES DA SESSAO ── */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Missoes de hoje
              </h3>
              <div className="space-y-2">
                {sessionMissions.map((m, i) => {
                  const pendingIndex = sessionMissions.filter((x, xi) => xi < i && x.status !== "completed").length;
                  const completed = m.status === "completed";
                  const isNext = m.id === nextSessionMission?.id;
                  const displayIndex = completed
                    ? sessionMissions.filter((x, xi) => xi < i && x.status === "completed").length
                    : pendingIndex;

                  return (
                    <SessionMissionCard
                      key={m.id}
                      mission={m}
                      index={i}
                      objective={getMissionObjective(m, subjectAccuracy, gargaloSubject)}
                      tag={getMissionTag(m, gargaloSubject, i)}
                      completed={completed}
                      isNext={isNext}
                    />
                  );
                })}
              </div>
            </div>

            {/* ── PROXIMOS DIAS (collapsed) ── */}
            {upcomingMissions.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Proximos dias
                </h3>
                <div className="space-y-2">
                  {(() => {
                    // Group upcoming by date, show max 2 days
                    const byDate: Record<string, Mission[]> = {};
                    for (const m of upcomingMissions) {
                      if (!byDate[m.date]) byDate[m.date] = [];
                      byDate[m.date].push(m);
                    }
                    const dates = Object.keys(byDate).sort().slice(0, 2);
                    return dates.map(date => {
                      const dayMissions = byDate[date];
                      const dayTime = dayMissions.reduce((s, m) => s + (m.estimated_minutes || 15), 0);
                      const today = getSaoPauloToday();
                      const tomorrow = new Date(today);
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      const label = date === tomorrow.toISOString().split("T")[0]
                        ? "Amanha"
                        : toSaoPauloDate(date).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });

                      return (
                        <div key={date} className="bg-white rounded-2xl border border-gray-100 p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-semibold text-foreground">{label}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {dayMissions.length} {dayMissions.length === 1 ? "missao" : "missoes"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {dayTime} min
                            </div>
                          </div>
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {dayMissions.map(m => (
                              <span key={m.id} className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                                {m.subject}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default Study;
