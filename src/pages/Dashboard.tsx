import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Clock, ChevronDown, ArrowRight, Target, RefreshCw, CheckCircle2, Flame, Zap, FileText, Calendar, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";
import { trackEvent } from "@/lib/trackEvent";
import { MISSION_TYPE_LABELS, MISSION_STATUSES, PLAN_STATUSES } from "@/lib/constants";
import { deduplicateProficiencies, diagnosticToProfArray, buildPlannerInput, calculateBand } from "@/lib/plannerInput";
import ProgressBar from "@/components/ui/ProgressBar";
import SubjectBadge from "@/components/ui/SubjectBadge";
import EmptyState from "@/components/ui/EmptyState";
import { getSubjectColor } from "@/lib/subjectColors";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Profile {
  name: string;
  education_goal: string;
  exam_date: string | null;
  onboarding_complete: boolean;
  total_xp?: number;
  current_streak?: number;
  exam_config_id?: string | null;
}

interface Mission {
  id: string;
  subject: string;
  subtopic: string;
  mission_type: string;
  status: string;
  date: string;
  estimated_minutes?: number;
  mission_order?: number | null;
  score?: number | null;
}

const missionTypeLabels = MISSION_TYPE_LABELS;

/** Formata data YYYY-MM-DD para exibição curta: "22 mar" */
function formatMissionDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
}

/** Converte dias restantes em formato humano com no máximo 2 granularidades.
 *  > 60 dias → "X anos e Y meses" ou "X meses"
 *  32–60 dias → "X meses"
 *  ≤ 31 dias → "X dias"
 */
