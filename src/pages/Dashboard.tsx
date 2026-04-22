import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Star,
  Flame,
  Calendar,
  ArrowRight,
  Target,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/trackEvent";
import BottomNav from "@/components/BottomNav";
import SegmentedControl from "@/components/dashboard/SegmentedControl";
import MissionRow from "@/components/dashboard/MissionRow";
import EvolutionChart from "@/components/dashboard/EvolutionChart";
import ProgressRing from "@/components/dashboard/ProgressRing";
import SubjectProficiencyRow from "@/components/dashboard/SubjectProficiencyRow";
import ExamsChart from "@/components/dashboard/ExamsChart";
import Sparkline from "@/components/dashboard/Sparkline";
import AccuracyDonut from "@/components/dashboard/AccuracyDonut";
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import { useAccuracyByPeriod } from "@/hooks/dashboard/useAccuracyByPeriod";
import {
  useQuestionsEvolution,
  type EvolutionPeriod,
} from "@/hooks/dashboard/useQuestionsEvolution";
import { useMissionsQueue } from "@/hooks/dashboard/useMissionsQueue";
import {
  useProficiencyBySubject,
  type ProficiencyPeriod,
} from "@/hooks/dashboard/useProficiencyBySubject";
import { useProficiencySubtopics } from "@/hooks/dashboard/useProficiencySubtopics";
import {
  useExamsEvolution,
  type ExamsPeriod,
  type ExamsType,
} from "@/hooks/dashboard/useExamsEvolution";
import { useAccuracyTrend } from "@/hooks/dashboard/useAccuracyTrend";
import { useQuestionsCumulative } from "@/hooks/dashboard/useQuestionsCumulative";
import { useLatestDiagnostic } from "@/hooks/dashboard/useLatestDiagnostic";
import { useExamHighlights } from "@/hooks/dashboard/useExamHighlights";

function formatSignedPercent(value: number | null | undefined) {
  if (value == null) return null;
  return `${value >= 0 ? "+" : ""}${value}%`;
}

function metricTone(value: number | null | undefined) {
  if (value == null) return "text-muted-foreground";
  if (value > 0) return "text-success";
  if (value < 0) return "text-destructive";
  return "text-muted-foreground";
}

function sparklineStatusText(value: number | null | undefined, emptyText: string) {
  if (value == null) return emptyText;
  return `${value >= 0 ? "+" : ""}${value}%`;
}

function buildReferenceSparkline(value: number | null | undefined, points: number[]) {
  if (value == null) return [] as number[];
  const base = Math.max(6, Math.round(value * 0.45));
  return points.map((point) => Math.min(100, Math.max(0, base + point)));
}

// ─── Period mapping tables ────────────────────────────────────────────────────

const EVO_PERIOD_OPTIONS = ["Semana", "Mês", "6m", "Ano", "Geral"] as const;
type EvoLabel = (typeof EVO_PERIOD_OPTIONS)[number];
const evoPeriodMap: Record<EvoLabel, EvolutionPeriod> = {
  Semana: "week",
  Mês: "month",
  "6m": "6m",
  Ano: "year",
  Geral: "all",
};

const PROF_PERIOD_OPTIONS = ["Geral", "Semana", "Mês", "6m"] as const;
type ProfLabel = (typeof PROF_PERIOD_OPTIONS)[number];
const profPeriodMap: Record<ProfLabel, ProficiencyPeriod> = {
  Geral: "all",
  Semana: "week",
  Mês: "month",
  "6m": "6m",
};

const EXAM_PERIOD_OPTIONS = ["Semana", "Mês", "6m", "Geral"] as const;
type ExamPeriodLabel = (typeof EXAM_PERIOD_OPTIONS)[number];
const examPeriodMap: Record<ExamPeriodLabel, ExamsPeriod> = {
  Semana: "week",
  Mês: "month",
  "6m": "6m",
  Geral: "all",
};

