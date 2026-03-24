import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Flame, CheckCircle2, Circle, BookOpen, TrendingUp, TrendingDown, Minus, Target, Zap, ArrowRight, Lock, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ProficiencyRow { subject: string; subtopic: string; score: number; measured_at: string; source: string; }
interface MissionRow { status: string; score: number | null; date: string; }
interface RecentAnswer { is_correct: boolean; subject: string; created_at: string; }

const ALL_SUBJECTS = ["Português", "Matemática", "História", "Geografia", "Biologia", "Física", "Química", "Inglês", "Filosofia"];
const RECENT_WINDOW = 25; // last N answers per subject for accuracy
const LOW_CONFIDENCE_THRESHOLD = 5;

function barColor(pct: number): string {
  if (pct >= 70) return "bg-green-500";
  if (pct >= 40) return "bg-amber-400";
  return "bg-red-500";
}

function barTrackColor(pct: number): string {
  if (pct >= 70) return "bg-green-100";
  if (pct >= 40) return "bg-amber-100";
  return "bg-red-100";
}

interface SubjectScore {
  subject: string;
  pct: number;
  total: number;
  lowConfidence: boolean;
  trend: "up" | "down" | "stable" | null;
}

function metricHint(key: "missions" | "accuracy" | "questions" | "streak", v: { weekCompleted: number; weekTotal: number; accuracy: number; totalAnswered: number; streak: number }): string {
  switch (key) {
    case "missions":
      if (v.weekTotal === 0) return "nenhuma ainda";
      if (v.weekCompleted >= v.weekTotal) return "semana completa";
      if (v.weekCompleted / v.weekTotal >= 0.6) return "bom ritmo";
      return "abaixo do ritmo";
    case "accuracy":
      if (v.accuracy >= 75) return "acima da média";
      if (v.accuracy >= 50) return "na média";
      if (v.accuracy > 0) return "precisa melhorar";
      return "sem dados";
    case "questions": {
      const r = Math.max(0, 60 - v.totalAnswered);
      if (r > 0) return `faltam ${r} p/ estimativa`;
      return "estimativa liberada";
    }
    case "streak":
      if (v.streak >= 7) return "consistência forte";
      if (v.streak >= 3) return "mantendo ritmo";
      if (v.streak >= 1) return "não pare agora";
      return "comece hoje";
  }
}

