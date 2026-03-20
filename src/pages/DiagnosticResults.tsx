import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Info, Award, Target, TrendingUp } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubjectDistEntry {
  questions: number;
  meanDiff: number;
  sdDiff: number;
}

interface ExamConfigState {
  id: string;
  exam_slug: string;
  exam_name: string;
  course_slug: string;
  course_name: string;
  campus: string;
  cutoff_mean: number;
  cutoff_sd: number;
  total_questions: number;
  phase2_subjects: string[];
  competition_ratio: number;
  subject_distribution: Record<string, SubjectDistEntry>;
}

interface ProficiencyEntry {
  elo: number;
  correct: number;
  total: number;
  level: { label: string; color: string };
}

interface PriorityEntry {
  subject: string;
  elo: number;
  level: { label: string; color: string };
}

interface ProbBand {
  band: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface DiagnosticState {
  proficiencies: Record<string, ProficiencyEntry>;
  estimatedScore: number;
  cutoff: number;
  gap: number;
  probability: number;
  probBand: ProbBand;
  priorities: PriorityEntry[];
  totalCorrect: number;
  totalQuestions: number;
  examConfig: ExamConfigState;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function expectedAccuracy(studentElo: number, meanDiff: number, sdDiff: number): number {
  const grid = [-2.0, -1.5, -1.0, -0.5, -0.25, 0, 0.25, 0.5, 1.0, 1.5, 2.0];
  const weights = [0.02, 0.05, 0.10, 0.15, 0.18, 0.18, 0.15, 0.10, 0.05, 0.02, 0.00];
  let totalP = 0;
  for (let i = 0; i < grid.length; i++) {
    const qDiff = meanDiff + grid[i] * sdDiff;
    totalP += (1 / (1 + Math.pow(10, (qDiff - studentElo) / 400))) * weights[i];
  }
  return totalP;
}

function getBarWidth(elo: number): number {
  // Map Elo 600-1800 to 0-100%
  return Math.min(100, Math.max(0, ((elo - 600) / 1200) * 100));
}

function getBarColor(elo: number): string {
  if (elo >= 1500) return "bg-emerald-500";
  if (elo >= 1300) return "bg-green-500";
  if (elo >= 1100) return "bg-yellow-500";
  if (elo >= 900) return "bg-orange-500";
  return "bg-red-500";
}

// ─── Component ───────────────────────────────────────────────────────────────

const DiagnosticResults = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DiagnosticState | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);

  useEffect(() => {
    const state = location.state as DiagnosticState | null;
    if (state?.proficiencies && state?.examConfig) {
      setData(state);
      setLoading(false);
      return;
    }
    // Fallback: no state, show empty
    setLoading(false);
  }, [location.state]);

