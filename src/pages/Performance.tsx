import { useState, useEffect, useMemo } from "react";
import { CheckCircle2, Circle, Target, FileText, Lock, BarChart3 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  estimateScore,
  calculatePassProbability,
  getProbabilityBand,
  type Proficiency,
  type SubjectDistEntry,
} from "@/lib/scoring";
import { ALL_SUBJECTS, MISSION_STATUSES, PLAN_STATUSES } from "@/lib/constants";
import StatCard from "@/components/ui/StatCard";
import SubjectBadge from "@/components/ui/SubjectBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import EmptyState from "@/components/ui/EmptyState";
import { getSubjectColor } from "@/lib/subjectColors";

interface ProficiencyRow { subject: string; subtopic: string; score: number; measured_at: string; source: string; }
interface MissionRow { status: string; score: number | null; date: string; }
interface RecentAnswer { is_correct: boolean; subject: string; created_at: string; }

const FALLBACK_SUBJECT_DIST: Record<string, SubjectDistEntry> = {
  "Português": { questions: 15, meanDiff: 1150, sdDiff: 250 },
  "Matemática": { questions: 12, meanDiff: 1300, sdDiff: 300 },
  "História": { questions: 12, meanDiff: 1200, sdDiff: 250 },
  "Geografia": { questions: 10, meanDiff: 1200, sdDiff: 250 },
  "Biologia": { questions: 10, meanDiff: 1200, sdDiff: 280 },
  "Física": { questions: 10, meanDiff: 1300, sdDiff: 300 },
  "Química": { questions: 8, meanDiff: 1250, sdDiff: 280 },
  "Inglês": { questions: 5, meanDiff: 1050, sdDiff: 200 },
  "Filosofia": { questions: 5, meanDiff: 1200, sdDiff: 250 },
  "Artes": { questions: 3, meanDiff: 1100, sdDiff: 200 },
};

const RECENT_WINDOW = 25;
const MIN_FOR_PERCENT = 5;

