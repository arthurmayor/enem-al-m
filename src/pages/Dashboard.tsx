import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Star,
  Flame,
  Clock,
  ArrowRight,
  Target,
  CheckCircle2,
  Sparkles,
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
import { getDashboardSubjectColor } from "@/components/dashboard/subjectColors";
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import {
  useAccuracyByPeriod,
} from "@/hooks/dashboard/useAccuracyByPeriod";
import {
  useQuestionsEvolution,
  type EvolutionPeriod,
} from "@/hooks/dashboard/useQuestionsEvolution";
import { useTodayMissions } from "@/hooks/dashboard/useTodayMissions";
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
import { MISSION_STATUSES, MISSION_TYPE_LABELS } from "@/lib/constants";

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

const MIN_QUESTIONS_FOR_PROBABILITY = 60;

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

  const evoPeriod = evoPeriodMap[evoLabel];
  const profPeriod = profPeriodMap[profLabel];
  const examPeriod = examPeriodMap[simPeriodLabel];
  const examType = simTypeMap[simFilterLabel];

  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { data: acertoTrend } = useAccuracyByPeriod("week");
  const { data: evoData } = useQuestionsEvolution(evoPeriod, null);
  const { data: todayMissions } = useTodayMissions();
  const { data: proficiency } = useProficiencyBySubject(profPeriod);
  const { data: subtopics, isLoading: subtopicsLoading } =
    useProficiencySubtopics(expandedSubject);
  const { data: examsData } = useExamsEvolution(examPeriod, examType);

  useEffect(() => {
    if (user) trackEvent("dashboard_viewed", {}, user.id);
  }, [user]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const firstName = metrics?.name?.split(" ")[0] ?? "";
  const today = formatDate(new Date());

  const missionsToday = todayMissions ?? [];
  const activeMissions = missionsToday.filter(
    (m) => m.status !== MISSION_STATUSES.SUPERSEDED,
  );
  const hasMissions = activeMissions.length > 0;
  const nextPendingIndex = activeMissions.findIndex(
    (m) =>
      m.status === MISSION_STATUSES.PENDING ||
      m.status === MISSION_STATUSES.IN_PROGRESS,
  );
  const allCompleted =
    hasMissions &&
    activeMissions.every((m) => m.status === MISSION_STATUSES.COMPLETED);
  const heroMission =
    nextPendingIndex >= 0 ? activeMissions[nextPendingIndex] : null;

  const missionsTodayCompleted = metrics?.missions_today_completed ?? 0;
  const missionsTodayTotal = metrics?.missions_today_total ?? 0;
  const todayPct =
    missionsTodayTotal > 0
      ? Math.round((missionsTodayCompleted / missionsTodayTotal) * 100)
      : 0;

  const totalQuestions = metrics?.total_questions ?? 0;
  const totalCorrect = metrics?.total_correct ?? 0;
  const overallAcertoPct =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  const hasEnoughForProb = totalQuestions >= MIN_QUESTIONS_FOR_PROBABILITY;
  const probabilityPct = hasEnoughForProb ? overallAcertoPct : null;
  const questionsRemaining = Math.max(
    0,
    MIN_QUESTIONS_FOR_PROBABILITY - totalQuestions,
  );

  const totalExams = metrics?.total_exams ?? 0;
  const lastExamScore = metrics?.last_exam_score;

  const daysUntilExam = metrics?.days_until_exam ?? null;
  const hasExamConfig = !!metrics?.exam_name;
  const hasActivePlan = (metrics?.total_missions_generated ?? 0) > 0 || missionsTodayTotal > 0;

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
            <div className="text-[11.5px] font-medium tracking-[0.3px] text-[#888780] uppercase">
              {today}
            </div>
            <h1 className="text-[22px] font-semibold mt-0.5 tracking-[-0.4px] text-[#2C2C2A]">
              Olá, {firstName || "Estudante"}.
            </h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-md bg-[#FFF3E6] text-[#854F0B]">
              <Star className="h-3 w-3 fill-current" />
              {metrics?.total_xp ?? 0} XP
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-md bg-[#FCEBEB] text-[#A32D2D]">
              <Flame className="h-3 w-3" />
              {metrics?.current_streak ?? 0} dias
            </span>
            {daysUntilExam != null && hasExamConfig && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-md bg-[#FAECE7] text-[#993C1D]">
                <Clock className="h-3 w-3" />
                {daysUntilExam} dias · {metrics?.exam_name}
              </span>
            )}
          </div>
        </header>

        {/* ── 2. Hero — Próxima missão ───────────────────────────────────── */}
        <section className="bg-white border border-[#E8E6E1] rounded-[18px] overflow-hidden mb-3 relative">
          {/* coral top ribbon */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-coral" />

          {hasMissions && !allCompleted && heroMission ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 px-7 pt-8 pb-6 items-center">
                {/* Left: action info */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.5px] uppercase text-[#993C1D] bg-[#FAECE7] px-2.5 py-1 rounded-md">
                      <Target className="h-3 w-3" />
                      Próxima missão
                    </span>
                    <span className="text-[12px] text-[#B4B2A9]">
                      {nextPendingIndex + 1} de {activeMissions.length} hoje
                    </span>
                  </div>

                  <h2 className="text-[28px] md:text-[32px] font-bold tracking-[-0.6px] leading-tight mb-2 text-[#2C2C2A]">
                    {heroMission.subtopic ?? heroMission.subject}
                  </h2>
                  <p className="text-[14px] text-[#888780] mb-5 max-w-[440px] leading-[1.45]">
                    {heroMission.subject}
                    {heroMission.subtopic ? ` · ${MISSION_TYPE_LABELS[heroMission.mission_type] ?? heroMission.mission_type}` : ""}
                    {heroMission.question_ids?.length
                      ? ` · ${heroMission.question_ids.length} questões`
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
              {activeMissions.length > 1 && (
                <div className="border-t border-[#EFECE6] bg-[#F7F6F3] px-7 py-3 flex items-center gap-4 flex-wrap text-[12px] text-[#888780]">
                  <span className="font-semibold text-[#2C2C2A] tracking-[0.2px]">
                    Depois:
                  </span>
                  {activeMissions
                    .filter((_, i) => i !== nextPendingIndex)
                    .slice(0, 4)
                    .map((m) => {
                      const isDone = m.status === MISSION_STATUSES.COMPLETED;
                      return (
                        <span
                          key={m.id}
                          className="flex items-center gap-1.5"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: isDone ? "#1D9E75" : "#888780",
                            }}
                          />
                          <span
                            style={{
                              color: isDone ? "#B4B2A9" : "#2C2C2A",
                              textDecoration: isDone ? "line-through" : "none",
                            }}
                          >
                            {m.subject}
                            {m.subtopic ? ` · ${m.subtopic}` : ""}
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
          {/* % acerto */}
          <div className="bg-white border border-[#E8E6E1] rounded-[12px] px-3.5 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#888780]">
              % Acerto (sem)
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[22px] font-bold tracking-[-0.4px] leading-none text-[#2C2C2A]">
                {acertoTrend?.current != null
                  ? `${acertoTrend.current}%`
                  : "—"}
              </span>
              {acertoTrend?.delta != null && (
                <span
                  className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                    acertoTrend.delta >= 0
                      ? "bg-[#E1F5EE] text-[#1D9E75]"
                      : "bg-[#FCEBEB] text-[#A32D2D]"
                  }`}
                >
                  {acertoTrend.delta >= 0 ? "+" : ""}
                  {acertoTrend.delta}%
                </span>
              )}
            </div>
          </div>

          {/* Probabilidade de aprovação */}
          <div className="bg-white border border-[#E8E6E1] rounded-[12px] px-3.5 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#888780]">
              Prob. aprovação
            </div>
            <div className="mt-1">
              {probabilityPct != null ? (
                <>
                  <span className="text-[22px] font-bold tracking-[-0.4px] leading-none text-[#2C2C2A]">
                    {probabilityPct}%
                  </span>
                  {hasExamConfig && metrics?.course_name && (
                    <div className="text-[11px] text-[#B4B2A9] mt-0.5 truncate">
                      {metrics.course_name}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <span className="text-[22px] font-bold tracking-[-0.4px] leading-none text-[#2C2C2A]">
                    —
                  </span>
                  <div className="text-[11px] text-[#B4B2A9] mt-0.5">
                    +{questionsRemaining} q para calcular
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Questões */}
          <div className="bg-white border border-[#E8E6E1] rounded-[12px] px-3.5 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#888780]">
              Questões
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[22px] font-bold tracking-[-0.4px] leading-none text-[#2C2C2A]">
                {totalQuestions}
              </span>
            </div>
            {totalQuestions > 0 && (
              <div className="text-[11px] text-[#B4B2A9] mt-0.5">
                {totalCorrect} ✓ · {totalQuestions - totalCorrect} ✗
              </div>
            )}
          </div>

          {/* Simulados */}
          <div className="bg-white border border-[#E8E6E1] rounded-[12px] px-3.5 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#888780]">
              {daysUntilExam != null && hasExamConfig
                ? "Dias p/ prova"
                : "Simulados"}
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              {daysUntilExam != null && hasExamConfig ? (
                <>
                  <Clock className="h-4 w-4 text-coral mt-1" />
                  <span className="text-[22px] font-bold tracking-[-0.4px] leading-none text-[#2C2C2A]">
                    {daysUntilExam}
                  </span>
                </>
              ) : (
                <span className="text-[22px] font-bold tracking-[-0.4px] leading-none text-[#2C2C2A]">
                  {totalExams}
                </span>
              )}
            </div>
            {lastExamScore != null && (
              <div className="text-[11px] text-[#B4B2A9] mt-0.5">
                Último {lastExamScore}%
              </div>
            )}
          </div>
        </div>

        {/* ── 4. Two-column: Evolution + Missions queue ─────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr] gap-3.5 mb-3.5">
          {/* Evolution chart */}
          <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5">
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
                onChange={setEvoLabel}
              />
            </div>
            {totalQuestions === 0 ? (
              <p className="text-[13px] text-[#888780] py-10 text-center">
                Responda questões para ver sua evolução.
              </p>
            ) : (
              <EvolutionChart data={evoData ?? []} height={180} />
            )}
          </section>

          {/* Missions queue */}
          <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5">
            <div className="text-[14.5px] font-semibold text-[#2C2C2A] mb-3.5">
              Fila de hoje
            </div>
            {!hasMissions ? (
              <div>
                <p className="text-[13px] text-[#888780]">Sem missões hoje.</p>
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
                {activeMissions.map((m, i) => (
                  <MissionRow
                    key={m.id}
                    mission={m}
                    isNext={i === nextPendingIndex}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── 5. Proficiência por matéria ───────────────────────────────── */}
        <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5 mb-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <div className="text-[14.5px] font-semibold text-[#2C2C2A]">
              Proficiência por matéria
            </div>
            <SegmentedControl
              options={PROF_PERIOD_OPTIONS}
              active={profLabel}
              onChange={setProfLabel}
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
                  color={getDashboardSubjectColor(s.subject)}
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
                onChange={setSimFilterLabel}
              />
              <SegmentedControl
                options={EXAM_PERIOD_OPTIONS}
                active={simPeriodLabel}
                onChange={setSimPeriodLabel}
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
                  {metrics?.best_exam_score != null ? (
                    <>
                      <div className="text-[20px] font-bold text-[#1D9E75] mt-1.5 leading-none">
                        {metrics.best_exam_score}
                        <span className="text-[12px] text-[#888780] font-medium">
                          %
                        </span>
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
                  {lastExamScore != null ? (
                    <div className="text-[20px] font-bold text-[#2C2C2A] mt-1.5 leading-none">
                      {lastExamScore}
                      <span className="text-[12px] text-[#888780] font-medium">
                        %
                      </span>
                    </div>
                  ) : (
                    <div className="text-[20px] font-bold text-[#2C2C2A] mt-1.5 leading-none">
                      —
                    </div>
                  )}
                </div>
              </div>

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

              {!examsData || examsData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Sparkles className="h-8 w-8 text-[#E8E6E1] mb-2" />
                  <p className="text-[12px] text-[#B4B2A9]">
                    Nenhum simulado realizado neste período.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/exams")}
                    className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-coral hover:text-coral-dark transition-colors"
                  >
                    Fazer primeiro simulado{" "}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <ExamsChart data={examsData} height={200} />
              )}
            </div>
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
