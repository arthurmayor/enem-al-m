import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Star, Flame, Clock, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/trackEvent";
import BottomNav from "@/components/BottomNav";
import StatCard from "@/components/dashboard/StatCard";
import SegmentedControl from "@/components/dashboard/SegmentedControl";
import SubjectSelect from "@/components/dashboard/SubjectSelect";
import MissionRow from "@/components/dashboard/MissionRow";
import SubjectProficiencyRow from "@/components/dashboard/SubjectProficiencyRow";
import EvolutionChart from "@/components/dashboard/EvolutionChart";
import ExamsChart from "@/components/dashboard/ExamsChart";
import { SUBJECT_COLORS } from "@/components/dashboard/subjectColors";
import { useDashboardMetrics } from "@/hooks/dashboard/useDashboardMetrics";
import {
  useAccuracyByPeriod,
  type AccuracyPeriod,
} from "@/hooks/dashboard/useAccuracyByPeriod";
import {
  useProficiencyBySubject,
  type ProficiencyPeriod,
} from "@/hooks/dashboard/useProficiencyBySubject";
import { useProficiencySubtopics } from "@/hooks/dashboard/useProficiencySubtopics";
import {
  useQuestionsEvolution,
  type EvolutionPeriod,
} from "@/hooks/dashboard/useQuestionsEvolution";
import {
  useExamsEvolution,
  type ExamsPeriod,
  type ExamsType,
} from "@/hooks/dashboard/useExamsEvolution";
import { useTodayMissions } from "@/hooks/dashboard/useTodayMissions";
import { MISSION_STATUSES } from "@/lib/constants";

const ACERTO_OPTIONS = ["Semana", "Mês", "Ano", "Geral"] as const;
const EVO_PERIOD_OPTIONS = ["Semana", "Mês", "6m", "Ano", "Geral"] as const;
const PROF_OPTIONS = ["Geral", "Semana", "Mês", "6m"] as const;
const SIM_TYPE_OPTIONS = ["Todos", "Simulados", "Fuvest"] as const;
const SIM_PERIOD_OPTIONS = ["Semana", "Mês", "6m", "Geral"] as const;

type AcertoLabel = (typeof ACERTO_OPTIONS)[number];
type EvoLabel = (typeof EVO_PERIOD_OPTIONS)[number];
type ProfLabel = (typeof PROF_OPTIONS)[number];
type SimTypeLabel = (typeof SIM_TYPE_OPTIONS)[number];
type SimPeriodLabel = (typeof SIM_PERIOD_OPTIONS)[number];

