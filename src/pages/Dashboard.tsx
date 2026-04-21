import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Star, Flame, Clock, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/trackEvent";
import BottomNav from "@/components/BottomNav";
import SegmentedControl from "@/components/dashboard/SegmentedControl";
import SubjectSelect from "@/components/dashboard/SubjectSelect";
import MissionRow from "@/components/dashboard/MissionRow";
import EvolutionChart from "@/components/dashboard/EvolutionChart";
import ProgressRing from "@/components/dashboard/ProgressRing";
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import {
  useAccuracyByPeriod,
  type AccuracyPeriod,
} from "@/hooks/dashboard/useAccuracyByPeriod";
import {
  useQuestionsEvolution,
  type EvolutionPeriod,
} from "@/hooks/dashboard/useQuestionsEvolution";
import { useTodayMissions } from "@/hooks/dashboard/useTodayMissions";
import { MISSION_STATUSES } from "@/lib/constants";

const EVO_PERIOD_OPTIONS = ["Semana", "Mês", "6m", "Ano", "Geral"] as const;

type EvoLabel = (typeof EVO_PERIOD_OPTIONS)[number];

const evoPeriodMap: Record<EvoLabel, EvolutionPeriod> = {
  Semana: "week",
  Mês: "month",
  "6m": "6m",
  Ano: "year",
  Geral: "all",
};

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatDate(d: Date): string {
  const formatted = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return capitalize(formatted);
}

const MIN_QUESTIONS_FOR_PROBABILITY = 60;

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [evoLabel, setEvoLabel] = useState<EvoLabel>("Mês");
  const [evoSubject, setEvoSubject] = useState<string>("Geral");

  const evoPeriod = evoPeriodMap[evoLabel];

  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { data: acertoTrend } = useAccuracyByPeriod("week");
  const { data: evoData } = useQuestionsEvolution(
    evoPeriod,
    evoSubject === "Geral" ? null : evoSubject,
  );
  const { data: todayMissions } = useTodayMissions();

  useEffect(() => {
    if (user) trackEvent("dashboard_viewed", {}, user.id);
  }, [user]);

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

  const missionsTodayCompleted = metrics?.missions_today_completed ?? 0;
  const missionsTodayTotal = metrics?.missions_today_total ?? 0;
  const todayPct =
    missionsTodayTotal > 0
      ? Math.round((missionsTodayCompleted / missionsTodayTotal) * 100)
      : 0;

  const totalGenerated = metrics?.total_missions_generated ?? 0;
  const totalCompleted = metrics?.total_missions_completed ?? 0;

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
  const hasActivePlan = totalGenerated > 0 || missionsTodayTotal > 0;

  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 border-2 border-coral border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Hero card subtitle
  const heroLines: string[] = [];
  if (hasExamConfig && metrics?.exam_name && metrics?.course_name) {
    heroLines.push(`${metrics.exam_name} — ${metrics.course_name}`);
  }
  if (missionsTodayTotal > 0) {
    const pending = missionsTodayTotal - missionsTodayCompleted;
    heroLines.push(
      pending > 0
        ? `${pending} missão${pending > 1 ? "ões" : ""} pendente${pending > 1 ? "s" : ""} para hoje`
        : "Todas as missões de hoje concluídas 🎉",
    );
  }

  return (
    <div className="pb-24 md:pb-0">
      <div className="max-w-[980px] mx-auto">
        {/* 1. Hero Card */}
        <section className="bg-white border border-[#E8E6E1] rounded-[18px] overflow-hidden mt-4 mb-4">
          <div className="h-1 bg-coral" />
          <div className="flex items-center justify-between p-5 md:p-6 gap-4">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full bg-[#FAECE7] text-coral mb-2.5">
                <Flame className="h-3 w-3" />
                {metrics?.current_streak ?? 0} dias de sequência
              </div>
              <h1 className="text-[22px] md:text-[26px] font-bold tracking-[-0.5px] text-[#2C2C2A] leading-tight">
                Olá, {firstName || "Estudante"}
              </h1>
              <div className="text-[13px] text-[#888780] mt-1 space-y-0.5">
                {heroLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
                <p>{today}</p>
              </div>
            </div>
            <div className="shrink-0">
              <ProgressRing
                percentage={todayPct}
                size={110}
                strokeWidth={8}
                color="#D85A30"
                label={`${todayPct}%`}
                sublabel="hoje"
              />
            </div>
          </div>
        </section>

        {/* 2. Stat cards — 4 in a row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-[#E8E6E1] rounded-[12px] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#888780]">
              XP Total
            </div>
            <div className="text-[22px] font-bold text-[#2C2C2A] mt-0.5 leading-none flex items-center gap-1.5">
              <Star className="h-4 w-4 text-[#854F0B] fill-current" />
              {metrics?.total_xp ?? 0}
            </div>
          </div>

          <div className="bg-white border border-[#E8E6E1] rounded-[12px] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#888780]">
              % Acerto
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[22px] font-bold text-[#2C2C2A] leading-none">
                {acertoTrend?.current != null ? `${acertoTrend.current}%` : "—"}
              </span>
              {acertoTrend?.delta != null && (
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
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

          <div className="bg-white border border-[#E8E6E1] rounded-[12px] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#888780]">
              Questões
            </div>
            <div className="text-[22px] font-bold text-[#2C2C2A] mt-0.5 leading-none">
              {totalQuestions}
            </div>
          </div>

          <div className="bg-white border border-[#E8E6E1] rounded-[12px] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#888780]">
              {daysUntilExam != null && hasExamConfig ? "Dias p/ prova" : "Simulados"}
            </div>
            <div className="text-[22px] font-bold text-[#2C2C2A] mt-0.5 leading-none flex items-center gap-1.5">
              {daysUntilExam != null && hasExamConfig ? (
                <>
                  <Clock className="h-4 w-4 text-coral" />
                  {daysUntilExam}
                </>
              ) : (
                totalExams
              )}
            </div>
          </div>
        </div>

        {/* 3. Two-column: Chart + Missions */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] gap-4 mb-5">
          {/* Left: Evolução */}
          <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <span className="text-[15px] font-semibold text-[#2C2C2A]">
                Evolução
              </span>
              <SegmentedControl
                options={EVO_PERIOD_OPTIONS}
                active={evoLabel}
                onChange={(v) => setEvoLabel(v)}
              />
            </div>
            {totalQuestions === 0 ? (
              <p className="text-[13px] text-[#888780] py-10 text-center">
                Responda questões para ver sua evolução.
              </p>
            ) : (
              <EvolutionChart data={evoData ?? []} />
            )}
          </section>

          {/* Right: Missões do dia */}
          <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5">
            <div className="text-[15px] font-semibold text-[#2C2C2A] mb-3.5">
              Missões do dia
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
            ) : allCompleted ? (
              <p className="text-[13px] text-[#888780]">
                Sessão do dia completa. Bom trabalho!
              </p>
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
      </div>

      <BottomNav />
    </div>
  );
}
