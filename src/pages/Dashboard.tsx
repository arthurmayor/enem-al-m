import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Clock, ChevronRight, ChevronDown, ArrowRight, Target, RefreshCw, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";
import { trackEvent } from "@/lib/trackEvent";
import { MISSION_TYPE_LABELS, MISSION_STATUSES, PLAN_STATUSES } from "@/lib/constants";
import { deduplicateProficiencies, diagnosticToProfArray, buildPlannerInput } from "@/lib/plannerInput";

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

const missionTypeLabels = MISSION_TYPE_LABELS;

const Dashboard = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegenCta, setShowRegenCta] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [completionRate, setCompletionRate] = useState(0);
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
        .select("id, subject, subtopic, mission_type, status, date, estimated_minutes")
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
        .select("name, education_goal, exam_date, onboarding_complete, total_xp, current_streak")
        .eq("id", user.id)
        .single();
      if (profileData) setProfile(profileData);

      trackEvent("dashboard_loaded", {}, user.id);

      const today = new Date().toISOString().split("T")[0];
      const { data: missionsData } = await supabase
        .from("daily_missions")
        .select("id, subject, subtopic, mission_type, status, date, estimated_minutes")
        .eq("user_id", user.id)
        .eq("date", today);
      if (missionsData) setMissions(missionsData);
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

  const daysUntilExam = profile?.exam_date
    ? Math.max(0, Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86400000))
    : null;

  const firstName = profile?.name?.split(" ")[0] || "Estudante";
  const completedMissionsList = missions.filter((m) => m.status === MISSION_STATUSES.COMPLETED);
  const completedMissions = completedMissionsList.length;
  const pendingMissions = missions.filter((m) => m.status !== MISSION_STATUSES.COMPLETED);
  const hasMissions = missions.length > 0;
  const allDone = hasMissions && pendingMissions.length === 0;
  const needsDiagnostic = !profile?.onboarding_complete;
  const [showCompleted, setShowCompleted] = useState(false);

  // Estimate total study time for today (use real estimated_minutes when available)
  const totalMinutesToday = missions.reduce((s, m) => s + (m.estimated_minutes || 15), 0);
  const completedMinutesToday = missions
    .filter((m) => m.status === MISSION_STATUSES.COMPLETED)
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
              : allDone
                ? "Sessão do dia completa. Volte amanhã."
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

            {/* ─── All done state ─── */}
            {allDone && (
              <div className="bg-white rounded-2xl shadow-rest p-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-foreground mx-auto mb-3" />
                <h3 className="text-[15px] font-semibold text-foreground">Sessão do dia completa!</h3>
                <p className="text-[13px] text-muted-foreground mt-1">Bom trabalho. Descanse e volte amanhã.</p>
              </div>
            )}

            {/* ─── Next pending mission (highlighted) ─── */}
            {pendingMissions.length > 0 && (
              <Link
                to={`/mission/${pendingMissions[0].mission_type}/${pendingMissions[0].id}`}
                className="block bg-foreground rounded-2xl p-5 shadow-rest hover:bg-foreground/90 transition-colors mb-3"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">Próxima</p>
                    <p className="text-[15px] font-semibold text-white mt-1 truncate">
                      {pendingMissions[0].subject} — {missionTypeLabels[pendingMissions[0].mission_type] || pendingMissions[0].mission_type}
                    </p>
                    <p className="text-[12px] text-white/70 mt-0.5 truncate">{pendingMissions[0].subtopic}</p>
                  </div>
                  <div className="flex items-center gap-1 text-white/70 shrink-0 ml-3">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">{pendingMissions[0].estimated_minutes || 15} min</span>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 mt-4 text-white text-[14px] font-semibold">
                  Continuar estudo
                  <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            )}

            {/* ─── Remaining pending missions ─── */}
            {pendingMissions.length > 1 && (
              <div className="bg-white rounded-2xl shadow-rest overflow-hidden">
                {pendingMissions.slice(1).map((mission, i) => (
                  <Link
                    key={mission.id}
                    to={`/mission/${mission.mission_type}/${mission.id}`}
                    className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50 ${i > 0 ? "border-t border-gray-50" : ""}`}
                  >
                    <div className="h-2 w-2 rounded-full shrink-0 bg-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-foreground truncate">
                        {mission.subject} — {missionTypeLabels[mission.mission_type] || mission.mission_type}
                      </p>
                      <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{mission.subtopic}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" />
                      {mission.estimated_minutes || 15} min
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* ─── Collapsible completed missions ─── */}
            {completedMissions > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCompleted ? "" : "-rotate-90"}`} />
                  Concluídas ({completedMissions})
                </button>
                {showCompleted && (
                  <div className="mt-2 bg-white rounded-2xl shadow-rest overflow-hidden">
                    {completedMissionsList.map((mission, i) => (
                      <div
                        key={mission.id}
                        className={`flex items-center gap-4 px-5 py-3 opacity-60 ${i > 0 ? "border-t border-gray-50" : ""}`}
                      >
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-foreground truncate">
                            {mission.subject} — {missionTypeLabels[mission.mission_type] || mission.mission_type}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[12px] text-muted-foreground mt-2">
                  {completedMinutesToday} de {totalMinutesToday} min concluídos
                </p>
              </div>
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

        {/* ─── Regeneration CTA ─────────────────────────────────────── */}
        {showRegenCta && !regenerating && (
          <div className="mt-6 animate-fade-in" style={{ animationDelay: "0.14s" }}>
            <div className="bg-white rounded-2xl p-5 shadow-rest border border-gray-100">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                  <RefreshCw className="h-5 w-5 text-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-semibold text-foreground">
                    Você completou {completionRate}% do plano!
                  </h3>
                  <p className="text-[13px] text-muted-foreground mt-1">
                    Quer gerar a próxima semana com base no seu progresso?
                  </p>
                  <button
                    onClick={() => user && regeneratePlan(user.id)}
                    className="mt-3 px-5 py-2 rounded-full bg-foreground text-white text-[13px] font-semibold hover:bg-foreground/90 transition-all"
                  >
                    Gerar próxima semana
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {regenerating && (
          <div className="mt-6 animate-fade-in">
            <div className="bg-white rounded-2xl p-5 shadow-rest flex items-center gap-3">
              <div className="h-5 w-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
              <p className="text-[14px] text-foreground">Gerando novo plano semanal...</p>
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