function formatCountdown(daysRemaining: number): string {
  if (daysRemaining <= 0) return "Prova já ocorreu";
  if (daysRemaining <= 31) {
    return `${daysRemaining} ${daysRemaining === 1 ? "dia" : "dias"}`;
  }
  if (daysRemaining <= 60) {
    const months = Math.floor(daysRemaining / 30);
    return `${months} ${months === 1 ? "mês" : "meses"}`;
  }
  // > 60 dias
  const years = Math.floor(daysRemaining / 365);
  const remainingDays = daysRemaining - years * 365;
  const months = Math.round(remainingDays / 30);
  if (years >= 1) {
    if (months === 0) return `${years} ${years === 1 ? "ano" : "anos"}`;
    return `${years} ${years === 1 ? "ano" : "anos"} e ${months} ${months === 1 ? "mês" : "meses"}`;
  }
  const totalMonths = Math.round(daysRemaining / 30);
  return `${totalMonths} ${totalMonths === 1 ? "mês" : "meses"}`;
}

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegenCta, setShowRegenCta] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [completionRate, setCompletionRate] = useState(0);
  const [weeklySessionsTarget, setWeeklySessionsTarget] = useState(0);
  const [weeklySessionsDone, setWeeklySessionsDone] = useState(0);
  const [weakestSubjects, setWeakestSubjects] = useState<{ subject: string; score: number }[]>([]);
  const [totalAnswered, setTotalAnswered] = useState<number | null>(null);
  const [examName, setExamName] = useState<string | null>(null);
  const [hasActivePlan, setHasActivePlan] = useState<boolean | null>(null);
  const [overdueMissions, setOverdueMissions] = useState<Mission[]>([]);
  const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [monthlyDone, setMonthlyDone] = useState(0);
  const regenChecked = useRef(false);

  // ─── Regeneration helper ──────────────────────────────────────────────────

  async function regeneratePlan(userId: string) {
    setRegenerating(true);
    trackEvent("replan_triggered", {}, userId);
    try {
      // Fetch calibrated proficiencies, profile, and latest plan in parallel
      const [{ data: profRows }, { data: profileData }, { data: latestPlan }, { count: totalAnswered }] = await Promise.all([
        supabase.from("proficiency_scores").select("subject, score, source, measured_at").eq("user_id", userId).order("measured_at", { ascending: false }),
        supabase.from("profiles").select("name, education_goal, desired_course, exam_date, hours_per_day, study_days, available_days, self_declared_blocks, exam_config_id").eq("id", userId).single(),
        supabase.from("study_plans").select("id, week_number, version").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).single(),
        supabase.from("answer_history").select("id", { count: "exact", head: true }).eq("user_id", userId),
      ]);

      // Build profArray from calibrated proficiency_scores (most recent per subject)
      const profMap = deduplicateProficiencies(profRows || []);
      let profArray = Array.from(profMap.entries()).map(([subject, score]) => ({
        subject,
        score,
        confidence: 0.7,
      }));

      // Fallback: if no calibrated proficiencies, use diagnostic_estimates
      let originalBand: string | undefined;
      if (profArray.length === 0) {
        const { data: latestEstimate } = await supabase
          .from("diagnostic_estimates")
          .select("proficiencies, estimate_scope")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        const proficiencies = latestEstimate?.proficiencies || {};
        profArray = diagnosticToProfArray(proficiencies as Record<string, { elo?: number; score?: number }>);
        // Extract originalBand from diagnostic proficiency averages
        if (profArray.length > 0) {
          const avgScore = profArray.reduce((s, p) => s + p.score, 0) / profArray.length;
          originalBand = calculateBand(avgScore);
        }
      }

      // Get exam config
      let examConfigData = { phase2_subjects: [] as string[], cutoff_mean: 0, competition_ratio: 10, subject_distribution: {} as Record<string, unknown>, total_questions: 90 };
      if (profileData?.exam_config_id) {
        const { data: ec } = await supabase.from("exam_configs").select("*").eq("id", profileData.exam_config_id).single();
        if (ec) examConfigData = ec as typeof examConfigData;
      }

      // Build planner input with band recalculation
      const { band, bottlenecks, strengths } = buildPlannerInput(
        profArray,
        totalAnswered || 0,
        originalBand,
      );

      const sd = profileData?.available_days || profileData?.study_days;
      const numDays = Array.isArray(sd) ? sd.length : typeof sd === "number" ? sd : 5;

      const userProfile = {
        ...(profileData || {}),
        study_days: numDays,
        self_declared_blocks: (profileData as Record<string, unknown>)?.self_declared_blocks || {},
      };

      const newWeek = (latestPlan?.week_number || 1) + 1;
      const newVersion = (latestPlan?.version || 1) + 1;

      // Fetch due spaced reviews
      const { data: dueReviews } = await supabase
        .from("spaced_review_queue")
        .select("subject, subtopic")
        .eq("user_id", userId)
        .lte("next_review_at", new Date().toISOString())
        .limit(5);

      // Get completion rate of old plan
      let oldCompletionRate = -1;
      if (latestPlan?.id) {
        const { count: totalM } = await supabase.from("daily_missions").select("id", { count: "exact", head: true }).eq("study_plan_id", latestPlan.id);
        const { count: doneM } = await supabase.from("daily_missions").select("id", { count: "exact", head: true }).eq("study_plan_id", latestPlan.id).eq("status", MISSION_STATUSES.COMPLETED);
        if (totalM && totalM > 0) oldCompletionRate = Math.round(((doneM || 0) / totalM) * 100);
      }

      const { data: plan, error: invokeError } = await supabase.functions.invoke("generate-study-plan", {
        body: {
          proficiencyScores: { proficiency: profArray },
          userProfile,
          diagnosticResult: { placement_band: band, strengths, bottlenecks },
          examConfig: examConfigData,
          weekNumber: newWeek,
          completionRate: oldCompletionRate,
          spacedReviews: dueReviews || [],
        },
      });
      if (invokeError) throw new Error(invokeError.message);
      if (plan?.error) throw new Error(plan.error);

      // Mark old plan as superseded
      await supabase.from("study_plans").update({ status: PLAN_STATUSES.SUPERSEDED, is_current: false } as any).eq("user_id", userId).eq("is_current", true);
      const today = new Date().toISOString().split("T")[0];
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 6);

      const { data: savedPlan, error: planError } = await supabase.from("study_plans").insert({
        user_id: userId,
        week_number: newWeek,
        start_date: today,
        end_date: endDate.toISOString().split("T")[0],
        plan_json: plan,
        is_current: true,
        status: PLAN_STATUSES.ACTIVE,
        version: newVersion,
      } as any).select("id").single();
      if (planError) throw new Error(planError.message);

      // Supersede old pending missions (preserve history, don't touch in_progress)
      await supabase.from("daily_missions")
        .update({ status: MISSION_STATUSES.SUPERSEDED })
        .eq("user_id", userId)
        .gte("date", today)
        .in("status", [MISSION_STATUSES.PENDING]);

      const dayNames: Record<string, number> = { Domingo: 0, Segunda: 1, Terca: 2, Quarta: 3, Quinta: 4, Sexta: 5, Sabado: 6 };
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const missionsToInsert: { user_id: string; study_plan_id: string; date: string; subject: string; subtopic: string; mission_type: string; status: string; estimated_minutes: number }[] = [];

      for (const week of plan.weeks ?? []) {
        for (const dayObj of week.days ?? []) {
          const targetWeekday = dayNames[dayObj.day] ?? 1;
          // Find next occurrence of this weekday from today
          const d = new Date(start);
          while (d.getDay() !== targetWeekday) d.setDate(d.getDate() + 1);
          const dateStr = d.toISOString().split("T")[0];
          for (const mission of dayObj.missions ?? []) {
            missionsToInsert.push({
              user_id: userId,
              study_plan_id: savedPlan!.id,
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

      trackEvent("replan_applied", { week: newWeek, missions: missionsToInsert.length }, userId);

      // Refetch today's missions without full page reload
      const { data: freshMissions } = await supabase
        .from("daily_missions")
        .select("id, subject, subtopic, mission_type, status, date, estimated_minutes, mission_order, score")
        .eq("user_id", userId)
        .eq("date", today)
        .not("status", "eq", MISSION_STATUSES.SUPERSEDED);
      if (freshMissions) setMissions(freshMissions);
      toast.success("Novo plano semanal gerado!");
    } catch (err) {
      console.error("Regeneration error:", err);
      toast.error("Erro ao regenerar plano. Tente novamente.");
    } finally {
      setRegenerating(false);
    }
  }

  // ─── Fetch data + check regeneration ──────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("name, education_goal, exam_date, onboarding_complete, total_xp, current_streak, exam_config_id")
        .eq("id", user.id)
        .single();
      if (profileData) {
        setProfile(profileData);
        // Fetch exam name
        if (profileData.exam_config_id) {
          const { data: ec } = await supabase
            .from("exam_configs")
            .select("exam_name")
            .eq("id", profileData.exam_config_id)
            .single();
          if (ec?.exam_name) setExamName(ec.exam_name);
        }
      }

      trackEvent("dashboard_loaded", {}, user.id);

      const today = new Date().toISOString().split("T")[0];
      const { data: missionsData } = await supabase
        .from("daily_missions")
        .select("id, subject, subtopic, mission_type, status, date, estimated_minutes, mission_order, score")
        .eq("user_id", user.id)
        .eq("date", today);
      if (missionsData) setMissions(missionsData);

      // Fetch real weekly metrics
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStartStr = weekStart.toISOString().split("T")[0];
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split("T")[0];

      // Month range for monthly metrics
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStartStr = monthStart.toISOString().split("T")[0];
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      const monthEndStr = monthEnd.toISOString().split("T")[0];

      const [
        { count: weeklyTarget },
        { count: weeklyDone },
        { count: mTarget },
        { count: mDone },
      ] = await Promise.all([
        supabase.from("daily_missions").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).gte("date", weekStartStr).lte("date", weekEndStr)
          .not("status", "eq", MISSION_STATUSES.SUPERSEDED),
        supabase.from("daily_missions").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).gte("date", weekStartStr).lte("date", weekEndStr)
          .eq("status", MISSION_STATUSES.COMPLETED),
        supabase.from("daily_missions").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).gte("date", monthStartStr).lte("date", monthEndStr)
          .not("status", "eq", MISSION_STATUSES.SUPERSEDED),
        supabase.from("daily_missions").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).gte("date", monthStartStr).lte("date", monthEndStr)
          .eq("status", MISSION_STATUSES.COMPLETED),
      ]);
      setWeeklySessionsTarget(weeklyTarget || 0);
      setWeeklySessionsDone(weeklyDone || 0);
      setMonthlyTarget(mTarget || 0);
      setMonthlyDone(mDone || 0);

      // Fetch proficiency scores for weakest subjects card
      const { data: profRows } = await supabase
        .from("proficiency_scores")
        .select("subject, score, measured_at")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: false });
      if (profRows && profRows.length > 0) {
        const profMap = new Map<string, number>();
        for (const row of profRows) {
          if (!profMap.has(row.subject)) profMap.set(row.subject, row.score);
        }
        const weakest = Array.from(profMap.entries())
          .sort((a, b) => a[1] - b[1])
          .slice(0, 3)
          .map(([subject, score]) => ({ subject, score }));
        setWeakestSubjects(weakest);
      }

      // Fetch total answered questions
      const { count: answeredCount } = await supabase
        .from("answer_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (answeredCount !== null) setTotalAnswered(answeredCount);

      // Check active plan existence + overdue missions (before setLoading)
      const [{ data: planCheck }, { data: overdueData }] = await Promise.all([
        supabase
          .from("study_plans")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_current", true)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("daily_missions")
          .select("id, subject, subtopic, mission_type, status, date, estimated_minutes, mission_order, score")
          .eq("user_id", user.id)
          .lt("date", today)
          .in("status", [MISSION_STATUSES.PENDING, MISSION_STATUSES.IN_PROGRESS]),
      ]);
      setHasActivePlan(planCheck !== null);
      setOverdueMissions(overdueData || []);

      setLoading(false);

      // ─── Idempotent weekly regeneration check ─────────────────
      if (regenChecked.current) return;
      regenChecked.current = true;

      const { data: activePlan } = await supabase
        .from("study_plans")
        .select("id, start_date, end_date, created_at, plan_json, is_current")
        .eq("user_id", user.id)
        .eq("is_current", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!activePlan) return;

      const endDate = (activePlan as any).end_date;
      const startDate = (activePlan as any).start_date;

      // Calculate completion rate for CTA
      const { count: totalMissions } = await supabase.from("daily_missions").select("id", { count: "exact", head: true }).eq("study_plan_id", activePlan.id);
      const { count: completedCount } = await supabase.from("daily_missions").select("id", { count: "exact", head: true }).eq("study_plan_id", activePlan.id).eq("status", MISSION_STATUSES.COMPLETED);
      const rate = totalMissions && totalMissions > 0 ? Math.round(((completedCount || 0) / totalMissions) * 100) : 0;
      setCompletionRate(rate);

      // Check if plan has expired (end_date < today)
      if (endDate && endDate < today) {
        // Idempotent: check if a plan already exists for this week
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
        const weekStartStr = weekStart.toISOString().split("T")[0];

        const { data: existingThisWeek } = await supabase
          .from("study_plans")
          .select("id")
          .eq("user_id", user.id)
          .gte("start_date", weekStartStr)
          .limit(1);

        if (!existingThisWeek || existingThisWeek.length === 0) {
          // Don't regenerate if plan is less than 3 days old
          const createdAt = new Date(activePlan.created_at);
          const daysSinceCreation = (Date.now() - createdAt.getTime()) / 86400000;
          if (daysSinceCreation >= 3) {
            regeneratePlan(user.id);
          }
        }
        return;
      }

      // CTA: plan active and completion >= 70%
      if (startDate && rate >= 70) {
        // Only show if plan has been active for at least 3 days
        const planStart = new Date(startDate);
        const daysSinceStart = (Date.now() - planStart.getTime()) / 86400000;
        if (daysSinceStart >= 3) {
          setShowRegenCta(true);
        }
      }
    };
    fetchData();
  }, [user]);

  const firstName = profile?.name?.split(" ")[0] || "Estudante";

  // Filter missions excluding superseded
  const activeMissions = missions.filter((m) => m.status !== MISSION_STATUSES.SUPERSEDED);
  const completedMissionsList = activeMissions.filter((m) => m.status === MISSION_STATUSES.COMPLETED);
  const pendingMissions = activeMissions
    .filter((m) => m.status === MISSION_STATUSES.PENDING || m.status === MISSION_STATUSES.IN_PROGRESS)
    .sort((a, b) => (a.mission_order ?? 999) - (b.mission_order ?? 999));
  const completedCount = completedMissionsList.length;
  const totalToday = activeMissions.length;
  const hasMissions = totalToday > 0;
  const allDone = hasMissions && pendingMissions.length === 0;
  const needsDiagnostic = !profile?.onboarding_complete;
  const [showCompleted, setShowCompleted] = useState(false);

  const totalMinutesToday = activeMissions.reduce((s, m) => s + (m.estimated_minutes || 15), 0);
  const completedMinutesToday = completedMissionsList.reduce((s, m) => s + (m.estimated_minutes || 15), 0);

  const weeklyPct = weeklySessionsTarget > 0
    ? Math.round((weeklySessionsDone / weeklySessionsTarget) * 100)
    : 0;

  const monthlyPct = monthlyTarget > 0
    ? Math.round((monthlyDone / monthlyTarget) * 100)
    : 0;

  const nextMission = pendingMissions[0] || null;

  const daysUntilExam = profile?.exam_date
    ? Math.max(0, Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86400000))
    : null;

  // Missões atrasadas ordenadas por data (mais antiga primeiro)
  const sortedOverdueMissions = [...overdueMissions].sort((a, b) => a.date.localeCompare(b.date));
  const firstOverdueMission = sortedOverdueMissions[0] ?? null;

  // Subtitle — dinâmico e útil, nunca texto morto
  const subtitle = needsDiagnostic
    ? "Faça o diagnóstico para começar seu plano."
    : allDone
      ? "Sessão do dia completa. Bom trabalho!"
      : pendingMissions.length > 0
        ? `${pendingMissions.length} ${pendingMissions.length === 1 ? "missão" : "missões"} para hoje.`
        : overdueMissions.length > 0
          ? `${overdueMissions.length} ${overdueMissions.length === 1 ? "missão pendente" : "missões pendentes"} de dias anteriores.`
          : hasActivePlan
            ? "Hoje não é um dia planejado de estudo."
            : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-ink-strong border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-app pb-24 md:pb-0">
      {/* ─── Header (full width) ────────────────────────────────── */}
      <header className="mb-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-strong">Olá, {firstName}</h1>
            {subtitle && (
              <p className="text-sm text-ink-soft mt-0.5">{subtitle}</p>
            )}
          </div>
          {daysUntilExam !== null && (
            <div className="inline-flex items-center gap-2.5 bg-bg-card border border-line-light rounded-card px-4 py-2.5 shadow-card shrink-0 self-start">
              <Calendar className="h-4 w-4 text-ink-soft shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-ink-soft font-medium leading-none mb-0.5">
                  Próxima prova
                </p>
                <p className="text-sm leading-tight">
                  <span className="font-semibold text-ink-strong">{examName || "Vestibular"}</span>
                  <span className="text-ink-soft mx-1.5">·</span>
                  <span className="font-medium text-ink-strong">{formatCountdown(daysUntilExam)}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ─── Needs diagnostic CTA ─────────────────────────────── */}
      {needsDiagnostic && (
        <Link
          to="/diagnostic/intro"
          className="block bg-bg-card rounded-card p-6 border border-line-light shadow-card hover:shadow-card-hover transition-shadow animate-fade-in mb-6"
        >
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-bg-app flex items-center justify-center shrink-0">
              <Target className="h-5 w-5 text-ink-strong" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-ink-strong">Comece pelo diagnóstico</h3>
              <p className="text-sm text-ink-soft mt-1 leading-relaxed">
                8 questões rápidas para montar seu plano personalizado
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-ink-soft mt-0.5 shrink-0" />
          </div>
        </Link>
      )}

      {/* ─── 2-column grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ══════ LEFT COLUMN ══════ */}
        <div className="lg:col-span-7 space-y-6">
          {/* ─── Card: Hoje ─────────────────────────────────── */}
          {hasMissions && (
            <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card animate-fade-in">
              <span className="text-xs uppercase tracking-wider text-ink-soft font-medium">Hoje</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold text-ink-strong">
                  {completedCount}/{totalToday} missões
                </span>
              </div>
              <div className="mt-3">
                <ProgressBar
                  value={totalToday > 0 ? (completedCount / totalToday) * 100 : 0}
                  color="#059669"
                />
              </div>
              <p className="text-sm text-ink-soft mt-2">
                {completedMinutesToday} de {totalMinutesToday} min
              </p>
            </div>
          )}

          {/* ─── Card: Próxima Missão ──────────────────────── */}
          {nextMission ? (
            <div
              className="bg-bg-card rounded-card p-5 border border-line-light shadow-card animate-fade-in"
              style={{ borderLeftWidth: "4px", borderLeftColor: getSubjectColor(nextMission.subject) }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <SubjectBadge subject={nextMission.subject} />
                  <p className="text-base text-ink mt-2">{nextMission.subtopic}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-sm text-ink-soft">
                    <span>{missionTypeLabels[nextMission.mission_type] || nextMission.mission_type}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {nextMission.estimated_minutes || 15} min
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate(`/mission/${nextMission.mission_type}/${nextMission.id}`)}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-ink-strong text-white rounded-input px-4 py-2.5 text-sm font-semibold hover:bg-ink-strong/90 transition-colors"
              >
                {nextMission.status === MISSION_STATUSES.IN_PROGRESS ? "Continuar missão" : "Começar missão"} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : hasMissions && allDone ? (
            <EmptyState
              icon={CheckCircle2}
              title="Sessão completa. Bom trabalho!"
              description="Todas as missões de hoje foram concluídas."
            />
          ) : null}

          {/* ─── Remaining pending missions ─────────────────── */}
          {pendingMissions.length > 1 && (
            <div className="bg-bg-card rounded-card border border-line-light shadow-card overflow-hidden animate-fade-in">
              {pendingMissions.slice(1).map((mission, i) => (
                <Link
                  key={mission.id}
                  to={`/mission/${mission.mission_type}/${mission.id}`}
                  className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-bg-app ${i > 0 ? "border-t border-line-light" : ""}`}
                >
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: getSubjectColor(mission.subject) }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {mission.subject} — {missionTypeLabels[mission.mission_type] || mission.mission_type}
                    </p>
                    <p className="text-xs text-ink-soft mt-0.5 truncate">{mission.subtopic}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-ink-soft shrink-0">
                    <Clock className="h-3 w-3" />
                    {mission.estimated_minutes || 15} min
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* ─── Completed missions accordion ──────────────── */}
          {completedCount > 0 && (
            <div className="animate-fade-in">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-ink-strong transition-colors"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showCompleted ? "" : "-rotate-90"}`} />
                Concluídas ({completedCount})
              </button>
              {showCompleted && (
                <div className="mt-2 bg-bg-card rounded-card border border-line-light shadow-card overflow-hidden">
                  {completedMissionsList.map((mission, i) => (
                    <Link
                      key={mission.id}
                      to={`/mission/${mission.mission_type}/${mission.id}`}
                      className={`flex items-center gap-4 px-5 py-3 opacity-60 hover:opacity-80 transition-opacity ${i > 0 ? "border-t border-line-light" : ""}`}
                    >
                      <CheckCircle2 className="h-4 w-4 text-signal-ok shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <SubjectBadge subject={mission.subject} />
                          <span className="text-sm text-ink-soft">
                            {missionTypeLabels[mission.mission_type] || mission.mission_type}
                          </span>
                        </div>
                      </div>
                      {mission.score != null && (
                        <span className="text-sm font-medium text-ink-soft shrink-0">
                          {Math.round(mission.score)}%
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Regeneration CTA ─────────────────────────── */}
          {showRegenCta && !regenerating && (
            <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-bg-app flex items-center justify-center shrink-0">
                  <RefreshCw className="h-5 w-5 text-ink-strong" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-ink-strong">
                    Você completou {completionRate}% do plano!
                  </h3>
                  <p className="text-sm text-ink-soft mt-1">
                    Quer gerar a próxima semana com base no seu progresso?
                  </p>
                  <button
                    onClick={() => user && regeneratePlan(user.id)}
                    className="mt-3 px-5 py-2 rounded-input bg-ink-strong text-white text-sm font-semibold hover:bg-ink-strong/90 transition-colors"
                  >
                    Gerar próxima semana
                  </button>
                </div>
              </div>
            </div>
          )}

          {regenerating && (
            <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card flex items-center gap-3 animate-fade-in">
              <div className="h-5 w-5 border-2 border-ink-strong border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-ink">Gerando novo plano semanal...</p>
            </div>
          )}

          {/* ─── Empty states inteligentes ────────────────────────── */}
          {!needsDiagnostic && !hasMissions && (
            <>
              {/* A) Sem plano ativo */}
              {hasActivePlan === false && (
                <EmptyState
                  icon={Target}
                  title="Você ainda não tem um plano ativo"
                  description="Gere seu plano de estudos personalizado para começar."
                  actionLabel="Gerar plano"
                  onAction={() => navigate("/diagnostic/intro")}
                />
              )}

              {/* C) Plano existe, missões atrasadas de dias anteriores */}
              {hasActivePlan && overdueMissions.length > 0 && (
                <>
                  <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card animate-fade-in">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-xl bg-bg-app flex items-center justify-center shrink-0">
                        <AlertCircle className="h-5 w-5 text-ink-strong" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-ink-strong">
                          {overdueMissions.length} {overdueMissions.length === 1 ? "missão pendente" : "missões pendentes"}
                        </h3>
                        <p className="text-sm text-ink-soft mt-1 leading-relaxed">
                          {overdueMissions.length === 1 ? "Uma missão de um dia anterior" : "Missões de dias anteriores"} ainda não {overdueMissions.length === 1 ? "foi concluída" : "foram concluídas"}.
                        </p>
                        {/* Preview das primeiras 3 missões (ordenadas por data) */}
                        <div className="mt-3 space-y-1.5">
                          {sortedOverdueMissions.slice(0, 3).map((m) => (
                            <div key={m.id} className="flex items-center gap-2">
                              <div
                                className="h-1.5 w-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: getSubjectColor(m.subject) }}
                              />
                              <span className="text-sm text-ink truncate flex-1">
                                {m.subject}
                              </span>
                              <span className="text-xs text-ink-soft shrink-0">
                                {formatMissionDate(m.date)}
                              </span>
                            </div>
                          ))}
                          {overdueMissions.length > 3 && (
                            <button
                              onClick={() => setPendingDrawerOpen(true)}
                              className="text-xs text-brand-500 hover:underline cursor-pointer pl-3.5"
                            >
                              + {overdueMissions.length - 3} mais
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => firstOverdueMission && navigate(`/mission/${firstOverdueMission.mission_type}/${firstOverdueMission.id}`)}
                          className="mt-4 px-5 py-2 rounded-input bg-ink-strong text-white text-sm font-semibold hover:bg-ink-strong/90 transition-colors"
                        >
                          Retomar pendentes
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Drawer: todas as missões pendentes */}
                  <Sheet open={pendingDrawerOpen} onOpenChange={setPendingDrawerOpen}>
                    <SheetContent side="right" className="flex flex-col">
                      <SheetHeader>
                        <SheetTitle>Missões pendentes</SheetTitle>
                      </SheetHeader>
                      <div className="mt-4 flex-1 overflow-y-auto space-y-0.5">
                        {sortedOverdueMissions.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setPendingDrawerOpen(false);
                              navigate(`/mission/${m.mission_type}/${m.id}`);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent text-left transition-colors"
                          >
                            <div
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: getSubjectColor(m.subject) }}
                            />
                            <span className="flex-1 text-sm text-foreground font-medium truncate">{m.subject}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{formatMissionDate(m.date)}</span>
                          </button>
                        ))}
                      </div>
                    </SheetContent>
                  </Sheet>
                </>
              )}

              {/* B) Plano existe, sem missões hoje e sem atraso */}
              {hasActivePlan && overdueMissions.length === 0 && (
                <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card animate-fade-in">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-bg-app flex items-center justify-center shrink-0">
                      <BookOpen className="h-5 w-5 text-ink-soft" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-ink-strong">Hoje não é um dia planejado de estudo</h3>
                      <p className="text-sm text-ink-soft mt-1 leading-relaxed">
                        Seu plano não inclui estudo hoje. Você pode ver o que vem nos próximos dias ou praticar por conta própria.
                      </p>
                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        <button
                          onClick={() => navigate("/study")}
                          className="px-5 py-2 rounded-input bg-ink-strong text-white text-sm font-semibold hover:bg-ink-strong/90 transition-colors"
                        >
                          Ver semana
                        </button>
                        <button
                          onClick={() => navigate("/exams")}
                          className="px-5 py-2 rounded-input bg-bg-app border border-line-light text-sm font-medium text-ink-strong hover:shadow-card transition-shadow"
                        >
                          Praticar por conta
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ══════ RIGHT COLUMN ══════ */}
        <div className="lg:col-span-5 space-y-6">
          {/* ─── Card: Sua Semana ──────────────────────────── */}
          {!needsDiagnostic && (
            <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card animate-fade-in">
              <span className="text-xs uppercase tracking-wider text-ink-soft font-medium">Sua semana</span>
              {weeklySessionsTarget === 0 ? (
                overdueMissions.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-sm text-ink-soft">Sem missões planejadas para esta semana.</p>
                    <p className="text-sm font-medium text-ink-strong mt-1">
                      {overdueMissions.length} {overdueMissions.length === 1 ? "missão pendente" : "missões pendentes"} de semanas anteriores.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-ink-soft mt-2">Nenhuma missão planejada para esta semana.</p>
                )
              ) : (
                <>
                  <p className="text-lg font-semibold text-ink-strong mt-2">
                    {weeklySessionsDone} de {weeklySessionsTarget} missões concluídas
                  </p>
                  <div className="mt-3">
                    <ProgressBar value={weeklyPct} />
                  </div>
                  <p className="text-sm text-ink-soft mt-2">{weeklyPct}% da semana concluída</p>
                  {overdueMissions.length > 0 && (
                    <p className="text-xs text-ink-muted mt-2 border-t border-line-light pt-2">
                      + {overdueMissions.length} {overdueMissions.length === 1 ? "missão pendente" : "missões pendentes"} de semanas anteriores
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─── Card: Seu Mês ─────────────────────────────── */}
          {!needsDiagnostic && monthlyTarget > 0 && (
            <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card animate-fade-in">
              <span className="text-xs uppercase tracking-wider text-ink-soft font-medium">Seu mês</span>
              <p className="text-lg font-semibold text-ink-strong mt-2">
                {monthlyDone} de {monthlyTarget} missões concluídas
              </p>
              <div className="mt-3">
                <ProgressBar value={monthlyPct} />
              </div>
              <p className="text-sm text-ink-soft mt-2">{monthlyPct}% do mês concluído</p>
            </div>
          )}

          {/* ─── Card: Áreas para reforçar (weakest subjects by proficiency) ──── */}
          {weakestSubjects.length > 0 && (
            <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card animate-fade-in">
              <span className="text-xs uppercase tracking-wider text-ink-soft font-medium">Áreas para reforçar</span>
              <p className="text-xs text-ink-muted mt-0.5">Domínio estimado por matéria</p>
              <div className="mt-4 space-y-4">
                {weakestSubjects.map(({ subject, score }) => (
                  <div key={subject} className="flex items-center gap-3">
                    <SubjectBadge subject={subject} />
                    <div className="flex-1">
                      <ProgressBar
                        value={Math.round(score * 100)}
                        color={getSubjectColor(subject)}
                        size="sm"
                      />
                    </div>
                    <span className="text-sm font-medium text-ink-soft w-10 text-right">
                      {Math.round(score * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Card: Seu Progresso (secundário — sem shadow) ─── */}
          {!needsDiagnostic && (
            <div className="bg-bg-card rounded-card p-5 border border-line-light animate-fade-in">
              <span className="text-xs uppercase tracking-wider text-ink-soft font-medium">Seu progresso</span>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-ink-strong">
                  <Flame className="h-5 w-5 text-brand-500" />
                  <span className="text-lg font-semibold">{profile?.current_streak || 0} dias</span>
                </div>
                <div className="h-5 w-px bg-line-light" />
                <div className="flex items-center gap-1.5 text-ink-strong">
                  <Zap className="h-5 w-5 text-brand-500" />
                  <span className="text-lg font-semibold">{profile?.total_xp || 0} XP</span>
                </div>
              </div>
              {totalAnswered !== null && totalAnswered > 0 && (
                <p className="text-sm text-ink-soft mt-1.5">
                  {totalAnswered} {totalAnswered === 1 ? "questão respondida" : "questões respondidas"}
                </p>
              )}
              <div className="border-t border-line-light mt-4 pt-4">
                <button
                  onClick={() => navigate("/exams")}
                  className="w-full flex items-center justify-center gap-2 bg-bg-app border border-line-light rounded-input px-4 py-2.5 text-sm font-medium text-ink-strong hover:shadow-card transition-shadow"
                >
                  <FileText className="h-4 w-4" />
                  Fazer Mini Simulado
                </button>
                <p className="text-xs text-ink-muted text-center mt-1.5">Teste rápido · ~75 min</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Dashboard;