  const handleGeneratePlan = async () => {
    if (!user || !data) return;
    setGeneratingPlan(true);
    try {
      const { data: profile } = await supabase.from("profiles").select("name, education_goal, desired_course, exam_date, hours_per_day, study_days").eq("id", user.id).single();
      const userProfile = profile || {};
      const proficiencyScores = {
        proficiency: Object.entries(data.proficiencies).map(([subject, p]) => ({
          subject,
          subtopic: subject,
          score: Math.min(1, Math.max(0, (p.elo - 600) / 1200)),
          confidence: Math.min(1, p.total / 10),
        })),
        overall_readiness: data.estimatedScore / (data.examConfig.total_questions || 90),
        priority_areas: data.priorities.map((p) => p.subject),
        summary: `Diagnóstico ${data.examConfig.exam_name} - ${data.examConfig.course_name}. Nota estimada: ${data.estimatedScore}/${data.examConfig.total_questions}. Probabilidade: ${data.probBand.band}.`,
      };

      const { data: plan, error: invokeError } = await supabase.functions.invoke("generate-study-plan", {
        body: { proficiencyScores, userProfile },
      });

      if (invokeError) throw new Error(invokeError.message);
      if (plan?.error) throw new Error(plan.error);

      await supabase.from("daily_missions").delete().eq("user_id", user.id);
      await supabase.from("study_plans").delete().eq("user_id", user.id);

      const { data: savedPlan, error: planError } = await supabase.from("study_plans").insert({ user_id: user.id, week_number: 1, start_date: new Date().toISOString().split("T")[0], plan_json: plan, is_current: true, version: 1 }).select("id").single();
      if (planError) throw new Error(planError.message);

      const dayNames: Record<string, number> = {
        Domingo: 0, Segunda: 1, Terca: 2, Quarta: 3, Quinta: 4, Sexta: 5, Sabado: 6,
      };
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() + 1);
      const firstOfWeekday: Record<number, Date> = {};
      for (let wd = 0; wd <= 6; wd++) { const d = new Date(start); while (d.getDay() !== wd) d.setDate(d.getDate() + 1); firstOfWeekday[wd] = new Date(d); }
      const weekdayCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
      const missionsToInsert: { user_id: string; study_plan_id: string; date: string; subject: string; subtopic: string; mission_type: string; status: string }[] = [];

      for (const week of plan.weeks ?? []) {
        for (const dayObj of week.days ?? []) {
          const targetWeekday = dayNames[dayObj.day] ?? 1;
          const n = weekdayCount[targetWeekday] ?? 0;
          const base = firstOfWeekday[targetWeekday];
          const d = new Date(base); d.setDate(d.getDate() + n * 7);
          weekdayCount[targetWeekday] = n + 1;
          const dateStr = d.toISOString().split("T")[0];
          for (const mission of dayObj.missions ?? []) {
            missionsToInsert.push({ user_id: user.id, study_plan_id: savedPlan.id, date: dateStr, subject: mission.subject ?? "Geral", subtopic: mission.subtopic ?? "", mission_type: mission.type ?? "questions", status: "pending" });
          }
        }
      }

      if (missionsToInsert.length > 0) await supabase.from("daily_missions").insert(missionsToInsert);
      navigate("/dashboard");
    } catch (err) { console.error(err); setGeneratingPlan(false); }
  };

  if (loading) {
    return (<div className="min-h-screen bg-white flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>);
  }

  if (!data?.proficiencies) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted-foreground">Nenhum resultado de diagnóstico encontrado.</p>
          <Link to="/diagnostic/intro" className="mt-4 inline-block text-primary font-semibold">
            Fazer diagnóstico
          </Link>
        </div>
      </div>
    );
  }

  const { proficiencies, estimatedScore, cutoff, gap, probBand, priorities, totalCorrect, totalQuestions, examConfig } = data;
  const phase2Set = new Set(examConfig.phase2_subjects || []);
  const subjectDist = examConfig.subject_distribution || {};

  // Sort subjects: phase2 first, then by elo ascending
  const sortedSubjects = Object.entries(proficiencies).sort((a, b) => {
    const aPhase2 = phase2Set.has(a[0]) ? 0 : 1;
    const bPhase2 = phase2Set.has(b[0]) ? 0 : 1;
    if (aPhase2 !== bPhase2) return aPhase2 - bPhase2;
    return a[1].elo - b[1].elo;
  });

  return (
    <div className="min-h-screen bg-white pb-20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto flex h-14 items-center px-4 max-w-3xl">
          <span className="text-base font-semibold text-foreground">Resultado do Diagnóstico</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
        {/* Title */}
        <div className="text-center animate-fade-in">
          <h1 className="text-xl font-bold text-foreground">
            {examConfig.exam_name} — {examConfig.course_name}
          </h1>
          {examConfig.campus && (
            <p className="text-sm text-muted-foreground mt-1">{examConfig.campus}</p>
          )}
        </div>

        {/* Score + Cutoff Card */}
        <div className="grid grid-cols-2 gap-3 animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <div className="p-5 bg-card rounded-xl shadow-rest text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Nota estimada</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{estimatedScore}</p>
            <p className="text-xs text-muted-foreground">de {examConfig.total_questions}</p>
          </div>
          <div className="p-5 bg-card rounded-xl shadow-rest text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Award className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Nota de corte</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{cutoff}</p>
            <p className={`text-xs font-semibold ${gap >= 0 ? "text-green-600" : "text-red-600"}`}>
              {gap >= 0 ? `+${gap} acima` : `${gap} abaixo`}
            </p>
          </div>
        </div>

        {/* Probability Band */}
        <div
          className="p-5 rounded-xl border-2 animate-fade-in"
          style={{
            backgroundColor: probBand.bgColor,
            borderColor: probBand.borderColor,
            animationDelay: "0.1s",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5" style={{ color: probBand.color }} />
            <span className="text-sm font-semibold" style={{ color: probBand.color }}>
              Probabilidade de aprovação
            </span>
          </div>
          <p className="text-2xl font-bold" style={{ color: probBand.color }}>
            {probBand.band}
          </p>
          <p className="text-sm font-medium mt-1" style={{ color: probBand.color }}>
            {probBand.label}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Estimativa preliminar, confiança baixa
          </p>
        </div>

        {/* Acertos */}
        <div className="p-4 bg-card rounded-xl shadow-rest text-center animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <span className="text-sm text-muted-foreground">Acertos no diagnóstico</span>
          <p className="text-2xl font-bold text-foreground mt-1">
            {totalCorrect}<span className="text-base text-muted-foreground font-normal">/{totalQuestions}</span>
          </p>
        </div>

        {/* Proficiency by subject */}
        <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-base font-semibold text-foreground mb-4">Proficiência por Matéria</h2>
          <div className="space-y-3">
            {sortedSubjects.map(([subject, prof]) => {
              const isPhase2 = phase2Set.has(subject);
              const dist = subjectDist[subject];
              const accuracy = dist
                ? Math.round(expectedAccuracy(prof.elo, dist.meanDiff, dist.sdDiff) * 100)
                : Math.round((prof.correct / Math.max(1, prof.total)) * 100);

              return (
                <div key={subject} className="p-4 bg-card rounded-xl shadow-rest">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{subject}</span>
                      {isPhase2 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          2ª fase
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ color: prof.level.color, backgroundColor: `${prof.level.color}15` }}
                      >
                        {prof.level.label}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        Elo {prof.elo}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div
                      className={`h-2 rounded-full transition-all duration-700 ${getBarColor(prof.elo)}`}
                      style={{ width: `${getBarWidth(prof.elo)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      {prof.correct}/{prof.total} acertos
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Taxa estimada: {accuracy}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Priority areas */}
        {priorities.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: "0.25s" }}>
            <h2 className="text-base font-semibold text-foreground mb-4">Áreas Prioritárias</h2>
            <div className="space-y-2">
              {priorities.map((area, i) => (
                <div key={area.subject} className="flex items-center gap-3 p-3 bg-destructive/5 rounded-lg border border-destructive/10">
                  <span className="text-sm font-bold text-destructive">{i + 1}.</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{area.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      Elo {area.elo} — {area.level.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Methodology */}
        <div className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <button
            onClick={() => setShowMethodology(!showMethodology)}
            className="flex items-center gap-2 text-sm text-primary font-medium"
          >
            <Info className="h-4 w-4" />
            {showMethodology ? "Ocultar metodologia" : "Como calculamos"}
          </button>
          {showMethodology && (
            <div className="mt-3 p-4 bg-primary/5 rounded-xl border border-primary/10 text-sm text-foreground leading-relaxed space-y-2">
              <p>
                <strong>Sistema Elo:</strong> Cada matéria começa com rating 1200. A cada questão,
                o rating é atualizado usando a função logística do Elo (K=32 nas primeiras 10 questões,
                K=16 até 30, K=8 depois).
              </p>
              <p>
                <strong>Nota estimada:</strong> Para cada matéria do vestibular, calculamos a taxa de acerto
                esperada usando uma grade discreta de dificuldades (11 pontos ponderados) multiplicada pelo
                número de questões daquela matéria.
              </p>
              <p>
                <strong>Probabilidade:</strong> Comparamos sua nota estimada com a nota de corte histórica
                do curso, considerando a incerteza do seu nível (que diminui com mais dados) e a variabilidade
                da nota de corte.
              </p>
            </div>
          )}
        </div>

        {/* Generate Plan Button */}
        <div className="animate-fade-in" style={{ animationDelay: "0.35s" }}>
          <button
            onClick={handleGeneratePlan}
            disabled={generatingPlan}
            className="w-full h-12 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-60"
          >
            {generatingPlan ? "Gerando plano..." : "Gerar Meu Plano de Estudos"}
            <ChevronRight className="ml-1 h-4 w-4" />
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default DiagnosticResults;
