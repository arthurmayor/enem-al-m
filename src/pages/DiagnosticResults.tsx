import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Info, Award, Target, TrendingUp, Zap, ShieldCheck, AlertTriangle } from "lucide-react";
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
  adjustedElo?: number;
  isPhase2?: boolean;
  priority?: string;
  level: { label: string; color: string };
}

interface ProbBand {
  band: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface BlendInfo {
  directWeight: number;
  confidenceLabel: string;
  accuracyPct: number;
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
  blendInfo?: BlendInfo;
}

// Router result types
interface RouterResultData {
  placementBand: "base" | "intermediario" | "competitivo" | "forte";
  placementConfidence: "low" | "medium";
  strengths: string[];
  bottlenecks: string[];
  initialPriority: Array<{ subject: string; weight: number }>;
  routerNote: string;
}

interface RouterState {
  mode: "router";
  routerResult: RouterResultData;
  totalCorrect: number;
  totalQuestions: number;
  examConfig: ExamConfigState;
  answers: Array<{ subject: string; is_correct: boolean; difficulty_elo: number }>;
}

const BAND_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: "forte" | "competitivo" | "intermediario" | "base" }> = {
  forte: { label: "Forte", color: "#14532d", bgColor: "#ecfdf5", borderColor: "#6ee7b7", icon: "forte" },
  competitivo: { label: "Competitivo", color: "#166534", bgColor: "#f0fdf4", borderColor: "#bbf7d0", icon: "competitivo" },
  intermediario: { label: "Intermediário", color: "#a16207", bgColor: "#fefce8", borderColor: "#fef08a", icon: "intermediario" },
  base: { label: "Base", color: "#9a3412", bgColor: "#fff7ed", borderColor: "#fed7aa", icon: "base" },
};

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
  if (elo >= 1350) return "bg-green-500";
  if (elo >= 1200) return "bg-yellow-500";
  if (elo >= 1050) return "bg-orange-500";
  return "bg-red-500";
}

// ─── Component ───────────────────────────────────────────────────────────────