const Performance = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [loading, setLoading] = useState(true);
  const [proficiencyData, setProficiencyData] = useState<ProficiencyRow[]>([]);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [recentAnswers, setRecentAnswers] = useState<RecentAnswer[]>([]);
  const [examHistory, setExamHistory] = useState<{ exam_name: string; score_percent: number; created_at: string }[]>([]);
  const [profileStats, setProfileStats] = useState<{ total_xp: number; current_streak: number; longest_streak: number; missions_completed: number } | null>(null);

  // Gate data
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [subjectsCovered, setSubjectsCovered] = useState(0);
  const [planUpdates, setPlanUpdates] = useState(0);
  const [daysStudied, setDaysStudied] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      const { data: profData } = await supabase.from("proficiency_scores").select("subject, subtopic, score, measured_at, source").eq("user_id", user.id).order("measured_at", { ascending: true });
      if (profData) setProficiencyData(profData);

      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: missionData } = await supabase.from("daily_missions").select("status, score, date").eq("user_id", user.id).gte("date", weekAgo.toISOString().split("T")[0]);
      if (missionData) setMissions(missionData);

      // Fetch recent answers with question subject via join
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

      const { data: profileStatsData } = await supabase.from("profiles").select("total_xp, current_streak, longest_streak, missions_completed").eq("id", user.id).single();
      if (profileStatsData) setProfileStats(profileStatsData);

      // Gate data
      const { count: totalCount } = await supabase.from("answer_history").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      setTotalAnswered(totalCount || 0);

      const distinctSubjects = new Set((profData || []).map(p => p.subject));
      setSubjectsCovered(distinctSubjects.size);

      const { count: supersededCount } = await supabase.from("study_plans").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "superseded");
      setPlanUpdates(supersededCount || 0);

      const { data: allAnswers } = await supabase.from("answer_history").select("created_at").eq("user_id", user.id);
      if (allAnswers) {
        const uniqueDays = new Set(allAnswers.map(a => new Date(a.created_at).toISOString().split("T")[0]));
        setDaysStudied(uniqueDays.size);
      }

      setLoading(false);
    };
    fetchAll();
  }, [user]);

  // ─── Computed ────────────────────────────────────────────

  const weekCompletedMissions = missions.filter((m) => m.status === "completed").length;
  const weekTotalMissions = missions.length;
  const weekAnswers = recentAnswers.filter(a => {
    const d = new Date(a.created_at);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  });
  const weekAccuracy = weekAnswers.length > 0 ? Math.round((weekAnswers.filter(a => a.is_correct).length / weekAnswers.length) * 100) : 0;
  const currentStreak = profileStats?.current_streak || 0;

  const subjects = useMemo(() => [...new Set(proficiencyData.map((p) => p.subject))], [proficiencyData]);
  const subjectFilters = ["all", ...subjects];

  const canShowProbability = totalAnswered >= 60 && subjectsCovered >= 4 && planUpdates >= 1;

  // Unified unlock requirements
  const unlockReqs = useMemo(() => [
    { done: totalAnswered >= 60, text: `${totalAnswered}/60 questões respondidas` },
    { done: subjectsCovered >= 4, text: `${subjectsCovered}/4 matérias cobertas` },
    { done: planUpdates >= 1, text: `${planUpdates}/1 atualização do plano` },
    { done: daysStudied >= 7, text: `${daysStudied}/7 dias estudados` },
  ], [totalAnswered, subjectsCovered, planUpdates, daysStudied]);

  // Subject scores based on recent answer accuracy (last RECENT_WINDOW per subject)
  const subjectScores: SubjectScore[] = useMemo(() => {
    return ALL_SUBJECTS.map((s) => {
      const subjectAnswers = recentAnswers.filter(a => a.subject === s);
      const recent = subjectAnswers.slice(0, RECENT_WINDOW);
      if (recent.length === 0) return { subject: s, pct: -1, total: 0, lowConfidence: true, trend: null };

      const pct = Math.round((recent.filter(a => a.is_correct).length / recent.length) * 100);
      const lowConfidence = recent.length < LOW_CONFIDENCE_THRESHOLD;

      // Trend: compare first half vs second half of recent answers
      let trend: "up" | "down" | "stable" | null = null;
      if (recent.length >= 10) {
        const half = Math.floor(recent.length / 2);
        const olderHalf = recent.slice(half); // older (answers are desc)
        const newerHalf = recent.slice(0, half); // newer
        const olderAcc = olderHalf.filter(a => a.is_correct).length / olderHalf.length;
        const newerAcc = newerHalf.filter(a => a.is_correct).length / newerHalf.length;
        const diff = newerAcc - olderAcc;
        if (diff > 0.08) trend = "up";
        else if (diff < -0.08) trend = "down";
        else trend = "stable";
      }

      return { subject: s, pct, total: recent.length, lowConfidence, trend };
    }).sort((a, b) => {
      if (a.pct === -1 && b.pct === -1) return 0;
      if (a.pct === -1) return 1;
      if (b.pct === -1) return -1;
      return a.pct - b.pct;
    });
  }, [recentAnswers]);

  const scoredSubjects = subjectScores.filter(s => s.pct >= 0);
  const worstSubjectName = scoredSubjects.length > 0 ? scoredSubjects[0].subject : null;
  const bestSubjectName = scoredSubjects.length > 0 ? scoredSubjects[scoredSubjects.length - 1].subject : null;

  // Worst area for gargalo
  const worstArea = useMemo(() => {
    if (scoredSubjects.length === 0) return null;
    const w = scoredSubjects[0];
    return { label: w.subject, pct: w.pct, total: w.total };
  }, [scoredSubjects]);

  // Chart data (still from proficiency_scores for evolution tracking)
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

  const hasData = proficiencyData.length > 0 || recentAnswers.length > 0;
  const hasEnoughData = totalAnswered >= 10;

  // Attack plan — specific, actionable, clickable
  const attackPlan = useMemo(() => {
    const items: { text: string; to: string }[] = [];

    // 1. Improve worst subject
    if (scoredSubjects.length > 0 && scoredSubjects[0].pct < 50) {
      const w = scoredSubjects[0];
      const target = Math.min(w.pct + 10, 50);
      items.push({ text: `Levar ${w.subject} de ${w.pct}% para ${target}%`, to: "/study" });
    }

    // 2. Unlock requirement or daily routine
    if (!canShowProbability) {
      const remaining = Math.max(0, 60 - totalAnswered);
      if (remaining > 0) {
        items.push({ text: `Resolver ${Math.min(remaining, 15)} questões hoje`, to: "/study" });
      }
      if (planUpdates < 1) {
        items.push({ text: "Atualizar seu plano de estudos", to: "/study" });
      }
    }

    // 3. Retention item
    if (currentStreak < 2) {
      items.push({ text: "Estudar 2 dias seguidos para criar ritmo", to: "/study" });
    } else if (items.length < 3) {
      items.push({ text: "Completar a missão de hoje", to: "/study" });
    }

    if (items.length === 0) {
      items.push({ text: "Completar a missão de hoje", to: "/study" });
    }

    return items.slice(0, 3);
  }, [scoredSubjects, canShowProbability, totalAnswered, planUpdates, currentStreak]);

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
            <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 lg:px-7 lg:py-5 animate-fade-in">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="lg:max-w-md">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Seu posicionamento hoje</p>
                  {canShowProbability ? (
                    <>
                      <p className="text-lg font-bold text-foreground mt-0.5">Ranking disponível em breve</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Coletando dados para calcular sua posição real.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-bold text-foreground mt-0.5">Ainda em construção</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Complete os requisitos para comparar com outros alunos.</p>
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    {unlockReqs.map((r, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        {r.done ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Circle className="h-3 w-3 text-muted-foreground" />}
                        <span className={r.done ? "text-foreground" : "text-muted-foreground"}>{r.text}</span>
                      </span>
                    ))}
                  </div>
                  {!canShowProbability && (
                    <Link to="/study" className="self-start inline-flex items-center gap-1.5 px-4 py-1.5 bg-foreground text-white rounded-full text-xs font-medium hover:opacity-90 transition-opacity">
                      Continuar estudando <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* ─── Metrics ─── */}
            {hasEnoughData && (
              <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2 animate-fade-in" style={{ animationDelay: "0.05s" }}>
                <MetricCard value={`${weekCompletedMissions}/${weekTotalMissions}`} label="Missões (7d)" hint={metricHint("missions", hintVals)} />
                <MetricCard value={`${weekAccuracy}%`} label="Acerto (7d)" hint={metricHint("accuracy", hintVals)} />
                <MetricCard value={String(totalAnswered)} label="Total de questões" hint={metricHint("questions", hintVals)} />
                <MetricCard value={String(currentStreak)} label="Dias seguidos" hint={metricHint("streak", hintVals)} icon={<Flame className="h-3.5 w-3.5 text-orange-500" />} />
              </div>
            )}

            {/* ─── Main 2-col Grid ─── */}
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-5 gap-3">
              {/* LEFT — 3/5 */}
              <div className="lg:col-span-3 space-y-3">
                {/* Maior Gargalo */}
                {worstArea && worstArea.pct < 60 && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.1s" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="h-6 w-6 rounded-md bg-red-50 flex items-center justify-center shrink-0">
                            <Target className="h-3.5 w-3.5 text-red-500" />
                          </div>
                          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Seu maior gargalo</h2>
                        </div>
                        <p className="text-base font-bold text-foreground">{worstArea.label} está segurando sua evolução</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          É a matéria que mais reduz sua estimativa hoje.
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold text-red-600">{worstArea.pct}%</p>
                        <p className="text-[10px] text-muted-foreground">
                          {worstArea.total < LOW_CONFIDENCE_THRESHOLD ? "poucos dados" : `últimas ${worstArea.total} questões`}
                        </p>
                        <Link to="/study" className="mt-1.5 inline-flex items-center gap-1 px-3 py-1.5 bg-foreground text-white rounded-full text-[11px] font-medium hover:opacity-90 transition-opacity">
                          Praticar {worstArea.label}
                        </Link>
                      </div>
                    </div>
                  </div>
                )}

                {/* Desempenho por Matéria */}
                {scoredSubjects.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.15s" }}>
                    <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Desempenho por matéria</h2>
                    <div className="space-y-0.5">
                      {subjectScores.map((s) => {
                        const isWorst = s.subject === worstSubjectName && s.pct >= 0;
                        const isBest = s.subject === bestSubjectName && s.pct >= 0 && bestSubjectName !== worstSubjectName;
                        return (
                          <div key={s.subject} className={`px-3 py-2.5 rounded-lg transition-colors ${isWorst ? "bg-red-50/60" : isBest ? "bg-green-50/60" : ""}`}>
                            <div className="flex items-center gap-3">
                              <span className={`text-[13px] w-24 shrink-0 truncate ${isWorst ? "font-bold text-red-700" : isBest ? "font-bold text-green-700" : "font-medium text-foreground"}`}>
                                {s.subject}
                              </span>
                              <div className={`flex-1 h-2 rounded-full overflow-hidden ${s.pct >= 0 ? barTrackColor(s.pct) : "bg-gray-100"}`}>
                                {s.pct >= 0 && (
                                  <div className={`h-2 rounded-full transition-all duration-700 ${barColor(s.pct)}`} style={{ width: `${s.pct}%` }} />
                                )}
                              </div>
                              {s.pct >= 0 ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className={`text-[13px] font-semibold w-9 text-right tabular-nums ${isWorst ? "text-red-700" : isBest ? "text-green-700" : "text-foreground"}`}>
                                    {s.pct}%
                                  </span>
                                  {s.trend === "up" && <TrendingUp className="h-3 w-3 text-green-500" />}
                                  {s.trend === "down" && <TrendingDown className="h-3 w-3 text-red-500" />}
                                  {s.trend === "stable" && <Minus className="h-3 w-3 text-muted-foreground" />}
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground shrink-0">—</span>
                              )}
                            </div>
                            {/* Context line */}
                            {s.pct >= 0 && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 ml-[calc(6rem+0.75rem)]">
                                {s.lowConfidence
                                  ? "Poucos dados ainda — continue praticando"
                                  : `Baseado nas últimas ${s.total} questões`}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT — 2/5 */}
              <div className="lg:col-span-2 space-y-3">
                {/* Estimativa de Aprovação */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.2s" }}>
                  {canShowProbability ? (
                    <>
                      <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Estimativa de Aprovação</h2>
                      <div className="text-center py-2">
                        <div className={`inline-flex items-center justify-center h-[68px] w-[68px] rounded-full ${probBg} ${probColor} text-2xl font-bold`}>
                          {passProb}%
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">Posição atual — evolui com a prática</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="h-6 w-6 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Destrave sua estimativa</h2>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Acompanhe sua evolução e veja sua posição com mais precisão.
                      </p>
                      <div className="space-y-1.5 bg-gray-50 rounded-xl p-3">
                        {unlockReqs.map((r, i) => (
                          <div key={i} className="flex items-center gap-2">
                            {r.done ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            <span className={`text-[11px] ${r.done ? "text-foreground" : "text-muted-foreground"}`}>{r.text}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Plano de Ataque */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.25s" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-6 w-6 rounded-md bg-amber-50 flex items-center justify-center shrink-0">
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Plano de ataque</h2>
                  </div>
                  <div className="space-y-1.5">
                    {attackPlan.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => navigate(item.to)}
                        className="w-full flex items-center gap-2.5 p-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors text-left group"
                      >
                        <span className="h-5 w-5 rounded-full bg-foreground text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                          {i + 1}
                        </span>
                        <p className="text-[13px] text-foreground leading-snug flex-1">{item.text}</p>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Below-grid ─── */}

            {examHistory.length > 0 && (
              <div className="mt-3 bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Últimos Simulados</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {examHistory.map((e, i) => {
                    const c = e.score_percent >= 70 ? "text-green-700 bg-green-50" : e.score_percent >= 40 ? "text-yellow-700 bg-yellow-50" : "text-red-700 bg-red-50";
                    return (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{e.exam_name}</p>
                          <p className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleDateString("pt-BR")}</p>
                        </div>
                        <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${c}`}>{Math.round(e.score_percent)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {chartData.length > 1 && totalAnswered >= 50 && (
              <div className="mt-3 bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 animate-fade-in" style={{ animationDelay: "0.35s" }}>
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Evolução por matéria</h2>
                <div className="flex gap-1.5 mb-3 overflow-x-auto">
                  {subjectFilters.map((s) => (
                    <button key={s} onClick={() => setSelectedSubject(s)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 ${
                        selectedSubject === s ? "bg-foreground text-white" : "bg-gray-50 border border-gray-200 text-foreground"
                      }`}>
                      {s === "all" ? "Todas" : s}
                    </button>
                  ))}
                </div>
                <div className="bg-gray-50 rounded-xl p-3 h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
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

function MetricCard({ value, label, hint, icon }: { value: string; label: string; hint: string; icon?: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5 bg-white rounded-xl border border-gray-100">
      <div className="flex items-center gap-1">
        {icon}
        <p className="text-base font-bold text-foreground tabular-nums">{value}</p>
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <p className="text-[10px] font-medium text-muted-foreground/70 mt-0.5">{hint}</p>
    </div>
  );
}

export default Performance;
