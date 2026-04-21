import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, ArrowRight, BookOpen, Clock } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { setOnboardingCache } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/trackEvent";
import { expectedAccuracy } from "@/lib/scoring";
import { MISSION_STATUSES, PLAN_STATUSES } from "@/lib/constants";
import SubjectBadge from "@/components/ui/SubjectBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import { getSubjectColor } from "@/lib/subjectColors";

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
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name, education_goal, desired_course, exam_date, hours_per_day, study_days, available_days, self_declared_blocks")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    console.error("[generateAndSavePlan] profile fetch failed", profileError);
    throw new Error(`Falha ao carregar perfil: ${profileError.message}`);
  }
  if (!profile) {
    // No profile row exists — downstream FKs would all fail silently.
    // Fall back to a minimal row so the plan/mission writes can succeed.
    const { error: createProfileError } = await supabase
      .from("profiles")
      .upsert({ id: userId, onboarding_complete: true } as any, { onConflict: "id" });
    if (createProfileError) {
      console.error("[generateAndSavePlan] could not create missing profile row", createProfileError);
      throw new Error(`Perfil não encontrado: ${createProfileError.message}`);
    }
  }
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
  if (invokeError) {
    console.error("[generateAndSavePlan] edge function invoke failed", invokeError);
    throw new Error(`Falha ao gerar plano (edge): ${invokeError.message}`);
  }
  if (plan?.error) {
    console.error("[generateAndSavePlan] edge function returned error", plan.error);
    throw new Error(`Falha ao gerar plano: ${plan.error}`);
  }
  if (!plan || !Array.isArray(plan.weeks) || plan.weeks.length === 0) {
    console.error("[generateAndSavePlan] edge function returned empty plan", plan);
    throw new Error("O gerador retornou um plano vazio.");
  }

  // Supersede existing active plan (if any) instead of deleting
  const { data: existingPlan, error: existingPlanError } = await supabase
    .from("study_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("is_current", true)
    .limit(1);
  if (existingPlanError) {
    console.error("[generateAndSavePlan] existing plan lookup failed", existingPlanError);
    throw new Error(`Falha ao verificar plano atual: ${existingPlanError.message}`);
  }
  if (existingPlan && existingPlan.length > 0) {
    const { error: supersedePlanError } = await supabase.from("study_plans")
      .update({ status: PLAN_STATUSES.SUPERSEDED, is_current: false } as any)
      .eq("user_id", userId)
      .eq("is_current", true);
    if (supersedePlanError) {
      console.error("[generateAndSavePlan] superseding old plan failed", supersedePlanError);
      throw new Error(`Falha ao substituir plano anterior: ${supersedePlanError.message}`);
    }
    // Supersede old pending missions (preserve history)
    const { error: supersedeMissionsError } = await supabase.from("daily_missions")
      .update({ status: MISSION_STATUSES.SUPERSEDED } as any)
      .eq("user_id", userId)
      .eq("status", MISSION_STATUSES.PENDING);
    if (supersedeMissionsError) {
      console.error("[generateAndSavePlan] superseding old missions failed", supersedeMissionsError);
      throw new Error(`Falha ao substituir missões anteriores: ${supersedeMissionsError.message}`);
    }
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
  if (planError || !savedPlan?.id) {
    console.error("[generateAndSavePlan] study_plans insert failed", planError);
    throw new Error(`Falha ao salvar plano: ${planError?.message ?? "sem id retornado"}`);
  }

  const dayNames: Record<string, number> = {
    Domingo: 0, Segunda: 1, Terca: 2, Quarta: 3, Quinta: 4, Sexta: 5, Sabado: 6,
  };
  // Schedule starting today so the dashboard shows missions on the same day
  // the diagnostic is completed (if today's weekday is covered by the plan).
  const start = new Date();
  start.setHours(0, 0, 0, 0);
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

  if (missionsToInsert.length === 0) {
    console.error("[generateAndSavePlan] plan returned no missions to insert", plan);
    throw new Error("O plano gerado não contém missões.");
  }

  const { data: insertedMissions, error: missionsInsertError } = await supabase
    .from("daily_missions")
    .insert(missionsToInsert)
    .select("id");
  if (missionsInsertError) {
    console.error("[generateAndSavePlan] daily_missions insert failed", missionsInsertError, {
      sample: missionsToInsert[0],
      count: missionsToInsert.length,
    });
    throw new Error(`Falha ao salvar missões: ${missionsInsertError.message}`);
  }
  if (!insertedMissions || insertedMissions.length === 0) {
    console.error("[generateAndSavePlan] daily_missions insert returned no rows", {
      sample: missionsToInsert[0],
      count: missionsToInsert.length,
    });
    throw new Error("Missões não foram criadas (verifique as políticas de acesso).");
  }

  // Ensure the profile is flagged as onboarded and refresh the ProtectedRoute
  // cache, otherwise the route guard would redirect /dashboard back to
  // /onboarding using a stale cached value.
  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({ onboarding_complete: true } as any)
    .eq("id", userId);
  if (profileUpdateError) {
    // Non-fatal — the cache below lets the user through for this session
    console.warn("[generateAndSavePlan] profile onboarding flag update failed", profileUpdateError);
  }
  setOnboardingCache(userId, true);

  trackEvent("plan_generated", { missions: insertedMissions.length }, userId);
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
  const [barsLoaded, setBarsLoaded] = useState(false);

  // Animate progress bars after mount
  useEffect(() => {
    const t = setTimeout(() => setBarsLoaded(true), 300);
    return () => clearTimeout(t);
  }, []);

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
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Não foi possível gerar o plano: ${message}`);
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
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Não foi possível gerar o plano: ${message}`);
      setGeneratingPlan(false);
    }
  };

  // ─── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-ink-strong border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── No data ─────────────────────────────────────────────────────────
  if (!routerData && !data?.proficiencies) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-ink-soft">Nenhum resultado encontrado.</p>
          <Link to="/diagnostic/intro" className="mt-4 inline-block text-ink-strong font-semibold underline underline-offset-4">
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

  // Derive weakest subject for insight card
  const weakestSubject = data
    ? Object.entries(data.proficiencies)
        .sort((a, b) => a[1].elo - b[1].elo)[0]
    : routerData
      ? routerData.routerResult.bottlenecks[0]
      : null;
  const weakestName = Array.isArray(weakestSubject) ? weakestSubject[0] : (weakestSubject || "");

  return (
    <div className="min-h-screen bg-bg-app pb-24">
      <div className="max-w-3xl mx-auto p-4 pt-8">
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div className="text-center mb-2 animate-fade-in">
          <p className="text-xs font-medium text-ink-muted uppercase tracking-widest mb-4">
            {examConfig.exam_name} — {examConfig.course_name}
          </p>
          <h1 className="text-2xl font-bold text-ink-strong">Resultado do diagnóstico</h1>
        </div>
        <p className="text-sm text-ink-soft text-center mb-8 animate-fade-in">
          Veja seu desempenho por matéria
        </p>

        {/* ─── Subject grid (deep mode) ───────────────────────────────── */}
        {sortedSubjects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
            {sortedSubjects.map(([subject, prof]) => {
              const isPhase2 = phase2Set.has(subject);
              const dist = subjectDist[subject];
              const accuracy = dist
                ? Math.round(expectedAccuracy(prof.elo, dist.meanDiff, dist.sdDiff) * 100)
                : Math.round((prof.correct / Math.max(1, prof.total)) * 100);

              return (
                <div
                  key={subject}
                  className="bg-bg-card rounded-card p-4 border border-line-light shadow-card"
                  style={{ borderTopWidth: "3px", borderTopColor: getSubjectColor(subject) }}
                >
                  <SubjectBadge subject={subject} />
                  {isPhase2 && (
                    <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-100 text-brand-500">
                      2a fase
                    </span>
                  )}
                  <p className="text-2xl font-bold text-ink-strong mt-2">
                    {barsLoaded ? accuracy : 0}%
                  </p>
                  <div className="mt-2">
                    <ProgressBar value={barsLoaded ? accuracy : 0} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Router mode: bottleneck list ───────────────────────────── */}
        {!data && routerData && (
          <div className="space-y-3 animate-fade-in">
            {bottlenecks.map((subject) => (
              <div
                key={subject}
                className="bg-bg-card rounded-card p-4 border border-line-light shadow-card flex items-center justify-between"
                style={{ borderLeftWidth: "3px", borderLeftColor: getSubjectColor(subject) }}
              >
                <SubjectBadge subject={subject} />
                <span className="text-xs text-ink-muted">Reforçar primeiro</span>
              </div>
            ))}
          </div>
        )}

        {/* ─── Weakest subject insight ────────────────────────────────── */}
        {weakestName && (
          <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card mt-6 animate-fade-in">
            <p className="text-sm text-ink">
              Sua maior alavanca é <strong className="text-ink-strong">{weakestName}</strong>. Foque nessa matéria para o maior impacto no seu resultado.
            </p>
          </div>
        )}

        {/* ─── Resumo do diagnóstico ──────────────────────────────────── */}
        <div className="mt-6 animate-fade-in">
          <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card space-y-3.5">
            <div className="flex items-start gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-signal-ok mt-2 shrink-0" />
              <p className="text-sm text-ink leading-relaxed">
                <span className="font-medium text-ink-strong">Melhor desempenho:</span>{" "}
                <span className="text-ink-soft">{humanizeStrengths(strengths)}</span>
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-signal-error mt-2 shrink-0" />
              <p className="text-sm text-ink leading-relaxed">
                <span className="font-medium text-ink-strong">Reforçar primeiro:</span>{" "}
                <span className="text-ink-soft">{humanizeStrengths(bottlenecks)}</span>
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-line mt-2 shrink-0" />
              <p className="text-sm text-ink-soft leading-relaxed">
                Seu plano vai ficar mais preciso nas próximas sessões
              </p>
            </div>
            {data && (
              <div className="pt-3 border-t border-line-light space-y-2">
                <p className="text-xs text-ink-muted">
                  {totalCorrect} de {totalQuestions} acertos no diagnóstico
                  {data.estimatedScore > 0 && (
                    <> — nota estimada: {data.estimatedScore}/{data.examConfig.total_questions}</>
                  )}
                </p>
                {data.probBand && (
                  <div
                    className="flex items-center gap-2.5 rounded-input px-3 py-2"
                    style={{ backgroundColor: data.probBand.bgColor, border: `1px solid ${data.probBand.borderColor}` }}
                  >
                    <span
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: data.probBand.color }}
                    >
                      {data.probBand.band}
                    </span>
                    <span className="text-xs" style={{ color: data.probBand.color }}>
                      {data.probability < 0.10
                        ? "Posição inicial — muita evolução possível"
                        : data.probability < 0.25
                          ? "Em construção — caminho claro de evolução"
                          : data.probBand.label}
                    </span>
                  </div>
                )}
                <p className="text-[11px] text-ink-muted leading-snug">
                  Estimativa atual com base no diagnóstico. Vai ficando mais precisa com o uso.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── CTA ────────────────────────────────────────────────────── */}
        <div className="text-center mt-8">
          <button
            onClick={handlePlan}
            disabled={generatingPlan}
            className="bg-ink-strong text-white rounded-input px-8 py-4 text-base font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {generatingPlan ? (
              <>
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Gerando plano...
              </>
            ) : (
              <>
                Gerar meu plano de estudos
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>

        <div className="mt-8 mb-4" />
      </div>

      <BottomNav />
    </div>
  );
};

export default DiagnosticResults;