const DiagnosticResults = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DiagnosticState | null>(null);
  const [routerData, setRouterData] = useState<RouterState | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);

  useEffect(() => {
    const state = location.state as (DiagnosticState & { mode?: string; routerResult?: RouterResultData }) | null;

    if (state?.mode === "router" && state?.routerResult) {
      setRouterData(state as unknown as RouterState);
      setLoading(false);
      return;
    }

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

  // Generate plan handler for router mode
  const handleRouterGeneratePlan = async () => {
    if (!user || !routerData) return;
    setGeneratingPlan(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, education_goal, desired_course, exam_date, hours_per_day, study_days")
        .eq("id", user.id)
        .single();
      const userProfile = profile || {};

      const rr = routerData.routerResult;
      const proficiencyScores = {
        proficiency: rr.initialPriority.map((p) => ({
          subject: p.subject,
          subtopic: p.subject,
          score: Math.max(0, 1 - p.weight),
          confidence: routerData.totalQuestions >= 9 ? 0.3 : 0.2,
        })),
        overall_readiness: routerData.totalCorrect / routerData.totalQuestions,
        priority_areas: rr.bottlenecks,
        summary: `Router diagnóstico — Faixa: ${rr.placementBand}. Forças: ${rr.strengths.join(", ")}. Gargalos: ${rr.bottlenecks.join(", ")}.`,
      };

      const { data: plan, error: invokeError } = await supabase.functions.invoke("generate-study-plan", {
        body: { proficiencyScores, userProfile },
      });
      if (invokeError) throw new Error(invokeError.message);
      if (plan?.error) throw new Error(plan.error);

      await supabase.from("daily_missions").delete().eq("user_id", user.id);
      await supabase.from("study_plans").delete().eq("user_id", user.id);

      const { data: savedPlan, error: planError } = await supabase
        .from("study_plans")
        .insert({ user_id: user.id, week_number: 1, start_date: new Date().toISOString().split("T")[0], plan_json: plan, is_current: true, version: 1 })
        .select("id")
        .single();
      if (planError) throw new Error(planError.message);

      const dayNames: Record<string, number> = { Domingo: 0, Segunda: 1, Terca: 2, Quarta: 3, Quinta: 4, Sexta: 5, Sabado: 6 };
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
    } catch (err) {
      console.error(err);
      setGeneratingPlan(false);
    }
  };

  if (loading) {
    return (<div className="min-h-screen bg-white flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>);
  }

  // ─── Router results view ────────────────────────────────────────────────────
  if (routerData) {
    const { routerResult, totalCorrect, totalQuestions, examConfig } = routerData;
    const bandCfg = BAND_CONFIG[routerResult.placementBand];

    return (
      <div className="min-h-screen bg-white pb-20">
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
          <div className="container mx-auto flex h-14 items-center px-4 max-w-3xl">
            <span className="text-base font-semibold text-foreground">Seu Ponto de Partida</span>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
          {/* Title */}
          <div className="text-center animate-fade-in">
            <h1 className="text-xl font-bold text-foreground">
              {examConfig.exam_name} — {examConfig.course_name}
            </h1>
          </div>

          {/* Acertos */}
          <div className="p-4 bg-card rounded-xl shadow-rest text-center animate-fade-in" style={{ animationDelay: "0.05s" }}>
            <span className="text-sm font-medium text-muted-foreground">Diagnóstico rápido</span>
            <p className="text-2xl font-bold text-foreground mt-1">
              {totalCorrect} de {totalQuestions} acertos
            </p>
          </div>

          {/* Placement band */}
          <div
            className="p-5 rounded-xl border-2 animate-fade-in"
            style={{ backgroundColor: bandCfg.bgColor, borderColor: bandCfg.borderColor, animationDelay: "0.1s" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-5 w-5" style={{ color: bandCfg.color }} />
              <span className="text-sm font-semibold" style={{ color: bandCfg.color }}>
                Sua faixa inicial
              </span>
            </div>
            <p className="text-2xl font-bold" style={{ color: bandCfg.color }}>
              {bandCfg.label}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {routerResult.routerNote}
            </p>
            <span className={`inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              routerResult.placementConfidence === "medium"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-orange-100 text-orange-700"
            }`}>
              Confiança {routerResult.placementConfidence === "medium" ? "média" : "baixa"}
            </span>
          </div>

          {/* Strengths */}
          {routerResult.strengths.length > 0 && (
            <div className="animate-fade-in" style={{ animationDelay: "0.15s" }}>
              <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                Suas forças
              </h2>
              <div className="flex flex-wrap gap-2">
                {routerResult.strengths.map((s) => (
                  <span key={s} className="px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-sm font-medium text-green-700">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Bottlenecks */}
          {routerResult.bottlenecks.length > 0 && (
            <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
              <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                Gargalos para focar
              </h2>
              <div className="flex flex-wrap gap-2">
                {routerResult.bottlenecks.map((s) => (
                  <span key={s} className="px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200 text-sm font-medium text-orange-700">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Priority list */}
          {routerResult.initialPriority.length > 0 && (
            <div className="animate-fade-in" style={{ animationDelay: "0.25s" }}>
              <h2 className="text-base font-semibold text-foreground mb-3">Prioridade de estudo</h2>
              <div className="space-y-2">
                {routerResult.initialPriority.map((p, i) => (
                  <div key={p.subject} className="flex items-center gap-3 p-3 bg-card rounded-lg border border-gray-100">
                    <span className="text-sm font-bold text-muted-foreground w-6">{i + 1}.</span>
                    <span className="text-sm font-medium text-foreground flex-1">{p.subject}</span>
                    <div className="h-1.5 w-16 bg-muted rounded-full">
                      <div
                        className="h-1.5 rounded-full bg-primary"
                        style={{ width: `${Math.min(100, p.weight * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <button
              onClick={handleRouterGeneratePlan}
              disabled={generatingPlan}
              className="w-full h-12 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-60"
            >
              {generatingPlan ? "Montando seu plano..." : "Ver meu plano de 7 dias"}
              <ChevronRight className="ml-1 h-4 w-4" />
            </button>
          </div>
        </main>

        <BottomNav />
      </div>
    );
  }

  // ─── Deep mode: no data fallback ────────────────────────────────────────────
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

  const { proficiencies, estimatedScore, cutoff, gap, probBand, priorities, totalCorrect, totalQuestions, examConfig, blendInfo } = data;
  const phase2Subjects = examConfig.phase2_subjects || [];
  const phase2Set = new Set(phase2Subjects);
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

        {/* Acertos no diagnóstico — shown first */}
        <div className="p-4 bg-card rounded-xl shadow-rest text-center animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <span className="text-sm font-medium text-muted-foreground">Acertos no diagnóstico</span>
          <p className="text-2xl font-bold text-foreground mt-1">
            Você acertou {totalCorrect} de {totalQuestions} questões
          </p>
        </div>

        {/* Explanatory bridge */}
        <p className="text-xs text-center text-muted-foreground animate-fade-in" style={{ animationDelay: "0.08s" }}>
          Com base nos seus acertos e na dificuldade de cada questão, estimamos sua nota na prova real de {examConfig.total_questions} questões
        </p>

        {/* Score + Cutoff Cards */}
        <div className="grid grid-cols-2 gap-3 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="p-5 bg-card rounded-xl shadow-rest text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Nota estimada na prova</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{estimatedScore}</p>
            <p className="text-xs text-muted-foreground">
              {blendInfo
                ? `Baseada em ${blendInfo.accuracyPct}% de acerto + ajuste por dificuldade`
                : `Se você fizesse a ${examConfig.exam_name} hoje, estimamos esta nota`}
            </p>
            {blendInfo && (
              <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                blendInfo.confidenceLabel === "baixa" ? "bg-orange-100 text-orange-700" :
                blendInfo.confidenceLabel === "média" ? "bg-yellow-100 text-yellow-700" :
                "bg-green-100 text-green-700"
              }`}>
                Confiança {blendInfo.confidenceLabel}
              </span>
            )}
          </div>
          <div className="p-5 bg-card rounded-xl shadow-rest text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Award className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Nota de corte</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{cutoff}</p>
            <p className="text-[10px] text-muted-foreground mb-1">{examConfig.course_name}</p>
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
            animationDelay: "0.15s",
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

        {/* Foco para 2ª fase */}
        {phase2Subjects.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: "0.23s" }}>
            <h2 className="text-base font-semibold text-foreground mb-4">Foco para 2ª Fase</h2>
            <div className="space-y-2">
              {phase2Subjects.map((subject) => {
                const prof = proficiencies[subject];
                if (!prof) return null;
                const isLow = prof.elo < 1200;
                return (
                  <div key={subject} className={`flex items-center gap-3 p-3 rounded-lg border ${
                    isLow ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
                  }`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{subject}</span>
                        <span className="text-xs font-mono text-muted-foreground">Elo {prof.elo}</span>
                      </div>
                      <p className={`text-xs font-medium mt-0.5 ${isLow ? "text-red-700" : "text-green-700"}`}>
                        {isLow ? "URGENTE — essencial para 2ª fase" : "Manter — essencial para 2ª fase"}
                      </p>
                    </div>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ color: prof.level.color, backgroundColor: `${prof.level.color}15` }}
                    >
                      {prof.level.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Priority areas */}
        {priorities.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: "0.25s" }}>
            <h2 className="text-base font-semibold text-foreground mb-4">Áreas Prioritárias</h2>
            <div className="space-y-2">
              {priorities.map((area, i) => {
                const isPhase2 = area.isPhase2;
                const isLow = area.elo < 1200;
                const urgencyLabel = isPhase2 && isLow
                  ? "URGENTE — essencial para 2ª fase"
                  : isPhase2
                    ? "Manter — essencial para 2ª fase"
                    : isLow
                      ? "Prioritário — impacta 1ª fase"
                      : "";
                return (
                  <div key={area.subject} className={`flex items-center gap-3 p-3 rounded-lg border ${
                    isPhase2 ? "bg-primary/5 border-primary/15" : "bg-destructive/5 border-destructive/10"
                  }`}>
                    <span className={`text-sm font-bold ${isPhase2 ? "text-primary" : "text-destructive"}`}>{i + 1}.</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{area.subject}</p>
                        {isPhase2 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            2ª fase
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Elo {area.elo} — {area.level.label}
                      </p>
                      {urgencyLabel && (
                        <p className={`text-[10px] font-semibold mt-0.5 ${
                          isPhase2 && isLow ? "text-red-600" : isPhase2 ? "text-green-600" : "text-orange-600"
                        }`}>
                          {urgencyLabel}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
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
                K=16 até 30, K=8 depois). Matérias com poucas questões no diagnóstico (≤3) recebem
                fator K ampliado (×1.5) para compensar a amostra menor.
              </p>
              <p>
                <strong>Nota estimada:</strong> Combinamos duas estimativas: (1) projeção direta da sua taxa de
                acerto real no diagnóstico e (2) projeção via Elo por matéria usando grade discreta de dificuldades.
                No diagnóstico, o peso da taxa real é 75% e do Elo 25%. Conforme você responde mais questões,
                o peso do Elo aumenta progressivamente.
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
