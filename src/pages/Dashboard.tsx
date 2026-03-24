import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Clock, ChevronRight, ArrowRight, Target } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";

interface Profile {
  name: string;
  education_goal: string;
  exam_date: string | null;
  onboarding_complete: boolean;
  total_xp?: number;
  current_streak?: number;
}

interface Mission {
  id: string;
  subject: string;
  subtopic: string;
  mission_type: string;
  status: string;
  date: string;
  estimated_minutes?: number;
}

const missionTypeLabels: Record<string, string> = {
  questions: "Questões",
  error_review: "Revisão de erros",
  short_summary: "Resumo",
  spaced_review: "Revisão",
  mixed_block: "Bloco misto",
  reading_work: "Leitura",
  writing_outline: "Planejamento de redação",
  writing_partial: "Redação parcial",
  writing_full: "Redação completa",
  // Legacy
  summary: "Resumo",
  flashcards: "Flashcards",
  review: "Revisão de erros",
};

const Dashboard = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("name, education_goal, exam_date, onboarding_complete, total_xp, current_streak")
        .eq("id", user.id)
        .single();
      if (profileData) setProfile(profileData);

      const today = new Date().toISOString().split("T")[0];
      const { data: missionsData } = await supabase
        .from("daily_missions")
        .select("id, subject, subtopic, mission_type, status, date, estimated_minutes")
        .eq("user_id", user.id)
        .eq("date", today);
      if (missionsData) setMissions(missionsData);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const daysUntilExam = profile?.exam_date
    ? Math.max(0, Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86400000))
    : null;

  const firstName = profile?.name?.split(" ")[0] || "Estudante";
  const completedMissions = missions.filter((m) => m.status === "completed").length;
  const pendingMissions = missions.filter((m) => m.status !== "completed");
  const hasMissions = missions.length > 0;
  const needsDiagnostic = !profile?.onboarding_complete;

  // Estimate total study time for today (use real estimated_minutes when available)
  const totalMinutesToday = missions.reduce((s, m) => s + (m.estimated_minutes || 15), 0);
  const completedMinutesToday = missions
    .filter((m) => m.status === "completed")
    .reduce((s, m) => s + (m.estimated_minutes || 15), 0);

  // Mock weekly data (from missions data)
  const weeklySessionsTarget = 5;
  const weeklySessionsDone = Math.min(completedMissions, weeklySessionsTarget);
  const weeklyPct = Math.round((weeklySessionsDone / weeklySessionsTarget) * 100);

  // Focus subjects: top 3 from pending missions
  const focusSubjects = [...new Set(pendingMissions.map((m) => m.subject))].slice(0, 3);

  // Last incomplete mission for "continue where you left off"
  const lastMission = pendingMissions[0] || null;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] pb-24">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#FAFAF9]/80 backdrop-blur-xl border-b border-gray-100/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-5 max-w-lg">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-foreground flex items-center justify-center">
              <BookOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-[15px] font-semibold text-foreground tracking-tight">Cátedra</span>
          </div>
          {daysUntilExam !== null && (
            <span className="text-xs font-medium text-muted-foreground">
              {daysUntilExam} dias para a prova
            </span>
          )}
        </div>
      </header>

      <main className="container mx-auto px-5 max-w-lg">
        {/* ─── Greeting ─────────────────────────────────────────────── */}
        <div className="pt-8 animate-fade-in">
          <h1 className="text-2xl font-semibold text-foreground">Olá, {firstName}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            {needsDiagnostic
              ? "Faça o diagnóstico para começar seu plano."
              : hasMissions
                ? "Seu estudo de hoje está montado."
                : "Sem sessões pendentes. Bom descanso."}
          </p>
        </div>

        {/* ─── Needs diagnostic CTA ─────────────────────────────────── */}
        {needsDiagnostic && (
          <Link
            to="/diagnostic/intro"
            className="block mt-6 bg-white rounded-2xl p-6 shadow-rest animate-fade-in hover:shadow-interactive transition-shadow"
            style={{ animationDelay: "0.06s" }}
          >
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <Target className="h-5 w-5 text-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-semibold text-foreground">Comece pelo diagnóstico</h3>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                  8 questões rápidas para montar seu plano personalizado
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            </div>
          </Link>
        )}

        {/* ─── 1. Hoje ──────────────────────────────────────────────── */}
        {hasMissions && (
          <div className="mt-6 animate-fade-in" style={{ animationDelay: "0.06s" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-foreground">Hoje</h2>
              <span className="text-xs text-muted-foreground">
                Meta: {totalMinutesToday} min
              </span>
            </div>

            <div className="bg-white rounded-2xl shadow-rest overflow-hidden">
              {missions.map((mission, i) => {
                const isDone = mission.status === "completed";
                return (
                  <Link
                    key={mission.id}
                    to={`/mission/${mission.mission_type}/${mission.id}`}
                    className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50 ${
                      i > 0 ? "border-t border-gray-50" : ""
                    } ${isDone ? "opacity-50" : ""}`}
                  >
                    <div className={`h-2 w-2 rounded-full shrink-0 ${isDone ? "bg-green-400" : "bg-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[14px] font-medium text-foreground truncate ${isDone ? "line-through" : ""}`}>
                        {mission.subject} — {missionTypeLabels[mission.mission_type] || mission.mission_type}
                      </p>
                      <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{mission.subtopic}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" />
                      {mission.estimated_minutes || 15} min
                    </div>
                  </Link>
                );
              })}

              {/* CTA at bottom of card */}
              {pendingMissions.length > 0 && (
                <Link
                  to={`/mission/${pendingMissions[0].mission_type}/${pendingMissions[0].id}`}
                  className="flex items-center justify-center gap-2 px-5 py-3.5 border-t border-gray-100 bg-foreground text-white text-[14px] font-semibold hover:bg-foreground/90 transition-colors"
                >
                  Continuar estudo
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>

            {completedMissions > 0 && (
              <p className="text-[12px] text-muted-foreground mt-2">
                {completedMinutesToday} de {totalMinutesToday} min concluídos
              </p>
            )}
          </div>
        )}

        {/* ─── 2. Sua semana ────────────────────────────────────────── */}
        {!needsDiagnostic && (
          <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.12s" }}>
            <h2 className="text-[15px] font-semibold text-foreground mb-3">Sua semana</h2>
            <div className="bg-white rounded-2xl p-5 shadow-rest">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[14px] text-foreground">
                  <span className="font-semibold">{weeklySessionsDone}</span> de {weeklySessionsTarget} sessões
                </p>
                <span className="text-xs text-muted-foreground">{weeklyPct}% do plano</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-2 rounded-full bg-foreground transition-all duration-700"
                  style={{ width: `${weeklyPct}%` }}
                />
              </div>
              <p className="text-[12px] text-muted-foreground mt-3">
                Vamos ajustar o plano com seu uso
              </p>
            </div>
          </div>
        )}

        {/* ─── 3. Matérias em foco ──────────────────────────────────── */}
        {focusSubjects.length > 0 && (
          <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.18s" }}>
            <h2 className="text-[15px] font-semibold text-foreground mb-3">Matérias em foco</h2>
            <div className="space-y-2.5">
              {focusSubjects.map((subject) => {
                const subjectMission = pendingMissions.find((m) => m.subject === subject);
                const actionLabel = subjectMission
                  ? missionTypeLabels[subjectMission.mission_type] === "Revisão de erros"
                    ? "Rever erros"
                    : missionTypeLabels[subjectMission.mission_type] === "Questões"
                      ? "Resolver questões"
                      : missionTypeLabels[subjectMission.mission_type] || "Estudar"
                  : "Estudar";

                return (
                  <div
                    key={subject}
                    className="flex items-center justify-between bg-white rounded-xl px-4 py-3.5 shadow-rest"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-foreground" />
                      <span className="text-[14px] font-medium text-foreground">{subject}</span>
                    </div>
                    {subjectMission ? (
                      <Link
                        to={`/mission/${subjectMission.mission_type}/${subjectMission.id}`}
                        className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      >
                        {actionLabel}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">{actionLabel}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── 4. Continue de onde parou ─────────────────────────────── */}
        {lastMission && completedMissions > 0 && (
          <div className="mt-8 mb-4 animate-fade-in" style={{ animationDelay: "0.24s" }}>
            <h2 className="text-[15px] font-semibold text-foreground mb-3">Continue de onde parou</h2>
            <Link
              to={`/mission/${lastMission.mission_type}/${lastMission.id}`}
              className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 shadow-rest hover:shadow-interactive transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-foreground truncate">
                  {missionTypeLabels[lastMission.mission_type] || lastMission.mission_type} de {lastMission.subject}
                </p>
                <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
                  {lastMission.subtopic}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </Link>
          </div>
        )}

        {/* ─── Empty state (no missions, not needing diagnostic) ───── */}
        {!needsDiagnostic && !hasMissions && (
          <div className="mt-8 text-center animate-fade-in" style={{ animationDelay: "0.06s" }}>
            <div className="bg-white rounded-2xl p-8 shadow-rest">
              <p className="text-[15px] font-medium text-foreground">Nada pendente por hoje</p>
              <p className="text-[13px] text-muted-foreground mt-2">
                Descanse ou pratique por conta própria.
              </p>
              <Link
                to="/study"
                className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-foreground hover:underline"
              >
                Explorar conteúdo
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default Dashboard;
