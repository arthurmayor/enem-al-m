import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Flame, CheckCircle2, Circle, BookOpen, TrendingUp, Target, Zap, ArrowRight, Lock, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ProficiencyRow { subject: string; subtopic: string; score: number; measured_at: string; source: string; }
interface MissionRow { status: string; score: number | null; date: string; }
interface AnswerRow { is_correct: boolean; created_at: string; }

const ALL_SUBJECTS = ["Português", "Matemática", "História", "Geografia", "Biologia", "Física", "Química", "Inglês", "Filosofia"];

function barColor(pct: number): string {
  if (pct >= 70) return "bg-green-500";
  if (pct >= 40) return "bg-amber-400";
  return "bg-red-500";
}

function metricHint(key: "missions" | "accuracy" | "questions" | "streak", vals: { weekCompleted: number; weekTotal: number; accuracy: number; totalAnswered: number; streak: number }): string {
  switch (key) {
    case "missions":
      if (vals.weekTotal === 0) return "nenhuma missão ainda";
      if (vals.weekCompleted >= vals.weekTotal) return "semana completa";
      if (vals.weekCompleted / vals.weekTotal >= 0.6) return "bom ritmo";
      return "abaixo do ritmo";
    case "accuracy":
      if (vals.accuracy >= 75) return "acima da média";
      if (vals.accuracy >= 50) return "na média";
      if (vals.accuracy > 0) return "precisa melhorar";
      return "sem dados";
    case "questions": {
      const remaining = Math.max(0, 60 - vals.totalAnswered);
      if (remaining > 0) return `faltam ${remaining} p/ estimativa`;
      return "estimativa liberada";
    }
    case "streak":
      if (vals.streak >= 7) return "consistência forte";
      if (vals.streak >= 3) return "mantendo ritmo";
      if (vals.streak >= 1) return "não pare agora";
      return "comece hoje";
  }
}