const SIM_FILTER_OPTIONS = ["Todos", "Simulados", "Fuvest"] as const;
type SimFilterLabel = (typeof SIM_FILTER_OPTIONS)[number];
const simTypeMap: Record<SimFilterLabel, ExamsType> = {
  Todos: "all",
  Simulados: "mock",
  Fuvest: "fuvest",
};

// Brand amber used for every proficiency bar (section 6.1).
const PROFICIENCY_BAR_COLOR = "#D97706";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatDate(d: Date): string {
  return capitalize(
    d.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    .replace(".", "");
}

/**
 * The QA seed populates `daily_missions.subtopic` with the literal string
 * "geral" (see scripts/qa-parte2-seed.mjs); a handful of earlier ad-hoc
 * missions stored "" for the same thing. Both are placeholders, not real
 * subtopics — we treat them as absent so the Hero title falls back to
 * the subject name.
 */
function displaySubtopic(subtopic: string | null | undefined): string | null {
  if (!subtopic) return null;
  const trimmed = subtopic.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "geral") return null;
  return trimmed;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [evoLabel, setEvoLabel] = useState<EvoLabel>("Mês");
  const [profLabel, setProfLabel] = useState<ProfLabel>("Geral");
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [simPeriodLabel, setSimPeriodLabel] =
    useState<ExamPeriodLabel>("Mês");
  const [simFilterLabel, setSimFilterLabel] =
    useState<SimFilterLabel>("Todos");

  const handleEvoLabelChange = (value: string) => setEvoLabel(value as EvoLabel);
  const handleProfLabelChange = (value: string) => setProfLabel(value as ProfLabel);
  const handleSimFilterChange = (value: string) => setSimFilterLabel(value as SimFilterLabel);
  const handleSimPeriodChange = (value: string) => setSimPeriodLabel(value as ExamPeriodLabel);

  const evoPeriod = evoPeriodMap[evoLabel];
  const profPeriod = profPeriodMap[profLabel];
  const examPeriod = examPeriodMap[simPeriodLabel];
  const examType = simTypeMap[simFilterLabel];

  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { data: acertoWeek } = useAccuracyByPeriod("week");
  const { data: acertoPeriod } = useAccuracyByPeriod(evoPeriod);
  const { data: evoData } = useQuestionsEvolution(evoPeriod, null);
  const { data: queuedMissions } = useMissionsQueue();
  const { data: proficiency } = useProficiencyBySubject(profPeriod);
  const { data: subtopics, isLoading: subtopicsLoading } =
    useProficiencySubtopics(expandedSubject);
  const { data: examsData } = useExamsEvolution(examPeriod, examType);
  const { data: accuracyTrend } = useAccuracyTrend(7);
  const { data: questionsCumulative } = useQuestionsCumulative(7);
  const { data: latestDiagnostic } = useLatestDiagnostic();
  const { data: examHighlights } = useExamHighlights();

  useEffect(() => {
    if (user) trackEvent("dashboard_viewed", {}, user.id);
  }, [user]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const firstName = metrics?.name?.split(" ")[0] ?? null;
  const today = formatDate(new Date());

  // Unified mission data — `useMissionsQueue` is the single source.
  // `todayTotal`/`todayCompleted` come from the same fetch as the active
  // queue, so the hero ring and the "Suas Missões" list can never diverge.
  const overdueMissions = queuedMissions?.overdueMissions ?? [];
  const todayMissionsOrdered = queuedMissions?.todayMissions ?? [];
  const activeQueue = queuedMissions?.activeQueue ?? [];
  const missionsTodayTotal = queuedMissions?.todayTotal ?? 0;
  const missionsTodayCompleted = queuedMissions?.todayCompleted ?? 0;
  const hasPendingWork = activeQueue.length > 0;
  const hasAnyTodayMissions = missionsTodayTotal > 0;
  const allCompleted =
    hasAnyTodayMissions && missionsTodayCompleted >= missionsTodayTotal;
  const heroMission = activeQueue[0] ?? null;
  const todayPct =
    missionsTodayTotal > 0
      ? Math.round((missionsTodayCompleted / missionsTodayTotal) * 100)
      : 0;

  // Hero counter split (audit bug 10): show the hero's position inside its
  // own cohort (today vs. overdue) and surface the OTHER cohort as a
  // secondary count, so we don't mix atrasadas into "de N hoje".
  const heroIsOverdue = heroMission?.isOverdue ?? false;
  const heroPositionInCohort = heroMission
    ? heroIsOverdue
      ? overdueMissions.findIndex((m) => m.id === heroMission.id) + 1
      : todayMissionsOrdered.findIndex((m) => m.id === heroMission.id) + 1
    : 0;
  const heroCohortTotal = heroIsOverdue
    ? overdueMissions.length
    : missionsTodayTotal;
  const otherCohortCount = heroIsOverdue
    ? missionsTodayTotal
    : overdueMissions.length;

  const totalQuestions = metrics?.total_questions ?? 0;
  const totalCorrect = metrics?.total_correct ?? 0;

  const totalExams = metrics?.total_exams ?? 0;
  const lastExamScore = metrics?.last_exam_score;

  // Approval probability is ALWAYS sourced from the last diagnostic_results
  // row. We do not substitute total_correct/total_questions after N answered
  // questions — that's an accuracy rate, not a probability. The initial
  // estimate keeps its "estimativa inicial" badge until the user has
  // completed at least one simulado (first signal we could use to refine).
  const probabilityPct = latestDiagnostic
    ? Math.round((latestDiagnostic.probability ?? 0) * 100)
    : null;
  const probabilityLabel = latestDiagnostic?.probability_label ?? null;
  const showInitialBadge = probabilityPct != null && totalExams === 0;

  const daysUntilExam = metrics?.days_until_exam ?? null;
  const hasExamConfig = !!metrics?.exam_name;
  const hasActivePlan =
    (metrics?.total_missions_generated ?? 0) > 0 || missionsTodayTotal > 0;

  // Gamification gate (audit bug 3): XP and streak aren't written by any
  // current code path except ExamSession. Until the backend pipeline
  // exists, hide both pills when there's no positive signal to show —
  // displaying "0 XP / 0 dias" perpetually is a placeholder, not data.
  const totalXp = metrics?.total_xp ?? 0;
  const currentStreak = metrics?.current_streak ?? 0;
  const showGamification = totalXp > 0 || currentStreak > 0 || totalExams > 0;

  // Donut + period label for section 4.3
  const periodAccuracyPct = acertoPeriod?.current ?? null;
  const periodErrorPct =
    periodAccuracyPct != null ? 100 - periodAccuracyPct : null;

  // Sparkline series
  const accuracySparkline = accuracyTrend ?? [];
  const questionsSparkline = questionsCumulative ?? [];
  const examsSparkline = (examsData ?? []).map((e) => e.pctAcerto);

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 border-2 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="pb-24 md:pb-0">
      <div className="max-w-[1080px] mx-auto">

        {/* ── 1. Header ─────────────────────────────────────────────────── */}
        <header className="flex items-end justify-between flex-wrap gap-3 mb-5">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[#2C2C2A]">
              Olá, {firstName ?? "Estudante"}.
            </h1>
            <div className="text-[11.5px] font-medium tracking-[0.3px] text-[#888780] uppercase mt-1">
              {today}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {showGamification && (
              <>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-md bg-[#FFF3E6] text-[#854F0B]">
                  <Star className="h-3 w-3 fill-current" />
                  {totalXp} XP
                </span>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-md bg-[#FCEBEB] text-[#A32D2D]">
                  <Flame className="h-3 w-3" />
                  {currentStreak} dias
                </span>
              </>
            )}
            {daysUntilExam != null && hasExamConfig && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-md bg-[#FAECE7] text-[#993C1D]">
                <Calendar className="h-3 w-3" />
                {daysUntilExam} dias para {metrics?.exam_name}
              </span>
            )}
          </div>
        </header>

        {/* ── 2. Hero — Próxima missão ───────────────────────────────────── */}
        <section className="bg-white border border-[#E8E6E1] rounded-[18px] overflow-hidden mb-3 relative">
          {/* coral top ribbon */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-coral" />

          {hasPendingWork && heroMission ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 px-7 pt-8 pb-6 items-center">
                {/* Left: action info */}
                <div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.5px] uppercase text-[#993C1D] bg-[#FAECE7] px-2.5 py-1 rounded-md">
                      <Target className="h-3 w-3" />
                      Próxima missão
                    </span>
                    {heroCohortTotal > 0 && (
                      <span className="text-[12px] text-[#B4B2A9]">
                        {heroPositionInCohort} de {heroCohortTotal}{" "}
                        {heroIsOverdue ? "atrasadas" : "hoje"}
                      </span>
                    )}
                    {otherCohortCount > 0 && (
                      <span className="text-[12px] text-[#B4B2A9]">
                        · +{" "}
                        {heroIsOverdue
                          ? `${otherCohortCount} hoje`
                          : `${otherCohortCount} atrasada${otherCohortCount > 1 ? "s" : ""}`}
                      </span>
                    )}
                  </div>

                  <h2 className="text-[28px] md:text-[32px] font-bold tracking-[-0.6px] leading-tight mb-2 text-[#2C2C2A]">
                    {displaySubtopic(heroMission.subtopic) ?? heroMission.subject}
                  </h2>
                  <p className="text-[14px] text-[#888780] mb-5 max-w-[440px] leading-[1.45]">
                    {heroMission.subject}
                    {heroMission.question_ids?.length
                      ? ` · ${heroMission.question_ids.length} questões`
                      : heroMission.estimated_minutes
                        ? ` · ~${heroMission.estimated_minutes} min`
                        : ""}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/mission/${heroMission.mission_type}/${heroMission.id}`,
                      )
                    }
                    className="inline-flex items-center gap-1.5 bg-coral text-white border-none px-5 py-2.5 rounded-[10px] text-[14px] font-semibold cursor-pointer hover:brightness-110 transition-all shadow-sm"
                  >
                    Iniciar agora <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Right: ring */}
                <div className="hidden md:flex flex-col items-center pl-6 border-l border-[#EFECE6]">
                  <ProgressRing
                    percentage={todayPct}
                    size={104}
                    strokeWidth={9}
                    color="#D85A30"
                    label={`${missionsTodayCompleted}/${missionsTodayTotal}`}
                    sublabel="hoje"
                  />
                  <div className="text-[11px] text-[#888780] mt-2 uppercase tracking-[0.4px] font-semibold">
                    Missões hoje
                  </div>
                </div>
              </div>

              {/* Queue preview strip */}
              {activeQueue.length > 1 && (
                <div className="border-t border-[#EFECE6] bg-[#F7F6F3] px-7 py-3 flex items-center gap-4 flex-wrap text-[12px] text-[#888780]">
                  <span className="font-semibold text-[#2C2C2A] tracking-[0.2px]">
                    Depois:
                  </span>
                  {activeQueue.slice(1, 5).map((m) => {
                    const st = displaySubtopic(m.subtopic);
                    return (
                      <span key={m.id} className="flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: m.isOverdue ? "#B45309" : "#888780",
                          }}
                        />
                        <span className="text-[#2C2C2A]">
                          {m.subject}
                          {st ? ` · ${st}` : ""}
                          {m.isOverdue ? " · atrasada" : ""}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </>
          ) : allCompleted ? (
            <div className="px-7 py-8 flex items-center gap-4">
              <CheckCircle2 className="h-8 w-8 text-[#1D9E75] shrink-0" />
              <div>
                <div className="text-[18px] font-semibold text-[#2C2C2A]">
                  Sessão do dia completa!
                </div>
                <div className="text-[13px] text-[#888780] mt-0.5">
                  Todas as missões de hoje foram concluídas. Bom trabalho!
                </div>
              </div>
              <ProgressRing
                percentage={100}
                size={80}
                strokeWidth={8}
                color="#1D9E75"
                label="100%"
                sublabel="hoje"
              />
            </div>
          ) : (
            <div className="px-7 py-8">
              <div className="text-[16px] font-semibold text-[#2C2C2A] mb-1">
                Sem missões para hoje
              </div>
              <p className="text-[13px] text-[#888780]">
                {hasActivePlan
                  ? "Nenhuma missão programada para hoje."
                  : "Gere seu plano de estudos para começar."}
              </p>
              {!hasActivePlan && (
                <button
                  type="button"
                  onClick={() => navigate("/diagnostic/intro")}
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-coral hover:text-coral-dark transition-colors"
                >
                  Gerar plano de estudos <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── 3. Compact stat band ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
          {/* % acerto (sem) */}
          <div className="bg-card border border-border rounded-[14px] px-4 py-3 min-h-[92px] flex items-stretch justify-between gap-4 overflow-hidden">
            <div className="min-w-0 flex-1 flex flex-col justify-between">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
                % Acerto (sem)
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-[18px] md:text-[19px] font-bold tracking-[-0.4px] leading-none text-foreground">
                  {acertoWeek?.current != null
                    ? `${acertoWeek.current}%`
                    : "—"}
                </span>
                {acertoWeek?.delta != null && (
                  <span className={`text-[11px] font-semibold leading-none ${metricTone(acertoWeek?.delta)}`}>
                    {sparklineStatusText(acertoWeek?.delta, "")}
                  </span>
                )}
              </div>
            </div>
            <div className="w-[76px] shrink-0 self-center pt-2">
              <Sparkline data={accuracySparkline} color="hsl(var(--success))" fillColor="hsl(var(--success))" height={40} strokeWidth={1.8} showArea />
            </div>
          </div>

          <div className="bg-card border border-border rounded-[14px] px-4 py-3 min-h-[92px] flex items-stretch justify-between gap-4 overflow-hidden">
            <div className="min-w-0 flex-1 flex flex-col justify-between">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
                Prob. aprovação
              </div>
              <div className="text-[18px] md:text-[19px] font-bold tracking-[-0.4px] leading-none text-foreground mt-1">
                {probabilityPct != null ? `${probabilityPct}%` : "—"}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 truncate">
                {hasExamConfig && metrics?.course_name
                  ? metrics.course_name
                  : probabilityLabel ?? "Sem estimativa ainda"}
              </div>
            </div>
            <div className="w-[76px] shrink-0 self-center pt-2">
              <Sparkline data={probabilityPct != null ? buildReferenceSparkline(probabilityPct, [-8, -2, 11, 4, 15]) : []} color="hsl(var(--coral))" fillColor="hsl(var(--coral))" height={40} strokeWidth={1.8} showArea />
            </div>
          </div>

          <div className="bg-card border border-border rounded-[14px] px-4 py-3 min-h-[92px] flex items-stretch justify-between gap-4 overflow-hidden">
            <div className="min-w-0 flex-1 flex flex-col justify-between">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
                Questões
              </div>
              <div className="text-[18px] md:text-[19px] font-bold tracking-[-0.4px] leading-none text-foreground mt-1">
                {totalQuestions}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 truncate">
                {totalQuestions > 0 ? `${totalCorrect} ✓ · ${totalQuestions - totalCorrect} ✗` : "Sem respostas ainda"}
              </div>
            </div>
            <div className="w-[76px] shrink-0 self-center pt-2">
              <Sparkline data={questionsSparkline} color="hsl(var(--signal-info))" fillColor="hsl(var(--signal-info))" height={40} strokeWidth={1.8} showArea />
            </div>
          </div>

          <div className="bg-card border border-border rounded-[14px] px-4 py-3 min-h-[92px] flex items-stretch justify-between gap-4 overflow-hidden">
            <div className="min-w-0 flex-1 flex flex-col justify-between">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
                Simulados
              </div>
              <div className="text-[18px] md:text-[19px] font-bold tracking-[-0.4px] leading-none text-foreground mt-1">
                {totalExams}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 truncate">
                {lastExamScore != null ? `Último ${lastExamScore}%` : "Nenhum ainda"}
              </div>
            </div>
            <div className="w-[76px] shrink-0 self-center pt-2">
              <Sparkline data={examsSparkline} color="hsl(var(--primary))" fillColor="hsl(var(--primary))" height={40} strokeWidth={1.8} showArea />
            </div>
          </div>
        </div>

        {/* ── 4a. Evolution (full width) — chart left + donut right ─────── */}
        <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5 mb-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <div>
              <div className="text-[14.5px] font-semibold text-[#2C2C2A]">
                Evolução de questões
              </div>
              <div className="text-[11px] text-[#B4B2A9] mt-0.5">
                Questões respondidas por período
              </div>
            </div>
            <SegmentedControl
              options={EVO_PERIOD_OPTIONS}
              active={evoLabel}
              onChange={handleEvoLabelChange}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-6 items-center mt-2">
            <div>
              {totalQuestions === 0 ? (
                <p className="text-[13px] text-[#888780] py-10 text-center">
                  Responda questões para ver sua evolução.
                </p>
              ) : (
                <EvolutionChart data={evoData ?? []} height={180} />
              )}
            </div>
            <div className="flex md:flex-col items-center gap-3 md:gap-2 md:border-l md:border-[#EFECE6] md:pl-6">
              <AccuracyDonut accuracyPct={periodAccuracyPct} size={96} />
              <div className="text-[12px] text-[#2C2C2A] text-center md:text-left">
                {periodAccuracyPct != null && periodErrorPct != null ? (
                  <>
                    <div>
                      <span className="font-semibold text-[#059669]">
                        {periodAccuracyPct}% Acertadas
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-[#DC2626]">
                        {periodErrorPct}% Erradas
                      </span>
                    </div>
                  </>
                ) : (
                  <span className="text-[#888780]">
                    Sem questões respondidas neste período.
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── 4b. Suas Missões (full width) ──────────────────────────────── */}
        <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5 mb-3.5">
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[14.5px] font-semibold text-[#2C2C2A]">
              Suas Missões
            </div>
            {overdueMissions.length > 0 && (
              <span className="text-[11px] font-semibold text-[#8A5A0B] bg-[#FBE7C6] px-2 py-0.5 rounded-md">
                {overdueMissions.length} atrasada
                {overdueMissions.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
            {!hasPendingWork ? (
              <div>
                <p className="text-[13px] text-[#888780]">
                  {allCompleted
                    ? "Tudo feito por hoje. Bom trabalho!"
                    : "Nenhuma missão pendente."}
                </p>
                {!hasActivePlan && (
                  <button
                    type="button"
                    onClick={() => navigate("/diagnostic/intro")}
                    className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-coral hover:text-coral-dark transition-colors"
                  >
                    Gerar novo plano <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div>
                {activeQueue.map((m, i) => (
                  <MissionRow
                    key={m.id}
                    mission={m}
                    isNext={i === 0}
                    isOverdue={m.isOverdue}
                  />
                ))}
              </div>
            )}
        </section>

        {/* ── 5. Proficiência por matéria ───────────────────────────────── */}
        <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5 mb-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <div className="text-[14.5px] font-semibold text-[#2C2C2A]">
              Proficiência por matéria
            </div>
            <SegmentedControl
              options={PROF_PERIOD_OPTIONS}
              active={profLabel}
              onChange={handleProfLabelChange}
            />
          </div>
          <p className="text-[11px] text-[#B4B2A9] mb-3">
            Clique para ver subtemas
          </p>

          {!proficiency || proficiency.length === 0 ? (
            <p className="text-[13px] text-[#888780] py-6 text-center">
              Responda questões para ver sua proficiência por matéria.
            </p>
          ) : (
            <div>
              {proficiency.map((s) => (
                <SubjectProficiencyRow
                  key={s.subject}
                  subject={s.subject}
                  score={s.score}
                  delta={s.delta}
                  color={PROFICIENCY_BAR_COLOR}
                  isExpanded={expandedSubject === s.subject}
                  onToggle={() =>
                    setExpandedSubject(
                      expandedSubject === s.subject ? null : s.subject,
                    )
                  }
                  subtopics={
                    expandedSubject === s.subject ? subtopics : undefined
                  }
                  subtopicsLoading={
                    expandedSubject === s.subject && subtopicsLoading
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* ── 6. Análise de simulados ───────────────────────────────────── */}
        <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5 mb-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div className="text-[14.5px] font-semibold text-[#2C2C2A]">
              Análise de simulados
            </div>
            <div className="flex gap-2 flex-wrap">
              <SegmentedControl
                options={SIM_FILTER_OPTIONS}
                active={simFilterLabel}
                onChange={handleSimFilterChange}
              />
              <SegmentedControl
                options={EXAM_PERIOD_OPTIONS}
                active={simPeriodLabel}
                onChange={handleSimPeriodChange}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5 items-start">
            {/* Left: stat tiles */}
            <div className="flex flex-col gap-2.5">
              <div className="bg-[#F7F6F3] rounded-[12px] px-4 py-3.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#888780]">
                  Simulados feitos
                </div>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className="text-[26px] font-bold tracking-[-0.5px] leading-none text-[#2C2C2A]">
                    {totalExams}
                  </span>
                  {totalExams === 0 && (
                    <span className="text-[11.5px] text-[#B4B2A9]">
                      nenhum ainda
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-[#F7F6F3] rounded-[12px] px-3.5 py-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#888780]">
                    Melhor nota
                  </div>
                  {examHighlights?.best ? (
                    <>
                      <div className="text-[20px] font-bold text-[#1D9E75] mt-1.5 leading-none">
                        {Math.round(examHighlights.best.score_percent)}
                        <span className="text-[12px] text-[#888780] font-medium">
                          %
                        </span>
                      </div>
                      <div className="text-[10.5px] text-[#B4B2A9] mt-1 truncate">
                        {examHighlights.best.exam_name} ·{" "}
                        {formatShortDate(examHighlights.best.created_at)}
                      </div>
                    </>
                  ) : (
                    <div className="text-[20px] font-bold text-[#2C2C2A] mt-1.5 leading-none">
                      —
                    </div>
                  )}
                </div>
                <div className="bg-[#F7F6F3] rounded-[12px] px-3.5 py-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#888780]">
                    Última nota
                  </div>
                  {examHighlights?.latest ? (
                    <>
                      <div className="text-[20px] font-bold text-[#2C2C2A] mt-1.5 leading-none">
                        {Math.round(examHighlights.latest.score_percent)}
                        <span className="text-[12px] text-[#888780] font-medium">
                          %
                        </span>
                      </div>
                      <div className="text-[10.5px] text-[#B4B2A9] mt-1 truncate">
                        {examHighlights.latest.exam_name} ·{" "}
                        {formatShortDate(examHighlights.latest.created_at)}
                      </div>
                    </>
                  ) : (
                    <div className="text-[20px] font-bold text-[#2C2C2A] mt-1.5 leading-none">
                      —
                    </div>
                  )}
                </div>
              </div>

              {/* Simple "Ver simulados" link back to /exams — the old
                  "Próximo simulado" card claimed 75 min / sábado / "Mini X"
                  but none of that comes from the backend, so we dropped it
                  until there's a real scheduled-exam source. */}
              <button
                type="button"
                onClick={() => navigate("/exams")}
                className="w-full bg-white border border-dashed border-[#E8E6E1] rounded-[12px] px-3.5 py-3 flex items-center gap-3 hover:bg-[#F7F6F3] transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-[#2C2C2A]">
                    Ver simulados
                  </div>
                  <div className="text-[11px] text-[#B4B2A9] mt-0.5">
                    Realizar um novo simulado
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-coral shrink-0" />
              </button>
            </div>

            {/* Right: chart */}
            <div className="bg-[#F7F6F3] rounded-[12px] px-4 py-3.5">
              <div className="text-[12px] font-semibold text-[#2C2C2A] mb-0.5">
                Evolução de notas
              </div>
              <div className="text-[10.5px] text-[#B4B2A9] mb-3">
                Desempenho nos simulados realizados
              </div>

              <ExamsChart data={examsData ?? []} height={200} />
            </div>
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