const Performance = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [loading, setLoading] = useState(true);
  const [proficiencyData, setProficiencyData] = useState<ProficiencyRow[]>([]);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [recentAnswers, setRecentAnswers] = useState<RecentAnswer[]>([]);
  const [examHistory, setExamHistory] = useState<{ exam_name: string; score_percent: number; created_at: string }[]>([]);
  const [profileStats, setProfileStats] = useState<{ total_xp: number; current_streak: number; longest_streak: number; missions_completed: number; exam_config_id?: string } | null>(null);

  const [totalAnswered, setTotalAnswered] = useState(0);
  const [subjectsCovered, setSubjectsCovered] = useState(0);
  const [planUpdates, setPlanUpdates] = useState(0);
  const [daysStudied, setDaysStudied] = useState(0);

  const [eloProficiencies, setEloProficiencies] = useState<Record<string, Proficiency> | null>(null);
  const [examConfig, setExamConfig] = useState<{
    cutoff_mean: number;
    cutoff_sd: number;
    total_questions: number;
    subject_distribution: Record<string, SubjectDistEntry> | null;
  } | null>(null);
  const [simuladosCount, setSimuladosCount] = useState(0);

  // Segmented temporal filter for proficiency
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "all">("all");
  const [filteredProfMap, setFilteredProfMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      const { data: profData } = await supabase.from("proficiency_scores").select("subject, subtopic, score, measured_at, source").eq("user_id", user.id).order("measured_at", { ascending: true });
      if (profData) setProficiencyData(profData);

      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: missionData } = await supabase.from("daily_missions").select("status, score, date").eq("user_id", user.id).gte("date", weekAgo.toISOString().split("T")[0]);
      if (missionData) setMissions(missionData);

      const { data: answerData } = await supabase
        .from("answer_history")
        .select("is_correct, created_at, questions!inner(subject)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);

      if (answerData) {
        const mapped: RecentAnswer[] = answerData.map((a: any) => ({
          is_correct: a.is_correct,
          subject: (a.questions as any)?.subject || "",
          created_at: a.created_at,
        }));
        setRecentAnswers(mapped);
      }

      const { data: examData } = await supabase.from("exam_results").select("exam_name, score_percent, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
      if (examData) setExamHistory(examData);

      const { data: profileStatsData } = await supabase.from("profiles").select("total_xp, current_streak, longest_streak, missions_completed, exam_config_id").eq("id", user.id).single();
      if (profileStatsData) setProfileStats(profileStatsData);

      const { count: totalCount } = await supabase.from("answer_history").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      setTotalAnswered(totalCount || 0);

      const distinctSubjects = new Set((profData || []).map(p => p.subject));
      setSubjectsCovered(distinctSubjects.size);

      const { count: supersededCount } = await supabase.from("study_plans").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", PLAN_STATUSES.SUPERSEDED);
      setPlanUpdates(supersededCount || 0);

      const { data: allAnswers } = await supabase.from("answer_history").select("created_at").eq("user_id", user.id);
      if (allAnswers) {
        const uniqueDays = new Set(allAnswers.map(a => new Date(a.created_at).toISOString().split("T")[0]));
        setDaysStudied(uniqueDays.size);
      }

      const { data: latestEstimate } = await supabase
        .from("diagnostic_estimates")
        .select("proficiencies")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestEstimate?.proficiencies) {
        const raw = latestEstimate.proficiencies as Record<string, { elo?: number; score?: number; correct?: number; total?: number }>;
        const prof: Record<string, Proficiency> = {};
        for (const [subj, v] of Object.entries(raw)) {
          prof[subj] = {
            elo: v.elo ?? (v.score != null ? 600 + v.score * 1200 : 1200),
            correct: v.correct ?? 0,
            total: v.total ?? 0,
          };
        }
        setEloProficiencies(prof);
      }

      const examConfigId = (profileStatsData as any)?.exam_config_id;
      if (examConfigId) {
        const { data: ec } = await supabase
          .from("exam_configs")
          .select("cutoff_mean, total_questions, subject_distribution")
          .eq("id", examConfigId)
          .single();
        if (ec) {
          setExamConfig({
            cutoff_mean: ec.cutoff_mean ?? 55,
            cutoff_sd: 5,
            total_questions: ec.total_questions ?? 90,
            subject_distribution: ec.subject_distribution as unknown as Record<string, SubjectDistEntry> | null,
          });
        }
      }

      const { count: simCount } = await supabase
        .from("exam_results")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      setSimuladosCount(simCount || 0);

      setLoading(false);
    };
    fetchAll();
  }, [user]);

  // Fetch proficiency scores filtered by timeRange
  useEffect(() => {
    if (!user) return;
    const fetchFiltered = async () => {
      const cutoff = timeRange === "7d"
        ? new Date(Date.now() - 7 * 86400000).toISOString()
        : timeRange === "30d"
          ? new Date(Date.now() - 30 * 86400000).toISOString()
          : null;
      let query = supabase
        .from("proficiency_scores")
        .select("subject, score, measured_at")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: false });
      if (cutoff) query = query.gte("measured_at", cutoff);
      const { data: profRows } = await query;
      const map = new Map<string, number>();
      for (const row of profRows || []) {
        if (!map.has(row.subject)) map.set(row.subject, row.score);
      }
      setFilteredProfMap(map);
    };
    fetchFiltered();
  }, [user, timeRange]);

  // ─── Computed values ─────────────────────────────────────────────────────

  const weekCompletedMissions = missions.filter((m) => m.status === MISSION_STATUSES.COMPLETED).length;
  const weekTotalMissions = missions.filter((m) => m.status !== MISSION_STATUSES.SUPERSEDED).length;

  const weekAccuracy = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAnswers = recentAnswers.filter(a => new Date(a.created_at) >= weekAgo);
    return weekAnswers.length > 0 ? Math.round((weekAnswers.filter(a => a.is_correct).length / weekAnswers.length) * 100) : 0;
  }, [recentAnswers]);

  const subjects = useMemo(() => [...new Set(proficiencyData.map((p) => p.subject))], [proficiencyData]);
  const subjectFilters = ["all", ...subjects];

  const canShowProbability = totalAnswered >= 60 && subjectsCovered >= 4 && planUpdates >= 1;

  const unlockReqs = useMemo(() => [
    { done: totalAnswered >= 60, text: `${totalAnswered}/60 questões respondidas` },
    { done: subjectsCovered >= 4, text: `${subjectsCovered}/4 matérias cobertas` },
    { done: daysStudied >= 7, text: `${daysStudied}/7 dias estudados` },
  ], [totalAnswered, subjectsCovered, daysStudied]);

  // Per-subject answer counts for "more N to measure"
  const subjectAnswerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of recentAnswers) {
      counts[a.subject] = (counts[a.subject] || 0) + 1;
    }
    return counts;
  }, [recentAnswers]);

  const worstArea = useMemo(() => {
    if (filteredProfMap.size === 0) return null;
    let worst: { subject: string; score: number } | null = null;
    for (const [subject, score] of filteredProfMap.entries()) {
      if (!worst || score < worst.score) worst = { subject, score };
    }
    return worst;
  }, [filteredProfMap]);

  const chartDataMap: Record<string, Record<string, number[]>> = {};
  proficiencyData.forEach((p) => {
    const dateKey = new Date(p.measured_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    if (!chartDataMap[dateKey]) chartDataMap[dateKey] = {};
    if (!chartDataMap[dateKey][p.subject]) chartDataMap[dateKey][p.subject] = [];
    chartDataMap[dateKey][p.subject].push(p.score * 100);
  });
  const chartData = Object.entries(chartDataMap).map(([date, scores]) => {
    const entry: Record<string, string | number> = { date };
    Object.entries(scores).forEach(([subj, vals]) => { entry[subj] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length); });
    return entry;
  });

  const calibratedEstimate = useMemo(() => {
    if (!eloProficiencies || !examConfig) return null;

    const subjectDist = examConfig.subject_distribution && Object.keys(examConfig.subject_distribution).length > 0
      ? examConfig.subject_distribution
      : FALLBACK_SUBJECT_DIST;

    const totalCorrect = Object.values(eloProficiencies).reduce((s, p) => s + p.correct, 0);
    const totalQuestions = Object.values(eloProficiencies).reduce((s, p) => s + p.total, 0);

    const score = estimateScore(
      eloProficiencies,
      subjectDist,
      totalQuestions || 30,
      totalCorrect,
      simuladosCount,
      totalAnswered,
    );

    const probability = calculatePassProbability(
      score,
      examConfig.cutoff_mean,
      examConfig.cutoff_sd,
      totalAnswered,
      simuladosCount,
      subjectsCovered,
    );

    const band = getProbabilityBand(probability);

    return { score, probability, band, probPercent: Math.round(probability * 100) };
  }, [eloProficiencies, examConfig, simuladosCount, totalAnswered, subjectsCovered]);

  const hasData = proficiencyData.length > 0 || recentAnswers.length > 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-ink-strong border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-app pb-24 md:pb-0">
      {/* ─── Header ─── */}
      <header className="mb-6 animate-fade-in">
        <h1 className="text-2xl font-bold text-ink-strong">Desempenho</h1>
      </header>

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title="Ainda sem dados de desempenho"
          description="Complete missões para ver sua evolução."
          actionLabel="Ir para Dashboard"
          onAction={() => navigate("/dashboard")}
        />
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* ─── Stats row ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Missões"
              value={`${weekCompletedMissions}/${weekTotalMissions}`}
              subtitle="esta semana"
              icon={Target}
            />
            <StatCard
              label="Acerto"
              value={`${weekAccuracy}%`}
              subtitle="últimos 7 dias"
              icon={CheckCircle2}
            />
            <StatCard
              label="Respondidas"
              value={totalAnswered}
              subtitle="questões no total"
              icon={FileText}
            />
          </div>

          {/* ─── 2-column grid ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* ══════ LEFT COLUMN ══════ */}
            <div className="lg:col-span-7 space-y-6">
              {/* ─── Desempenho por matéria ─── */}
              <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <h2 className="text-lg font-semibold text-ink-strong">Desempenho por matéria</h2>
                  <div className="bg-bg-app rounded-lg p-1 inline-flex gap-1">
                    {([["7d", "7 dias"], ["30d", "30 dias"], ["all", "Total"]] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setTimeRange(key)}
                        className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                          timeRange === key
                            ? "bg-white shadow-card text-ink-strong font-medium"
                            : "text-ink-soft hover:text-ink-strong"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-line-light">
                  {ALL_SUBJECTS.map((subject) => {
                    const score = filteredProfMap.get(subject);
                    const answerCount = subjectAnswerCounts[subject] || 0;

                    if (score != null) {
                      return (
                        <div key={subject} className="flex items-center gap-3 py-3">
                          <SubjectBadge subject={subject} />
                          <div className="flex-1">
                            <ProgressBar value={Math.round(score * 100)} color={getSubjectColor(subject)} size="sm" />
                          </div>
                          <span className="text-sm font-semibold text-ink-strong w-10 text-right">
                            {Math.round(score * 100)}%
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div key={subject} className="flex items-center gap-3 py-3">
                        <SubjectBadge subject={subject} />
                        <span className="text-sm text-ink-muted flex-1">
                          {answerCount === 0
                            ? "Responda questões para medir"
                            : `mais ${Math.max(0, 10 - answerCount)} para medir`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ─── Evolution chart ─── */}
              {chartData.length > 1 && totalAnswered >= 50 && (
                <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card">
                  <h2 className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-3">Evolução por matéria</h2>
                  <div className="flex gap-1.5 mb-3 overflow-x-auto">
                    {subjectFilters.map((s) => (
                      <button key={s} onClick={() => setSelectedSubject(s)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 ${
                          selectedSubject === s ? "bg-ink-strong text-white" : "bg-bg-app border border-line-light text-ink-soft"
                        }`}>
                        {s === "all" ? "Todas" : s}
                      </button>
                    ))}
                  </div>
                  <div className="bg-bg-app rounded-card p-3 h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#A39E99" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#A39E99" />
                        <Tooltip />
                        {subjects.filter((s) => selectedSubject === "all" || selectedSubject === s).map((s) => (
                          <Line key={s} type="monotone" dataKey={s} stroke={getSubjectColor(s)} strokeWidth={2} dot={false} name={s} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ─── Exam history ─── */}
              {examHistory.length > 0 && (
                <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card">
                  <h2 className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-3">Últimos simulados</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {examHistory.map((e, i) => {
                      const c = e.score_percent >= 70 ? "text-signal-ok bg-signal-ok/10" : e.score_percent >= 40 ? "text-brand-500 bg-brand-50" : "text-signal-error bg-signal-error/10";
                      return (
                        <div key={i} className="flex items-center justify-between p-3 bg-bg-app rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-ink-strong">{e.exam_name}</p>
                            <p className="text-xs text-ink-muted">{new Date(e.created_at).toLocaleDateString("pt-BR")}</p>
                          </div>
                          <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${c}`}>{Math.round(e.score_percent)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ══════ RIGHT COLUMN ══════ */}
            <div className="lg:col-span-5 space-y-6">
              {/* ─── Próximos passos ─── */}
              <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card">
                <h2 className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-3">Próximos passos</h2>
                <div className="space-y-2">
                  {unlockReqs.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      {r.done ? (
                        <div className="h-5 w-5 rounded-full bg-signal-ok flex items-center justify-center shrink-0">
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-line shrink-0" />
                      )}
                      <span className={`text-sm ${r.done ? "text-ink" : "text-ink-soft"}`}>{r.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ─── Onde focar ─── */}
              {worstArea && (
                <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card">
                  <h2 className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-3">Onde focar</h2>
                  <p className="text-sm text-ink mb-3">
                    <span className="font-semibold">{worstArea.subject}</span> é sua maior alavanca de crescimento
                  </p>
                  <div className="flex items-center gap-3 mb-4">
                    <SubjectBadge subject={worstArea.subject} />
                    <div className="flex-1">
                      <ProgressBar value={Math.round(worstArea.score * 100)} color={getSubjectColor(worstArea.subject)} size="sm" />
                    </div>
                    <span className="text-sm font-semibold text-ink-strong">{Math.round(worstArea.score * 100)}%</span>
                  </div>
                  <button
                    onClick={() => navigate("/study")}
                    className="w-full px-4 py-2.5 rounded-input bg-ink-strong text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Praticar →
                  </button>
                </div>
              )}

              {/* ─── Chance de aprovação ─── */}
              <div className="bg-bg-card rounded-card p-5 border border-line-light shadow-card">
                {canShowProbability && calibratedEstimate ? (
                  <>
                    <h2 className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-3">Chance de aprovação · 1ª fase</h2>
                    <div className="text-center py-2">
                      <div
                        className="inline-flex items-center justify-center h-16 w-16 rounded-full text-xl font-bold"
                        style={{ backgroundColor: calibratedEstimate.band.bgColor, color: calibratedEstimate.band.color }}
                      >
                        {calibratedEstimate.probPercent}%
                      </div>
                      <p className="text-xs font-medium mt-2" style={{ color: calibratedEstimate.band.color }}>
                        {calibratedEstimate.band.label}
                      </p>
                      <p className="text-xs text-ink-muted mt-1">
                        Score: {calibratedEstimate.score}/90 — evolui com a prática
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Lock className="h-4 w-4 text-ink-muted" />
                      <h2 className="text-xs uppercase tracking-wider text-ink-soft font-medium">Chance de aprovação · 1ª fase</h2>
                    </div>
                    <p className="text-sm text-ink-muted mb-3">
                      Complete {Math.max(0, 60 - totalAnswered)} questões para liberar estimativa
                    </p>
                    <ProgressBar value={Math.min(100, (totalAnswered / 60) * 100)} size="sm" />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Performance;