const Performance = () => {
  const { user } = useAuth();
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [loading, setLoading] = useState(true);
  const [proficiencyData, setProficiencyData] = useState<ProficiencyRow[]>([]);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [allTimeMissions, setAllTimeMissions] = useState<{ status: string }[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [examHistory, setExamHistory] = useState<{ exam_name: string; score_percent: number; created_at: string }[]>([]);
  const [profileStats, setProfileStats] = useState<{ total_xp: number; current_streak: number; longest_streak: number; missions_completed: number } | null>(null);

  // Gate data
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [subjectsCovered, setSubjectsCovered] = useState(0);
  const [regenerations, setRegenerations] = useState(0);
  const [daysStudied, setDaysStudied] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      const { data: profData } = await supabase.from("proficiency_scores").select("subject, subtopic, score, measured_at, source").eq("user_id", user.id).order("measured_at", { ascending: true });
      if (profData) setProficiencyData(profData);

      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: missionData } = await supabase.from("daily_missions").select("status, score, date").eq("user_id", user.id).gte("date", weekAgo.toISOString().split("T")[0]);
      if (missionData) setMissions(missionData);

      const { data: allMissions } = await supabase.from("daily_missions").select("status").eq("user_id", user.id);
      if (allMissions) setAllTimeMissions(allMissions);

      const { data: answerData } = await supabase.from("answer_history").select("is_correct, created_at").eq("user_id", user.id).gte("created_at", weekAgo.toISOString());
      if (answerData) setAnswers(answerData);

      const { data: examData } = await supabase.from("exam_results").select("exam_name, score_percent, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
      if (examData) setExamHistory(examData);

      const { data: profileStatsData } = await supabase.from("profiles").select("total_xp, current_streak, longest_streak, missions_completed").eq("id", user.id).single();
      if (profileStatsData) setProfileStats(profileStatsData);

      const { count: totalCount } = await supabase.from("answer_history").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      setTotalAnswered(totalCount || 0);

      const distinctSubjects = new Set((profData || []).map(p => p.subject));
      setSubjectsCovered(distinctSubjects.size);

      const { count: supersededCount } = await supabase.from("study_plans").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "superseded");
      setRegenerations(supersededCount || 0);

      const { data: allAnswers } = await supabase.from("answer_history").select("created_at").eq("user_id", user.id);
      if (allAnswers) {
        const uniqueDays = new Set(allAnswers.map(a => new Date(a.created_at).toISOString().split("T")[0]));
        setDaysStudied(uniqueDays.size);
      }

      setLoading(false);
    };
    fetchAll();
  }, [user]);

  // ─── Computed values ────────────────────────────────────────────

  const weekCompletedMissions = missions.filter((m) => m.status === "completed").length;
  const weekTotalMissions = missions.length;
  const weekAccuracy = answers.length > 0 ? Math.round((answers.filter((a) => a.is_correct).length / answers.length) * 100) : 0;
  const totalQuestionsAnswered = totalAnswered;
  const currentStreak = profileStats?.current_streak || 0;

  const subjects = useMemo(() => [...new Set(proficiencyData.map((p) => p.subject))], [proficiencyData]);
  const subjectFilters = ["all", ...subjects];

  const canShowProbability = totalAnswered >= 60 && subjectsCovered >= 4 && regenerations >= 1;

  // Subject scores sorted worst-first
  const subjectScores = useMemo(() => {
    return ALL_SUBJECTS.map((s) => {
      const rows = proficiencyData.filter(p => p.subject === s);
      if (rows.length === 0) return { subject: s, pct: -1 };
      const avg = rows.reduce((sum, r) => sum + r.score, 0) / rows.length;
      return { subject: s, pct: Math.round(avg * 100) };
    }).sort((a, b) => {
      if (a.pct === -1 && b.pct === -1) return 0;
      if (a.pct === -1) return 1;
      if (b.pct === -1) return -1;
      return a.pct - b.pct;
    });
  }, [proficiencyData]);

  // Best & worst subject names for highlight
  const scoredSubjects = subjectScores.filter(s => s.pct >= 0);
  const worstSubjectName = scoredSubjects.length > 0 ? scoredSubjects[0].subject : null;
  const bestSubjectName = scoredSubjects.length > 0 ? scoredSubjects[scoredSubjects.length - 1].subject : null;

  // Worst area for "maior gargalo"
  const worstArea = useMemo(() => {
    const realSubtopics = proficiencyData.filter(
      (p) => p.subtopic && p.subtopic !== "geral" && p.subtopic.trim() !== ""
    );
    if (realSubtopics.length > 0) {
      const worst = realSubtopics.reduce((a, b) => a.score < b.score ? a : b);
      return { label: `${worst.subject} — ${worst.subtopic}`, subject: worst.subject, pct: Math.round(worst.score * 100) };
    }
    if (scoredSubjects.length > 0) {
      return { label: scoredSubjects[0].subject, subject: scoredSubjects[0].subject, pct: scoredSubjects[0].pct };
    }
    return null;
  }, [proficiencyData, scoredSubjects]);

  // Difficult topics
  const difficultTopics = useMemo(() => {
    const realSubtopics = proficiencyData.filter(
      (p) => p.subtopic && p.subtopic !== "geral" && p.subtopic.trim() !== "" && p.score < 0.5
    );
    if (realSubtopics.length > 0) {
      const seen = new Set<string>();
      return realSubtopics.sort((a, b) => a.score - b.score).filter((p) => {
        const key = `${p.subject}-${p.subtopic}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 5).map((p) => ({ label: `${p.subject} — ${p.subtopic}`, pct: Math.round(p.score * 100) }));
    }
    return subjectScores.filter((s) => s.pct >= 0 && s.pct < 50).slice(0, 5).map((s) => ({ label: s.subject, pct: s.pct }));
  }, [proficiencyData, subjectScores]);

  // Chart data
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

  // Pass probability
  const latestScores = subjects.map((s) => {
    const subjectRows = proficiencyData.filter((p) => p.subject === s);
    return subjectRows.length > 0 ? subjectRows.reduce((sum, r) => sum + r.score, 0) / subjectRows.length : 0;
  });
  const passProb = latestScores.length > 0 ? Math.round((latestScores.reduce((a, b) => a + b, 0) / latestScores.length) * 100) : 0;
  const probColor = passProb >= 70 ? "text-green-600" : passProb >= 40 ? "text-yellow-600" : "text-red-600";
  const probBg = passProb >= 70 ? "bg-green-50" : passProb >= 40 ? "bg-yellow-50" : "bg-red-50";

  const hasData = proficiencyData.length > 0;
  const hasEnoughData = totalAnswered >= 10;

  // Attack plan — specific and actionable
  const attackPlan = useMemo(() => {
    const items: string[] = [];
    const withData = subjectScores.filter(s => s.pct >= 0);

    // 1. Improve worst subject with concrete target
    if (withData.length > 0 && withData[0].pct < 50) {
      const target = Math.min(withData[0].pct + 10, 50);
      items.push(`Levar ${withData[0].subject} de ${withData[0].pct}% para ${target}%`);
    }

    // 2. Unlock requirement or daily routine
    if (!canShowProbability) {
      const remaining = Math.max(0, 60 - totalAnswered);
      if (remaining > 0) {
        items.push(`Resolver ${Math.min(remaining, 15)} questões hoje`);
      }
      if (regenerations < 1) {
        items.push("Completar 1 regeneração do plano de estudo");
      }
    }

    // 3. Routine action fallback
    if (items.length < 3 && difficultTopics.length > 0) {
      items.push(`Revisar erros em ${difficultTopics[0].label.split(" — ")[0]}`);
    }
    if (items.length === 0) {
      items.push("Manter o ritmo com pelo menos 1 missão hoje");
    }

    return items.slice(0, 3);
  }, [subjectScores, difficultTopics, canShowProbability, totalAnswered, regenerations]);

  const hintVals = { weekCompleted: weekCompletedMissions, weekTotal: weekTotalMissions, accuracy: weekAccuracy, totalAnswered, streak: currentStreak };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/60 pb-20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-6xl mx-auto flex h-14 items-center gap-3 px-4 lg:px-8">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="text-base font-semibold text-foreground">Desempenho</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 lg:px-8 py-5">
        {!hasData ? (
          <div className="text-center py-16 animate-fade-in">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Resolva algumas questões primeiro</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
              Faça o diagnóstico ou missões para ver seus dados aqui.
            </p>
            <Link to="/study" className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
              Começar agora <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            {/* ─── HERO ─── */}
            <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5 lg:px-8 lg:py-6 animate-fade-in">
              {canShowProbability ? (
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seu posicionamento hoje</p>
                    <p className="text-lg font-bold text-foreground mt-1">Comparação competitiva disponível em breve</p>
                    <p className="text-sm text-muted-foreground mt-1">Estamos coletando dados para calcular sua posição real.</p>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground lg:text-right">
                    {renderCheckInline(totalAnswered >= 60, `${totalAnswered}/60 questões`)}
                    {renderCheckInline(subjectsCovered >= 4, `${subjectsCovered}/4 matérias`)}
                    {renderCheckInline(regenerations >= 1, `${regenerations}/1 regeneração`)}
                    {renderCheckInline(daysStudied >= 7, `${daysStudied}/7 dias`)}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="lg:max-w-lg">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seu posicionamento hoje</p>
                    <p className="text-lg font-bold text-foreground mt-1">Ainda em construção</p>
                    <p className="text-sm text-muted-foreground mt-1">Complete os requisitos para comparar com outros alunos.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                      {renderCheckInline(totalAnswered >= 60, `${totalAnswered}/60 questões`)}
                      {renderCheckInline(subjectsCovered >= 4, `${subjectsCovered}/4 matérias`)}
                      {renderCheckInline(regenerations >= 1, `${regenerations}/1 regeneração`)}
                      {renderCheckInline(daysStudied >= 7, `${daysStudied}/7 dias`)}
                    </div>
                    <Link to="/study" className="self-start inline-flex items-center gap-2 px-4 py-2 bg-foreground text-white rounded-full text-xs font-medium hover:opacity-90 transition-opacity mt-1">
                      Continuar estudando <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Metrics Grid ─── */}
            {hasEnoughData && (
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 animate-fade-in" style={{ animationDelay: "0.05s" }}>
                <MetricCard
                  value={`${weekCompletedMissions}/${weekTotalMissions}`}
                  label="Missões (7d)"
                  hint={metricHint("missions", hintVals)}
                />
                <MetricCard
                  value={`${weekAccuracy}%`}
                  label="Acerto (7d)"
                  hint={metricHint("accuracy", hintVals)}
                />
                <MetricCard
                  value={String(totalQuestionsAnswered)}
                  label="Total de questões"
                  hint={metricHint("questions", hintVals)}
                />
                <MetricCard
                  value={String(currentStreak)}
                  label="Dias seguidos"
                  hint={metricHint("streak", hintVals)}
                  icon={<Flame className="h-3.5 w-3.5 text-orange-500" />}
                />
              </div>
            )}

            {/* ─── Main 2-col Grid ─── */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* LEFT — 3/5 */}
              <div className="lg:col-span-3 space-y-4">
                {/* Maior Gargalo */}
                {worstArea && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.1s" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-7 w-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                            <Target className="h-4 w-4 text-red-500" />
                          </div>
                          <h2 className="text-sm font-semibold text-foreground">Seu maior gargalo</h2>
                        </div>
                        <p className="text-base font-bold text-foreground">{worstArea.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {worstArea.subject} está segurando sua evolução — é a área que mais reduz sua estimativa.
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold text-red-600">{worstArea.pct}%</p>
                        <Link to="/study" className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-foreground text-white rounded-full text-xs font-medium hover:opacity-90 transition-opacity">
                          Praticar {worstArea.subject.split(" — ")[0]}
                        </Link>
                      </div>
                    </div>
                  </div>
                )}

                {/* Desempenho por Matéria */}
                {subjectScores.some(s => s.pct >= 0) && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.15s" }}>
                    <h2 className="text-sm font-semibold text-foreground mb-3">Desempenho por matéria</h2>
                    <div className="space-y-1.5">
                      {subjectScores.map((s) => {
                        const isWorst = s.subject === worstSubjectName && s.pct >= 0;
                        const isBest = s.subject === bestSubjectName && s.pct >= 0 && bestSubjectName !== worstSubjectName;
                        return (
                          <div key={s.subject} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isWorst ? "bg-red-50/60" : isBest ? "bg-green-50/60" : ""}`}>
                            <span className={`text-[13px] w-24 shrink-0 truncate ${isWorst ? "font-bold text-red-700" : isBest ? "font-bold text-green-700" : "font-medium text-foreground"}`}>
                              {s.subject}
                            </span>
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              {s.pct >= 0 && (
                                <div className={`h-2 rounded-full transition-all duration-700 ${barColor(s.pct)}`} style={{ width: `${s.pct}%` }} />
                              )}
                            </div>
                            {s.pct >= 0 ? (
                              <span className={`text-[13px] font-semibold w-10 text-right tabular-nums ${isWorst ? "text-red-700" : isBest ? "text-green-700" : "text-foreground"}`}>
                                {s.pct}%
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground w-10 text-right">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT — 2/5 */}
              <div className="lg:col-span-2 space-y-4">
                {/* Estimativa de Aprovação */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.2s" }}>
                  {canShowProbability ? (
                    <>
                      <h2 className="text-sm font-semibold text-foreground mb-3">Estimativa de Aprovação</h2>
                      <div className="text-center py-3">
                        <div className={`inline-flex items-center justify-center h-[72px] w-[72px] rounded-full ${probBg} ${probColor} text-2xl font-bold`}>
                          {passProb}%
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Posição atual — evolui com a prática</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <h2 className="text-sm font-semibold text-foreground">Destrave sua estimativa</h2>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Veja sua posição e acompanhe sua evolução com mais precisão.
                      </p>
                      <div className="space-y-1.5 bg-gray-50 rounded-xl p-3">
                        {renderCheckItem(totalAnswered >= 60, `${totalAnswered}/60 questões respondidas`)}
                        {renderCheckItem(subjectsCovered >= 4, `${subjectsCovered}/4 matérias cobertas`)}
                        {renderCheckItem(regenerations >= 1, `${regenerations}/1 regeneração do plano`)}
                      </div>
                    </>
                  )}
                </div>

                {/* Plano de Ataque */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.25s" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-7 w-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <Zap className="h-4 w-4 text-amber-500" />
                    </div>
                    <h2 className="text-sm font-semibold text-foreground">Plano de ataque</h2>
                  </div>
                  <div className="space-y-2">
                    {attackPlan.map((text, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="h-5 w-5 rounded-full bg-foreground text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-[13px] text-foreground leading-snug">{text}</p>
                      </div>
                    ))}
                  </div>
                  <Link to="/study" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Ver missões <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>

            {/* ─── Below-grid blocks ─── */}

            {examHistory.length > 0 && (
              <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <h2 className="text-sm font-semibold text-foreground mb-3">Últimos Simulados</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {examHistory.map((e, i) => {
                    const c = e.score_percent >= 70 ? "text-green-700 bg-green-50" : e.score_percent >= 40 ? "text-yellow-700 bg-yellow-50" : "text-red-700 bg-red-50";
                    return (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{e.exam_name}</p>
                          <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString("pt-BR")}</p>
                        </div>
                        <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${c}`}>{Math.round(e.score_percent)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {chartData.length > 1 && totalAnswered >= 50 && (
              <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.35s" }}>
                <h2 className="text-sm font-semibold text-foreground mb-3">Evolução por matéria</h2>
                <div className="flex gap-2 mb-3 overflow-x-auto">
                  {subjectFilters.map((s) => (
                    <button key={s} onClick={() => setSelectedSubject(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
                        selectedSubject === s ? "bg-foreground text-white" : "bg-gray-50 border border-gray-200 text-foreground"
                      }`}>
                      {s === "all" ? "Todas" : s}
                    </button>
                  ))}
                </div>
                <div className="bg-gray-50 rounded-xl p-3 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip />
                      {subjects.filter((s) => selectedSubject === "all" || selectedSubject === s).map((s) => (
                        <Line key={s} type="monotone" dataKey={s} stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} name={s} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

/* ─── Helpers ─── */

function renderCheckItem(done: boolean, text: string) {
  return (
    <div className="flex items-center gap-2">
      {done ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      <span className={`text-xs ${done ? "text-foreground" : "text-muted-foreground"}`}>{text}</span>
    </div>
  );
}

function renderCheckInline(done: boolean, text: string) {
  return (
    <span className="inline-flex items-center gap-1">
      {done ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Circle className="h-3 w-3 text-muted-foreground" />}
      <span className={done ? "text-foreground" : "text-muted-foreground"}>{text}</span>
    </span>
  );
}

function MetricCard({ value, label, hint, icon }: { value: string; label: string; hint: string; icon?: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3 bg-white rounded-xl border border-gray-100">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-base font-bold text-foreground tabular-nums">{value}</p>
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
      <p className="text-[10px] font-medium text-muted-foreground/70 mt-1">{hint}</p>
    </div>
  );
}

export default Performance;