const acertoMap: Record<AcertoLabel, AccuracyPeriod> = {
  Semana: "week",
  Mês: "month",
  Ano: "year",
  Geral: "all",
};
const evoPeriodMap: Record<EvoLabel, EvolutionPeriod> = {
  Semana: "week",
  Mês: "month",
  "6m": "6m",
  Ano: "year",
  Geral: "all",
};
const profMap: Record<ProfLabel, ProficiencyPeriod> = {
  Geral: "all",
  Semana: "week",
  Mês: "month",
  "6m": "6m",
};
const simTypeMap: Record<SimTypeLabel, ExamsType> = {
  Todos: "all",
  Simulados: "mock",
  Fuvest: "fuvest",
};
const simPeriodMap: Record<SimPeriodLabel, ExamsPeriod> = {
  Semana: "week",
  Mês: "month",
  "6m": "6m",
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

  const [acertoLabel, setAcertoLabel] = useState<AcertoLabel>("Semana");
  const [evoLabel, setEvoLabel] = useState<EvoLabel>("Mês");
  const [evoSubject, setEvoSubject] = useState<string>("Geral");
  const [profLabel, setProfLabel] = useState<ProfLabel>("Geral");
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [simPeriodLabel, setSimPeriodLabel] = useState<SimPeriodLabel>("Mês");
  const [simTypeLabel, setSimTypeLabel] = useState<SimTypeLabel>("Todos");

  const acertoPeriod = acertoMap[acertoLabel];
  const evoPeriod = evoPeriodMap[evoLabel];
  const profPeriod = profMap[profLabel];
  const simPeriod = simPeriodMap[simPeriodLabel];
  const simType = simTypeMap[simTypeLabel];

  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { data: acertoTrend } = useAccuracyByPeriod(acertoPeriod);
  const { data: proficiency } = useProficiencyBySubject(profPeriod);
  const { data: subtopics, isLoading: subtopicsLoading } =
    useProficiencySubtopics(expandedSubject);
  const { data: evoData } = useQuestionsEvolution(
    evoPeriod,
    evoSubject === "Geral" ? null : evoSubject,
  );
  const { data: simData } = useExamsEvolution(simPeriod, simType);
  const { data: todayMissions } = useTodayMissions();

  useEffect(() => {
    if (user) trackEvent("dashboard_viewed", {}, user.id);
  }, [user]);

  const subjectsFromProficiency = useMemo(() => {
    const set = new Set<string>();
    for (const p of proficiency ?? []) set.add(p.subject);
    return Array.from(set).sort();
  }, [proficiency]);

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
  const tasksPct =
    totalGenerated > 0
      ? Math.round((totalCompleted / totalGenerated) * 100)
      : 0;

  const totalQuestions = metrics?.total_questions ?? 0;
  const totalCorrect = metrics?.total_correct ?? 0;
  const totalErradas = Math.max(0, totalQuestions - totalCorrect);
  const overallAcertoPct =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const overallErradaPct =
    totalQuestions > 0 ? 100 - overallAcertoPct : 0;

  // Approval probability: simple proxy from overall accuracy once we have
  // enough signal. Below threshold, show the "complete more questions" CTA.
  const hasEnoughForProb = totalQuestions >= MIN_QUESTIONS_FOR_PROBABILITY;
  const probabilityPct = hasEnoughForProb ? overallAcertoPct : null;
  const questionsRemaining = Math.max(
    0,
    MIN_QUESTIONS_FOR_PROBABILITY - totalQuestions,
  );

  const totalExams = metrics?.total_exams ?? 0;
  const lastExamScore = metrics?.last_exam_score;
  const bestExamScore = metrics?.best_exam_score;

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

  return (
    <div className="pb-24 md:pb-0">
      <div className="max-w-[980px] mx-auto">
        {/* 1. Header */}
        <header className="flex items-start justify-between flex-wrap gap-3 pt-4 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.5px] text-[#2C2C2A]">
              Olá, {firstName || "Estudante"}
            </h1>
            <div className="text-[13px] text-[#888780] mt-0.5">{today}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-1.5 rounded-full bg-[#FFF3E6] text-[#854F0B]">
              <Star className="h-3.5 w-3.5 fill-current" />
              {metrics?.total_xp ?? 0} XP
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-1.5 rounded-full bg-[#FCEBEB] text-[#A32D2D]">
              <Flame className="h-3.5 w-3.5" />
              {metrics?.current_streak ?? 0} dias
            </span>
            {daysUntilExam != null && hasExamConfig && (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-1.5 rounded-full bg-coral-light text-coral-dark">
                <Clock className="h-3.5 w-3.5" />
                {daysUntilExam} dias para a {metrics?.exam_name}
              </span>
            )}
          </div>
        </header>

        {/* 2. Stat cards linha 1 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <StatCard label="Missões hoje">
            {missionsTodayTotal > 0 ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[26px] font-bold text-[#2C2C2A] leading-none">
                    {missionsTodayCompleted}
                  </span>
                  <span className="text-sm text-[#888780]">
                    /{missionsTodayTotal}
                  </span>
                </div>
                <div className="w-full h-[5px] bg-[#F1EFE8] rounded-sm mt-2 overflow-hidden">
                  <div
                    className="h-full bg-coral rounded-sm transition-[width] duration-300"
                    style={{ width: `${todayPct}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-[13px] text-[#888780] mt-1">
                Sem missões hoje.
              </p>
            )}
          </StatCard>

          <StatCard label="% acerto geral">
            {acertoTrend?.current != null ? (
              <div className="flex items-baseline gap-2">
                <span className="text-[26px] font-bold text-[#2C2C2A] leading-none">
                  {acertoTrend.current}%
                </span>
                {acertoTrend.delta != null && (
                  <span
                    className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${
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
            ) : (
              <p className="text-[13px] text-[#888780]">Sem respostas no período.</p>
            )}
            <div className="mt-2">
              <SegmentedControl
                options={ACERTO_OPTIONS}
                active={acertoLabel}
                onChange={setAcertoLabel}
              />
            </div>
          </StatCard>

          <StatCard label="Prob. aprovação">
            {hasEnoughForProb && probabilityPct != null ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[26px] font-bold text-[#2C2C2A] leading-none">
                    {probabilityPct}%
                  </span>
                  {metrics?.course_name && (
                    <span className="text-xs text-[#888780]">
                      {metrics.exam_name} {metrics.course_name}
                    </span>
                  )}
                </div>
                <div className="w-full h-[5px] bg-[#F1EFE8] rounded-sm mt-2 overflow-hidden">
                  <div
                    className="h-full bg-[#1D9E75] rounded-sm transition-[width] duration-300"
                    style={{ width: `${probabilityPct}%` }}
                  />
                </div>
                <div className="text-xs text-[#888780] mt-1">
                  {totalQuestions} questões respondidas
                </div>
              </>
            ) : (
              <p className="text-[13px] text-[#888780] mt-1 leading-relaxed">
                Complete {questionsRemaining} questões para liberar a estimativa.
              </p>
            )}
          </StatCard>
        </div>

        {/* 3. Stat cards linha 2 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <StatCard label="Simulados feitos">
            <div className="text-[26px] font-bold text-[#2C2C2A] leading-none">
              {totalExams}
            </div>
            <div className="text-xs text-[#888780] mt-1">
              {lastExamScore != null
                ? `Último: ${Math.round(lastExamScore)}/100`
                : "Nenhum ainda"}
            </div>
          </StatCard>

          <StatCard label="Tarefas totais">
            {totalGenerated > 0 ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[26px] font-bold text-[#2C2C2A] leading-none">
                    {tasksPct}%
                  </span>
                  <span className="text-xs text-[#888780]">completas</span>
                </div>
                <div className="w-full h-[5px] bg-[#F1EFE8] rounded-sm mt-2 overflow-hidden">
                  <div
                    className="h-full bg-coral rounded-sm transition-[width] duration-300"
                    style={{ width: `${tasksPct}%` }}
                  />
                </div>
                <div className="text-xs text-[#888780] mt-1">
                  {totalCompleted} de {totalGenerated} missões concluídas
                </div>
              </>
            ) : (
              <>
                <p className="text-[13px] text-[#888780] mt-1">
                  Gere seu plano de estudos.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/diagnostic/intro")}
                  className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-coral hover:text-coral-dark transition-colors"
                >
                  Gerar plano <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </StatCard>

          <StatCard label="Questões respondidas">
            <div className="text-[26px] font-bold text-[#2C2C2A] leading-none">
              {totalQuestions}
            </div>
            <div className="text-xs text-[#888780] mt-1">
              {totalQuestions > 0
                ? `Acertadas: ${totalCorrect} · Erradas: ${totalErradas}`
                : "Comece respondendo sua primeira questão."}
            </div>
          </StatCard>
        </div>

        {/* 4. Evolução de questões */}
        <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5 mb-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <span className="text-[15px] font-semibold text-[#2C2C2A]">
              Evolução de questões respondidas
            </span>
            <SegmentedControl
              options={EVO_PERIOD_OPTIONS}
              active={evoLabel}
              onChange={setEvoLabel}
            />
          </div>
          <div className="mb-3">
            <SubjectSelect
              value={evoSubject}
              onChange={setEvoSubject}
              subjects={subjectsFromProficiency}
            />
          </div>
          {totalQuestions === 0 ? (
            <p className="text-[13px] text-[#888780] py-10 text-center">
              Responda questões para ver sua evolução.
            </p>
          ) : (
            <div className="flex gap-5 flex-wrap md:flex-nowrap">
              <div className="flex-1 min-w-0">
                <EvolutionChart data={evoData ?? []} />
              </div>
              <div className="w-full md:w-[150px] text-[13px] shrink-0">
                <p className="font-semibold mb-2 text-[#2C2C2A]">Desempenho</p>
                <div className="flex justify-between py-1">
                  <span className="text-[#888780]">Acertadas</span>
                  <span className="font-semibold text-[#1D9E75]">
                    {overallAcertoPct}%
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#888780]">Erradas</span>
                  <span className="font-semibold text-[#A32D2D]">
                    {overallErradaPct}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 5. Missões do dia */}
        <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5 mb-5">
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

        {/* 6. Proficiência por matéria */}
        {proficiency && proficiency.length > 0 && (
          <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5 mb-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <span className="text-[15px] font-semibold text-[#2C2C2A]">
                Proficiência por matéria
              </span>
              <SegmentedControl
                options={PROF_OPTIONS}
                active={profLabel}
                onChange={setProfLabel}
              />
            </div>
            <p className="text-[11px] text-[#B4B2A9] mb-2.5">
              Clique em uma matéria para expandir os subtemas
            </p>
            <div>
              {proficiency.map((row) => {
                const color = SUBJECT_COLORS[row.subject] ?? "#888780";
                const isExpanded = expandedSubject === row.subject;
                return (
                  <SubjectProficiencyRow
                    key={row.subject}
                    subject={row.subject}
                    score={row.score}
                    delta={row.delta}
                    color={color}
                    isExpanded={isExpanded}
                    onToggle={() =>
                      setExpandedSubject(isExpanded ? null : row.subject)
                    }
                    subtopics={isExpanded ? subtopics : undefined}
                    subtopicsLoading={isExpanded && subtopicsLoading}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* 7. Análise de provas e simulados */}
        <section className="bg-white border border-[#E8E6E1] rounded-[14px] p-5 mb-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3.5">
            <span className="text-[15px] font-semibold text-[#2C2C2A]">
              Análise de provas e simulados
            </span>
            <div className="flex gap-1.5 flex-wrap">
              <SegmentedControl
                options={SIM_TYPE_OPTIONS}
                active={simTypeLabel}
                onChange={setSimTypeLabel}
              />
              <SegmentedControl
                options={SIM_PERIOD_OPTIONS}
                active={simPeriodLabel}
                onChange={setSimPeriodLabel}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[#F7F6F3] rounded-[10px] px-3.5 py-3 text-center">
              <div className="text-[11px] text-[#888780]">Simulados feitos</div>
              <div className="text-[22px] font-bold mt-0.5 text-[#2C2C2A]">
                {totalExams}
              </div>
            </div>
            <div className="bg-[#F7F6F3] rounded-[10px] px-3.5 py-3 text-center">
              <div className="text-[11px] text-[#888780]">Melhor nota</div>
              <div className="text-[22px] font-bold mt-0.5 text-[#1D9E75]">
                {bestExamScore != null ? `${Math.round(bestExamScore)}%` : "—"}
              </div>
            </div>
            <div className="bg-[#F7F6F3] rounded-[10px] px-3.5 py-3 text-center">
              <div className="text-[11px] text-[#888780]">Última nota</div>
              <div className="text-[22px] font-bold mt-0.5 text-[#2C2C2A]">
                {lastExamScore != null ? `${Math.round(lastExamScore)}%` : "—"}
              </div>
            </div>
          </div>

          {totalExams === 0 ? (
            <div className="text-center py-6">
              <p className="text-[13px] text-[#888780] mb-3">
                Seu primeiro mini simulado leva 75 min.
              </p>
              <button
                type="button"
                onClick={() => navigate("/exams")}
                className="inline-flex items-center gap-1 px-5 py-2 rounded-lg bg-coral text-white text-[13px] font-semibold hover:brightness-110 transition-all"
              >
                Iniciar <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <ExamsChart data={simData ?? []} />
          )}
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
