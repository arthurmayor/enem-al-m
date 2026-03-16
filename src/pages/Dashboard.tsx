import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Clock, Brain, BarChart3, FileText, ChevronRight, Trophy, Flame, Target, Sparkles, Zap } from "lucide-react";
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
}

const missionTypeLabels: Record<string, string> = {
  questions: "Questões",
  summary: "Resumo",
  flashcards: "Flashcards",
  review: "Revisão",
};

const subjectColors: Record<string, string> = {
  "Matemática": "bg-primary",
  "Português": "bg-secondary",
  "Física": "bg-warning",
  "Química": "bg-success",
  "Biologia": "bg-success",
  "História": "bg-destructive",
  "Geografia": "bg-warning",
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
        .select("*")
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

  const examLabel = profile?.education_goal?.toUpperCase() || "EXAME";
  const completedMissions = missions.filter((m) => m.status === "completed").length;
  const firstName = profile?.name?.split(" ")[0] || "Estudante";
  const hasMissions = missions.length > 0;
  const needsDiagnostic = !profile?.onboarding_complete;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto flex h-14 items-center justify-between px-4 max-w-3xl">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg gradient-bg flex items-center justify-center">
              <BookOpen className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-base font-bold text-foreground tracking-tight">Cátedra</span>
          </div>
          <div className="flex items-center gap-2">
            {profile?.current_streak ? (
              <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-warning/10 text-warning text-xs font-semibold">
                <Flame className="h-3.5 w-3.5" />
                {profile.current_streak} dias
              </div>
            ) : null}
            {profile?.total_xp ? (
              <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-xp/10 text-xp text-xs font-semibold">
                <Zap className="h-3.5 w-3.5" />
                {profile.total_xp} XP
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* Greeting */}
        <div className="animate-fade-in">
          <h1 className="text-2xl font-extrabold text-foreground">Olá, {firstName} 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">Vamos continuar de onde você parou.</p>
        </div>

        {/* Countdown */}
        {daysUntilExam !== null && (
          <div className="mt-6 gradient-bg rounded-2xl p-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <p className="text-primary-foreground/60 text-xs font-semibold uppercase tracking-wider">
              {examLabel} 2026
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold text-primary-foreground tabular-nums">{daysUntilExam}</span>
              <span className="text-primary-foreground/70 text-lg">dias restantes</span>
            </div>
          </div>
        )}

        {/* Pass Probability */}
        <div className="mt-4 bg-card rounded-2xl border border-border/50 p-5 flex items-center justify-between animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Probabilidade de aprovação</p>
              <p className="text-lg font-bold text-foreground">—</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Complete o diagnóstico</span>
        </div>

        {/* Today's Missions */}
        <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-foreground">Missões de Hoje</h2>
            {hasMissions && (
              <span className="text-xs text-muted-foreground">{completedMissions} de {missions.length} concluídas</span>
            )}
          </div>

          {needsDiagnostic ? (
            <Link
              to="/diagnostic/intro"
              className="block p-6 bg-primary/5 rounded-2xl border border-primary/10 text-center hover:shadow-interactive transition-all"
            >
              <Target className="h-10 w-10 text-primary mx-auto mb-3" />
              <h3 className="font-bold text-foreground">Comece seu diagnóstico</h3>
              <p className="text-sm text-muted-foreground mt-1">Responda 25 questões para a IA montar seu plano personalizado</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Iniciar <ChevronRight className="h-4 w-4" />
              </span>
            </Link>
          ) : !hasMissions ? (
            <div className="p-6 bg-card rounded-2xl border border-border/50 text-center">
              <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-bold text-foreground">Sem missões para hoje</h3>
              <p className="text-sm text-muted-foreground mt-1">Que tal praticar com o tutor?</p>
              <Link to="/tutor" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Abrir Tutor IA <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {missions.map((mission) => (
                <Link
                  key={mission.id}
                  to={`/mission/${mission.mission_type}/${mission.id}`}
                  className="group flex items-center justify-between p-5 bg-card rounded-2xl border border-border/50 hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-2 w-2 rounded-full mt-2 ${subjectColors[mission.subject] || "bg-primary"}`} />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {mission.subject}
                      </span>
                      <h3 className="mt-0.5 font-semibold text-foreground text-sm">{mission.subtopic}</h3>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                          {missionTypeLabels[mission.mission_type] || mission.mission_type}
                        </span>
                        <span className="flex items-center text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 mr-1" />
                          15 min
                        </span>
                      </div>
                    </div>
                  </div>
                  {mission.status === "completed" ? (
                    <div className="h-6 w-6 rounded-full bg-success flex items-center justify-center">
                      <span className="text-success-foreground text-xs">✓</span>
                    </div>
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Weekly Progress */}
        <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <h2 className="text-base font-bold text-foreground mb-4">Progresso Semanal</h2>
          <div className="bg-card rounded-2xl border border-border/50 p-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-extrabold text-foreground">{completedMissions}</p>
                <p className="text-xs text-muted-foreground mt-1">Missões</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold text-foreground">—</p>
                <p className="text-xs text-muted-foreground mt-1">Acerto</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold text-foreground">—</p>
                <p className="text-xs text-muted-foreground mt-1">Horas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 mb-4 flex gap-3 overflow-x-auto pb-2 animate-fade-in" style={{ animationDelay: "0.4s" }}>
          <Link to="/tutor" className="shrink-0 p-4 bg-card rounded-2xl border border-border/50 hover:shadow-interactive hover:-translate-y-0.5 transition-all flex flex-col items-center gap-2 text-center min-w-[80px]">
            <div className="h-10 w-10 rounded-xl bg-xp/10 flex items-center justify-center">
              <Brain className="h-5 w-5 text-xp" />
            </div>
            <span className="text-xs font-semibold text-foreground">Tutor IA</span>
          </Link>
          <Link to="/desempenho" className="shrink-0 p-4 bg-card rounded-2xl border border-border/50 hover:shadow-interactive hover:-translate-y-0.5 transition-all flex flex-col items-center gap-2 text-center min-w-[80px]">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs font-semibold text-foreground">Performance</span>
          </Link>
          <Link to="/exams" className="shrink-0 p-4 bg-card rounded-2xl border border-border/50 hover:shadow-interactive hover:-translate-y-0.5 transition-all flex flex-col items-center gap-2 text-center min-w-[80px]">
            <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-warning" />
            </div>
            <span className="text-xs font-semibold text-foreground">Simulados</span>
          </Link>
          <Link to="/ranking" className="shrink-0 p-4 bg-card rounded-2xl border border-border/50 hover:shadow-interactive hover:-translate-y-0.5 transition-all flex flex-col items-center gap-2 text-center min-w-[80px]">
            <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-success" />
            </div>
            <span className="text-xs font-semibold text-foreground">Ranking</span>
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Dashboard;
