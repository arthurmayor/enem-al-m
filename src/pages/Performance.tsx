import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Flame, CheckCircle2, Circle, BookOpen, TrendingUp, TrendingDown, Minus, Target, Zap, ArrowRight } from "lucide-react";
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
  if (pct >= 40) return "bg-yellow-500";
  return "bg-red-500";
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

      // Gate data
      const { count: totalCount } = await supabase.from("answer_history").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      setTotalAnswered(totalCount || 0);

      const distinctSubjects = new Set((profData || []).map(p => p.subject));
      setSubjectsCovered(distinctSubjects.size);

      const { count: supersededCount } = await supabase.from("study_plans").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "superseded");
      setRegenerations(supersededCount || 0);

      // Days studied: count distinct dates from answer_history
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

  // Subject scores (latest average per subject), sorted worst-first
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
      return a.pct - b.pct; // worst first
    });
  }, [proficiencyData]);

  // Worst subject/subtopic for "maior gargalo"
  const worstArea = useMemo(() => {
    // Try real subtopics first
    const realSubtopics = proficiencyData.filter(
      (p) => p.subtopic && p.subtopic !== "geral" && p.subtopic.trim() !== ""
    );
    if (realSubtopics.length > 0) {
      const worst = realSubtopics.reduce((a, b) => a.score < b.score ? a : b);
      return { label: `${worst.subject} — ${worst.subtopic}`, pct: Math.round(worst.score * 100) };
    }
    // Fallback to worst subject
    const withData = subjectScores.filter(s => s.pct >= 0);
    if (withData.length > 0) {
      return { label: withData[0].subject, pct: withData[0].pct };
    }
    return null;
  }, [proficiencyData, subjectScores]);

  // Topics with difficulty
  const difficultTopics = useMemo(() => {
    const realSubtopics = proficiencyData.filter(
      (p) => p.subtopic && p.subtopic !== "geral" && p.subtopic.trim() !== "" && p.score < 0.5
    );

    if (realSubtopics.length > 0) {
      const seen = new Set<string>();
      return realSubtopics
        .sort((a, b) => a.score - b.score)
        .filter((p) => {
          const key = `${p.subject}-${p.subtopic}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 5)
        .map((p) => ({
          label: `${p.subject} — ${p.subtopic}`,
          pct: Math.round(p.score * 100),
        }));
    }

    return subjectScores
      .filter((s) => s.pct >= 0 && s.pct < 50)
      .slice(0, 5)
      .map((s) => ({
        label: s.subject,
        pct: s.pct,
      }));
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

  // Attack plan items
  const attackPlan = useMemo(() => {
    const items: { text: string; icon: typeof Target }[] = [];
    // Worst subject
    const withData = subjectScores.filter(s => s.pct >= 0);
    if (withData.length > 0 && withData[0].pct < 50) {
      items.push({ text: `Subir ${withData[0].subject} acima de ${Math.min(withData[0].pct + 15, 50)}%`, icon: TrendingUp });
    }
    // Review errors
    if (difficultTopics.length > 0) {
      items.push({ text: `Revisar erros em ${difficultTopics[0].label.split(" — ")[0]}`, icon: Target });
    }
    // Unlock estimate
    if (!canShowProbability) {
      const remaining = Math.max(0, 60 - totalAnswered);
      if (remaining > 0) {
        items.push({ text: `Fechar +${remaining} questões para liberar sua estimativa completa`, icon: Zap });
      }
    }
    // Fallback
    if (items.length === 0) {
      items.push({ text: "Continue praticando para manter sua evolução", icon: TrendingUp });
    }
    return items.slice(0, 3);
  }, [subjectScores, difficultTopics, canShowProbability, totalAnswered]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-6xl mx-auto flex h-14 items-center gap-3 px-4 lg:px-8">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="text-base font-semibold text-foreground">Desempenho</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 lg:px-8 py-6">
        {!hasData ? (
          <div className="text-center py-16 animate-fade-in">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Complete mais missões para ver seu desempenho</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
              Faça o diagnóstico e resolva algumas missões para acompanhar suas estatísticas.
            </p>
            <Link to="/study" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-foreground">
              Ir para Estudar
            </Link>
          </div>
        ) : (
          <>
            {/* ─── HERO: Posicionamento ─── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 lg:p-8 animate-fade-in">
              {canShowProbability ? (
                /* Estado B — posicionamento disponível */
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Seu posicionamento hoje</p>
                  <p className="text-3xl font-bold text-foreground">Comparação competitiva disponível em breve</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Estamos coletando dados para calcular seu posicionamento real entre os alunos.
                  </p>

                  {/* Checklist for full estimate */}
                  <div className="mt-6 bg-gray-50 rounded-xl p-4 max-w-md mx-auto text-left">
                    <p className="text-xs font-semibold text-foreground mb-3">Progresso para estimativa completa:</p>
                    <div className="space-y-2">
                      {renderCheckItem(totalAnswered >= 60, `${totalAnswered}/60 questões respondidas`)}
                      {renderCheckItem(subjectsCovered >= 4, `${subjectsCovered}/4 matérias cobertas`)}
                      {renderCheckItem(regenerations >= 1, `${regenerations}/1 regeneração de plano`)}
                      {renderCheckItem(daysStudied >= 7, `${daysStudied}/7 dias estudados`)}
                    </div>
                  </div>
                </div>
              ) : (
                /* Estado A — posicionamento em construção */
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Seu posicionamento hoje</p>
                  <p className="text-xl font-bold text-foreground">Seu posicionamento ainda está em construção</p>
                  <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                    Complete mais questões para comparar seu desempenho com outros alunos.
                  </p>

                  {/* Unlock checklist */}
                  <div className="mt-6 bg-gray-50 rounded-xl p-4 max-w-md mx-auto text-left">
                    <p className="text-xs font-semibold text-foreground mb-3">Para liberar seu posicionamento:</p>
                    <div className="space-y-2">
                      {renderCheckItem(totalAnswered >= 60, `${totalAnswered}/60 questões respondidas`)}
                      {renderCheckItem(subjectsCovered >= 4, `${subjectsCovered}/4 matérias cobertas`)}
                      {renderCheckItem(regenerations >= 1, `${regenerations}/1 regeneração de plano`)}
                      {renderCheckItem(daysStudied >= 7, `${daysStudied}/7 dias estudados`)}
                    </div>
                  </div>

                  <Link to="/study" className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
                    Continuar estudando
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>

            {/* ─── Metrics Grid (4 cards) ─── */}
            {hasEnoughData && (
              <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in" style={{ animationDelay: "0.1s" }}>
                <MetricCard value={`${weekCompletedMissions}/${weekTotalMissions}`} label="Missões esta semana" />
                <MetricCard value={`${weekAccuracy}%`} label="Taxa de acerto (7d)" />
                <MetricCard value={String(totalQuestionsAnswered)} label="Questões respondidas" />
                <MetricCard value={String(currentStreak)} label="Dias seguidos" icon={<Flame className="h-4 w-4 text-orange-500" />} />
              </div>
            )}

            {/* ─── Main Grid: 2 columns on desktop ─── */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* LEFT COLUMN */}
              <div className="space-y-6">
                {/* Insight: Maior Gargalo */}
                {worstArea && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-fade-in" style={{ animationDelay: "0.15s" }}>
                    <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Target className="h-4 w-4 text-red-500" />
                      Seu maior gargalo hoje
                    </h2>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base font-semibold text-foreground">{worstArea.label}</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">{worstArea.pct}%</p>
                      </div>
                      <Link to="/study" className="px-4 py-2 bg-foreground text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
                        Praticar agora
                      </Link>
                    </div>
                  </div>
                )}

                {/* Desempenho por Matéria */}
                {subjectScores.some(s => s.pct >= 0) && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-fade-in" style={{ animationDelay: "0.2s" }}>
                    <h2 className="text-sm font-semibold text-foreground mb-4">Desempenho por matéria</h2>
                    <div className="space-y-2">
                      {subjectScores.map((s) => (
                        <div key={s.subject} className="flex items-center gap-3">
                          <span className="text-sm font-medium text-foreground w-24 shrink-0 truncate">{s.subject}</span>
                          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            {s.pct >= 0 ? (
                              <div
                                className={`h-2.5 rounded-full transition-all duration-700 ${barColor(s.pct)}`}
                                style={{ width: `${s.pct}%` }}
                              />
                            ) : null}
                          </div>
                          {s.pct >= 0 ? (
                            <span className="text-sm font-semibold text-foreground w-10 text-right">{s.pct}%</span>
                          ) : (
                            <span className="text-xs text-muted-foreground w-10 text-right">—</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN */}
              <div className="space-y-6">
                {/* Estimativa de Aprovação */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-fade-in" style={{ animationDelay: "0.25s" }}>
                  <h2 className="text-sm font-semibold text-foreground mb-3">Estimativa de Aprovação</h2>
                  {canShowProbability ? (
                    <div className="text-center py-4">
                      <div className={`inline-flex items-center justify-center h-20 w-20 rounded-full ${probBg} ${probColor} text-2xl font-bold`}>
                        {passProb}%
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">Posição atual — evolui com a prática</p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                          <span className="text-lg text-muted-foreground">?</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Estimativa bloqueada</p>
                          <p className="text-xs text-muted-foreground">Complete os requisitos abaixo</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {renderCheckItem(totalAnswered >= 60, `${totalAnswered}/60 questões`)}
                        {renderCheckItem(subjectsCovered >= 4, `${subjectsCovered}/4 matérias`)}
                        {renderCheckItem(regenerations >= 1, `${regenerations}/1 regeneração`)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Plano de Ataque */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                  <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Plano de ataque
                  </h2>
                  <div className="space-y-3">
                    {attackPlan.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="h-6 w-6 rounded-full bg-foreground text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <p className="text-sm text-foreground">{item.text}</p>
                      </div>
                    ))}
                  </div>
                  <Link to="/study" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline">
                    Ver missões <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>

            {/* ─── Additional blocks below grid ─── */}

            {/* Últimos Simulados */}
            {examHistory.length > 0 && (
              <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-5 animate-fade-in" style={{ animationDelay: "0.35s" }}>
                <h2 className="text-sm font-semibold text-foreground mb-4">Últimos Simulados</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {examHistory.map((e, i) => {
                    const c = e.score_percent >= 70 ? "text-green-700 bg-green-50" : e.score_percent >= 40 ? "text-yellow-700 bg-yellow-50" : "text-red-700 bg-red-50";
                    return (
                      <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{e.exam_name}</p>
                          <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString("pt-BR")}</p>
                        </div>
                        <span className={`text-sm font-semibold px-3 py-1 rounded-full ${c}`}>{Math.round(e.score_percent)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Evolução por Matéria (line chart) */}
            {chartData.length > 1 && totalAnswered >= 50 && (
              <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-5 animate-fade-in" style={{ animationDelay: "0.4s" }}>
                <h2 className="text-sm font-semibold text-foreground mb-4">Evolução por Matéria</h2>
                <div className="flex gap-2 mb-4 overflow-x-auto">
                  {subjectFilters.map((s) => (
                    <button key={s} onClick={() => setSelectedSubject(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
                        selectedSubject === s ? "bg-foreground text-white" : "bg-white border border-gray-200 text-foreground"
                      }`}>
                      {s === "all" ? "Todas" : s}
                    </button>
                  ))}
                </div>
                <div className="bg-gray-50 rounded-xl p-4 h-52">
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

/* ─── Helper Components ─── */

function renderCheckItem(done: boolean, text: string) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span className={`text-xs ${done ? "text-foreground" : "text-muted-foreground"}`}>{text}</span>
    </div>
  );
}

function MetricCard({ value, label, icon }: { value: string; label: string; icon?: React.ReactNode }) {
  return (
    <div className="p-4 bg-white rounded-2xl border border-gray-100">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-lg font-semibold text-foreground">{value}</p>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

export default Performance;
