import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, ArrowRight, BookOpen, Clock } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/trackEvent";
import { expectedAccuracy } from "@/lib/scoring";
import { MISSION_STATUSES, PLAN_STATUSES } from "@/lib/constants";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function humanizeStrengths(subjects: string[]): string {
  if (subjects.length === 0) return "";
  if (subjects.length === 1) return subjects[0];
  return subjects.slice(0, -1).join(", ") + " e " + subjects[subjects.length - 1];
}

// ─── Plan generation (shared logic) ─────────────────────────────────────────

async function generateAndSavePlan(
  userId: string,
  proficiencyScores: Record<string, unknown>,
  diagnosticResult: { placement_band: string; strengths: string[]; bottlenecks: string[] },
  examConfigData: { phase2_subjects: string[]; cutoff_mean: number; competition_ratio: number; subject_distribution: Record<string, unknown>; total_questions: number },
  navigate: (path: string) => void,
  setGenerating: (v: boolean) => void,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, education_goal, desired_course, exam_date, hours_per_day, study_days, available_days, self_declared_blocks")
    .eq("id", userId)
    .single();
  // available_days is the primary source; study_days is the legacy fallback
  const profileData = profile as Record<string, unknown> | null;
  const numDays = Array.isArray(profileData?.available_days)
    ? (profileData.available_days as unknown[]).length
    : Array.isArray(profileData?.study_days)
      ? (profileData.study_days as unknown[]).length
      : typeof profileData?.study_days === "number"
        ? (profileData.study_days as number)
        : 5;
  const userProfile = {
    ...(profile || {}),
    study_days: numDays,
    self_declared_blocks: profileData?.self_declared_blocks || {},
  };

  const { data: plan, error: invokeError } = await supabase.functions.invoke("generate-study-plan", {
    body: { proficiencyScores, userProfile, diagnosticResult, examConfig: examConfigData },
  });
  if (invokeError) throw new Error(invokeError.message);
  if (plan?.error) throw new Error(plan.error);

  // Supersede existing active plan (if any) instead of deleting
  const { data: existingPlan } = await supabase
    .from("study_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("is_current", true)
    .limit(1);
  if (existingPlan && existingPlan.length > 0) {
    await supabase.from("study_plans")
      .update({ status: PLAN_STATUSES.SUPERSEDED, is_current: false } as any)
      .eq("user_id", userId)
      .eq("is_current", true);
    // Supersede old pending missions (preserve history)
    await supabase.from("daily_missions")
      .update({ status: MISSION_STATUSES.SUPERSEDED } as any)
      .eq("user_id", userId)
      .eq("status", MISSION_STATUSES.PENDING);
  }

  const { data: savedPlan, error: planError } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      week_number: 1,
      start_date: new Date().toISOString().split("T")[0],
      plan_json: plan,
      is_current: true,
      version: 1,
    })
    .select("id")
    .single();
  if (planError) throw new Error(planError.message);

  const dayNames: Record<string, number> = {
    Domingo: 0, Segunda: 1, Terca: 2, Quarta: 3, Quinta: 4, Sexta: 5, Sabado: 6,
  };
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + 1);
  const firstOfWeekday: Record<number, Date> = {};
  for (let wd = 0; wd <= 6; wd++) {
    const d = new Date(start);
    while (d.getDay() !== wd) d.setDate(d.getDate() + 1);
    firstOfWeekday[wd] = new Date(d);
  }
  const weekdayCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const missionsToInsert: {
    user_id: string;
    study_plan_id: string;
    date: string;
    subject: string;
    subtopic: string;
    mission_type: string;
    status: string;
    estimated_minutes: number;
  }[] = [];

  for (const week of plan.weeks ?? []) {
    for (const dayObj of week.days ?? []) {
      const targetWeekday = dayNames[dayObj.day] ?? 1;
      const n = weekdayCount[targetWeekday] ?? 0;
      const base = firstOfWeekday[targetWeekday];
      const d = new Date(base);
      d.setDate(d.getDate() + n * 7);
      weekdayCount[targetWeekday] = n + 1;
      const dateStr = d.toISOString().split("T")[0];
      for (const mission of dayObj.missions ?? []) {
        missionsToInsert.push({
          user_id: userId,
          study_plan_id: savedPlan.id,
          date: dateStr,
          subject: mission.subject ?? "Geral",
          subtopic: mission.subtopic ?? "",
          mission_type: mission.type ?? "questions",
          status: MISSION_STATUSES.PENDING,
          estimated_minutes: mission.estimated_minutes ?? 15,
        });
      }
    }
  }

  if (missionsToInsert.length > 0) {
    await supabase.from("daily_missions").insert(missionsToInsert);
  }
  trackEvent("plan_generated", { missions: missionsToInsert.length }, userId);
  navigate("/dashboard");
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
  const [showAllSubjects, setShowAllSubjects] = useState(false);

  useEffect(() => {
    const state = location.state as (DiagnosticState & { mode?: string; routerResult?: RouterResultData }) | null;

    if (state?.mode === "router" && state?.routerResult) {
      setRouterData(state as unknown as RouterState);
      setLoading(false);
      trackEvent("diagnostic_results_viewed", {
        mode: "router",
        placementBand: state.routerResult.placementBand,
        course: state.examConfig?.course_slug,
        exam: state.examConfig?.exam_slug,
      });
      return;
    }

    if (state?.proficiencies && state?.examConfig) {
      setData(state);
      setLoading(false);
      trackEvent("diagnostic_results_viewed", {
        mode: "deep",
        estimatedScore: state.estimatedScore,
        probability: Math.round((state.probability ?? 0) * 100),
        probabilityBand: state.probBand?.band ?? "unknown",
        course: state.examConfig.course_slug,
        exam: state.examConfig.exam_slug,
      });
      return;
    }
    setLoading(false);
  }, [location.state]);

  // ─── Router plan generation ──────────────────────────────────────────
  const handleRouterPlan = async () => {
    if (!user || !routerData) return;
    setGeneratingPlan(true);
    try {
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
        summary: `Diagnóstico rápido — Forças: ${rr.strengths.join(", ")}. Foco: ${rr.bottlenecks.join(", ")}.`,
      };
      const ec = routerData.examConfig;
      await generateAndSavePlan(
        user.id,
        proficiencyScores,
        { placement_band: rr.placementBand, strengths: rr.strengths, bottlenecks: rr.bottlenecks },
        { phase2_subjects: ec.phase2_subjects || [], cutoff_mean: ec.cutoff_mean, competition_ratio: ec.competition_ratio, subject_distribution: ec.subject_distribution, total_questions: ec.total_questions },
        navigate,
        setGeneratingPlan,
      );
    } catch (err) {
      console.error(err);
      setGeneratingPlan(false);
    }
  };

  // ─── Deep plan generation ────────────────────────────────────────────
  const handleDeepPlan = async () => {
    if (!user || !data) return;
    setGeneratingPlan(true);
    try {
      const proficiencyScores = {
        proficiency: Object.entries(data.proficiencies).map(([subject, p]) => ({
          subject,
          subtopic: subject,
          score: Math.min(1, Math.max(0, (p.elo - 600) / 1200)),
          confidence: Math.min(1, p.total / 10),
        })),
        overall_readiness: data.estimatedScore / (data.examConfig.total_questions || 90),
        priority_areas: data.priorities.map((p) => p.subject),
        summary: `Diagnóstico ${data.examConfig.exam_name} - ${data.examConfig.course_name}. Nota estimada: ${data.estimatedScore}/${data.examConfig.total_questions}.`,
      };
      // Derive placement_band from accuracy rate
      const accuracy = data.totalCorrect / data.totalQuestions;
      let band = "intermediario";
      if (accuracy >= 0.75) band = "forte";
      else if (accuracy >= 0.55) band = "competitivo";
      else if (accuracy < 0.3) band = "base";
      const deepStrengths = Object.entries(data.proficiencies)
        .sort((a, b) => b[1].elo - a[1].elo)
        .slice(0, 2)
        .map(([s]) => s);
      const deepBottlenecks = data.priorities.slice(0, 3).map((p) => p.subject);
      const ec = data.examConfig;
      await generateAndSavePlan(
        user.id,
        proficiencyScores,
        { placement_band: band, strengths: deepStrengths, bottlenecks: deepBottlenecks },
        { phase2_subjects: ec.phase2_subjects || [], cutoff_mean: ec.cutoff_mean, competition_ratio: ec.competition_ratio, subject_distribution: ec.subject_distribution, total_questions: ec.total_questions },
        navigate,
        setGeneratingPlan,
      );
    } catch (err) {
      console.error(err);
      setGeneratingPlan(false);
    }
  };

  // ─── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── No data ─────────────────────────────────────────────────────────
  if (!routerData && !data?.proficiencies) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted-foreground">Nenhum resultado encontrado.</p>
          <Link to="/diagnostic/intro" className="mt-4 inline-block text-foreground font-semibold underline underline-offset-4">
            Fazer diagnóstico
          </Link>
        </div>
      </div>
    );
  }

  // ─── Derive display data (works for both modes) ──────────────────────
  const examConfig = routerData?.examConfig || data!.examConfig;
  const strengths = routerData
    ? routerData.routerResult.strengths
    : Object.entries(data!.proficiencies)
        .sort((a, b) => b[1].elo - a[1].elo)
        .slice(0, 2)
        .map(([s]) => s);
  const bottlenecks = routerData
    ? routerData.routerResult.bottlenecks
    : data!.priorities.slice(0, 3).map((p) => p.subject);
  const totalCorrect = routerData?.totalCorrect ?? data!.totalCorrect;
  const totalQuestions = routerData?.totalQuestions ?? data!.totalQuestions;

  const handlePlan = routerData ? handleRouterPlan : handleDeepPlan;

  // Deep mode: subject details for "see all"
  const subjectDist = data?.examConfig.subject_distribution || {};
  const phase2Set = new Set(examConfig.phase2_subjects || []);
  const sortedSubjects = data
    ? Object.entries(data.proficiencies).sort((a, b) => {
        const aP = phase2Set.has(a[0]) ? 0 : 1;
        const bP = phase2Set.has(b[0]) ? 0 : 1;
        if (aP !== bP) return aP - bP;
        return a[1].elo - b[1].elo;
      })
    : [];

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
        </div>
      </header>

      <main className="container mx-auto px-5 max-w-lg">
        {/* ─── Subheader ────────────────────────────────────────────── */}
        <div className="pt-8 pb-1 animate-fade-in">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            {examConfig.exam_name} — {examConfig.course_name}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">Diagnóstico concluído</p>
        </div>

        {/* ─── Hero Card ────────────────────────────────────────────── */}
        <div className="mt-6 bg-white rounded-2xl p-6 shadow-rest animate-fade-in" style={{ animationDelay: "0.06s" }}>
          <h1 className="text-[22px] font-semibold text-foreground leading-snug">
            Seu plano inicial está pronto
          </h1>
          <p className="text-[15px] text-muted-foreground mt-3 leading-relaxed">
            Você começou bem em {humanizeStrengths(strengths)}.
            {bottlenecks.length > 0 && (
              <> Seu foco agora será {humanizeStrengths(bottlenecks)}.</>
            )}
          </p>
          <div className="flex items-center gap-2 mt-4 text-[13px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Sessão de hoje: 25 min</span>
          </div>
          <button
            onClick={handlePlan}
            disabled={generatingPlan}
            className="mt-6 w-full h-12 inline-flex items-center justify-center rounded-xl bg-foreground text-white text-[15px] font-semibold hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-60"
          >
            {generatingPlan ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Gerando plano...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                Ver meu plano
                <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </button>
        </div>

        {/* ─── Foco da semana ───────────────────────────────────────── */}
        <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.12s" }}>
          <h2 className="text-[15px] font-semibold text-foreground mb-3">Foco da semana</h2>
          <div className="space-y-2.5">
            {bottlenecks.slice(0, 3).map((subject) => (
              <div
                key={subject}
                className="flex items-center justify-between bg-white rounded-xl px-4 py-3.5 shadow-rest"
              >
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-foreground" />
                  <span className="text-[14px] font-medium text-foreground">{subject}</span>
                </div>
                <span className="text-xs text-muted-foreground">Reforçar primeiro</span>
              </div>
            ))}
          </div>
          {!showAllSubjects && sortedSubjects.length > 0 && (
            <button
              onClick={() => setShowAllSubjects(true)}
              className="mt-3 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Ver todas as matérias
            </button>
          )}
        </div>

        {/* ─── All subjects (expandable, deep mode) ─────────────────── */}
        {showAllSubjects && sortedSubjects.length > 0 && (
          <div className="mt-4 animate-fade-in">
            <div className="space-y-2">
              {sortedSubjects.map(([subject, prof]) => {
                const isPhase2 = phase2Set.has(subject);
                const dist = subjectDist[subject];
                const accuracy = dist
                  ? Math.round(expectedAccuracy(prof.elo, dist.meanDiff, dist.sdDiff) * 100)
                  : Math.round((prof.correct / Math.max(1, prof.total)) * 100);

                return (
                  <div key={subject} className="bg-white rounded-xl px-4 py-3.5 shadow-rest">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-foreground">{subject}</span>
                        {isPhase2 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-muted-foreground">
                            2a fase
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {accuracy}% estimado
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-foreground/70 transition-all duration-700"
                        style={{ width: `${accuracy}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setShowAllSubjects(false)}
              className="mt-3 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Ocultar detalhes
            </button>
          </div>
        )}

        {/* ─── Resumo do diagnóstico ────────────────────────────────── */}
        <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.18s" }}>
          <h2 className="text-[15px] font-semibold text-foreground mb-3">Resumo do diagnóstico</h2>
          <div className="bg-white rounded-2xl p-5 shadow-rest space-y-3.5">
            <div className="flex items-start gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 mt-2 shrink-0" />
              <p className="text-[14px] text-foreground leading-relaxed">
                <span className="font-medium">Melhor desempenho:</span>{" "}
                <span className="text-muted-foreground">{humanizeStrengths(strengths)}</span>
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />
              <p className="text-[14px] text-foreground leading-relaxed">
                <span className="font-medium">Reforçar primeiro:</span>{" "}
                <span className="text-muted-foreground">{humanizeStrengths(bottlenecks)}</span>
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-gray-300 mt-2 shrink-0" />
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                Seu plano vai ficar mais preciso nas próximas sessões
              </p>
            </div>
            {data && (
              <div className="pt-2 border-t border-gray-50 space-y-2">
                <p className="text-[13px] text-muted-foreground">
                  {totalCorrect} de {totalQuestions} acertos no diagnóstico
                  {data.estimatedScore > 0 && (
                    <> — nota estimada: {data.estimatedScore}/{data.examConfig.total_questions}</>
                  )}
                </p>
                {data.probBand && (
                  <div
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                    style={{ backgroundColor: data.probBand.bgColor, border: `1px solid ${data.probBand.borderColor}` }}
                  >
                    <span
                      className="text-[13px] font-semibold tabular-nums"
                      style={{ color: data.probBand.color }}
                    >
                      {data.probBand.band}
                    </span>
                    <span className="text-[12px]" style={{ color: data.probBand.color }}>
                      {data.probability < 0.10
                        ? "Posição inicial — muita evolução possível"
                        : data.probability < 0.25
                          ? "Em construção — caminho claro de evolução"
                          : data.probBand.label}
                    </span>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground/70 leading-snug">
                  Estimativa atual com base no diagnóstico. Vai ficando mais precisa com o uso.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 mb-4" />
      </main>

      <BottomNav />
    </div>
  );
};

export default DiagnosticResults;
