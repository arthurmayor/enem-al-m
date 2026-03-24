import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Flame, CheckCircle2, Circle, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ProficiencyRow { subject: string; subtopic: string; score: number; measured_at: string; source: string; }
interface MissionRow { status: string; score: number | null; date: string; }
interface AnswerRow { is_correct: boolean; created_at: string; }

const BAND_LABELS: Record<string, string> = {
  base: "Base",
  beginner: "Base",
  intermediario: "Intermediário",
  intermediate: "Intermediário",
  competitivo: "Competitivo",
  advanced: "Competitivo",
  forte: "Forte",
};

const BAND_NEXT: Record<string, string> = {
  base: "Intermediário",
  beginner: "Intermediário",
  intermediario: "Competitivo",
  intermediate: "Competitivo",
  competitivo: "Forte",
  advanced: "Forte",
  forte: "Forte",
};

const ALL_SUBJECTS = ["Português", "Matemática", "História", "Geografia", "Biologia", "Física", "Química", "Inglês", "Filosofia"];

function barColor(pct: number): string {
  if (pct >= 70) return "bg-green-500";
  if (pct >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function levelLabel(pct: number): string {
  if (pct >= 75) return "Forte";
  if (pct >= 55) return "Competitivo";
  if (pct >= 35) return "Intermediário";
  return "Base";
}

function levelBadgeColor(pct: number): string {
  if (pct >= 75) return "text-green-700 bg-green-100";
  if (pct >= 55) return "text-foreground bg-gray-100";
  if (pct >= 35) return "text-yellow-700 bg-yellow-100";
  return "text-red-700 bg-red-100";
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
  const [placementBand, setPlacementBand] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      const { data: profData } = await supabase.from("proficiency_scores").select("subject, subtopic, score, measured_at, source").eq("user_id", user.id).order("measured_at", { ascending: true });
      if (profData) setProficiencyData(profData);

      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: missionData } = await supabase.from("daily_missions").select("status, score, date").eq("user_id", user.id).gte("date", weekAgo.toISOString().split("T")[0]);
      if (missionData) setMissions(missionData);

      // All-time missions for total count
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

      const { data: latestEstimate } = await supabase.from("diagnostic_estimates").select("placement_band").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
      if (latestEstimate && latestEstimate.length > 0 && latestEstimate[0].placement_band) {
        setPlacementBand(latestEstimate[0].placement_band);
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

  // Subject scores (latest average per subject)
  const subjectScores = useMemo(() => {
    return ALL_SUBJECTS.map((s) => {
      const rows = proficiencyData.filter(p => p.subject === s);
      if (rows.length === 0) return { subject: s, pct: -1 }; // -1 = no data
      const avg = rows.reduce((sum, r) => sum + r.score, 0) / rows.length;
      return { subject: s, pct: Math.round(avg * 100) };
    }).sort((a, b) => {
      if (a.pct === -1 && b.pct === -1) return 0;
      if (a.pct === -1) return 1;
      if (b.pct === -1) return -1;
      return b.pct - a.pct;
    });
  }, [proficiencyData]);

  // Topics with difficulty: only real subtopics (not "geral") with score < 50%
  // Fallback: show subjects with score < 50%
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

    // Fallback: subjects with < 50%
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

  // Band progress percentage (rough: base=25%, intermediario=50%, competitivo=75%, forte=100%)
  const bandProgress: Record<string, number> = { base: 25, beginner: 25, intermediario: 50, intermediate: 50, competitivo: 75, advanced: 75, forte: 100 };
  const currentBandPct = placementBand ? bandProgress[placementBand] || 25 : 0;

  const hasData = proficiencyData.length > 0;
  const hasEnoughData = totalAnswered >= 10;

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-[640px] mx-auto flex h-14 items-center gap-3 px-4">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="text-base font-semibold text-foreground">Desempenho</span>
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-6">
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
            {/* ─── Nível Atual / Probabilidade ─── */}
            {canShowProbability ? (
              <div className="text-center animate-fade-in">
                <div className={`inline-flex items-center justify-center h-24 w-24 rounded-full ${probBg} ${probColor} text-3xl font-semibold`}>
                  {passProb}%
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">Probabilidade de Aprovação</p>
                <p className="text-xs text-muted-foreground">Estimativa baseada no seu desempenho</p>
              </div>
            ) : (
              <div className="animate-fade-in">
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">
                    Nível Atual: {placementBand ? BAND_LABELS[placementBand] || placementBand : "—"}
                  </p>
                </div>

                {/* Progress bar toward next band */}
                <div className="mt-3 max-w-sm mx-auto">
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-3 rounded-full bg-foreground transition-all duration-700" style={{ width: `${currentBandPct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {currentBandPct}% do caminho para {placementBand ? BAND_NEXT[placementBand] || "Forte" : "Intermediário"}
                  </p>
                </div>

                {/* Unlock checklist */}
                <div className="mt-4 bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-foreground mb-3">Para liberar sua previsão de aprovação:</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {totalAnswered >= 60 ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs text-foreground">{totalAnswered}/60 questões respondidas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {subjectsCovered >= 4 ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs text-foreground">{subjectsCovered}/4 matérias cobertas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {regenerations >= 1 ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs text-foreground">{regenerations}/1 regeneração de plano</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Stats ─── */}
            {hasEnoughData && (
              <>
                <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.1s" }}>
                  <h2 className="text-sm font-semibold text-foreground mb-3">Esta semana</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-gray-50 rounded-2xl">
                      <p className="text-lg font-semibold text-foreground">{weekCompletedMissions}/{weekTotalMissions}</p>
                      <p className="text-xs text-muted-foreground mt-1">Missões feitas</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl">
                      <p className="text-lg font-semibold text-foreground">{weekAccuracy}%</p>
                      <p className="text-xs text-muted-foreground mt-1">Taxa de acerto</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 animate-fade-in" style={{ animationDelay: "0.15s" }}>
                  <h2 className="text-sm font-semibold text-foreground mb-3">Total</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-gray-50 rounded-2xl">
                      <p className="text-lg font-semibold text-foreground">{totalQuestionsAnswered}</p>
                      <p className="text-xs text-muted-foreground mt-1">Questões respondidas</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl">
                      <div className="flex items-center gap-1 mb-0.5"><Flame className="h-4 w-4 text-foreground" /></div>
                      <p className="text-lg font-semibold text-foreground">{currentStreak}</p>
                      <p className="text-xs text-muted-foreground mt-1">Dias seguidos</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── Nível por Matéria (horizontal bars) ─── */}
            {subjectScores.some(s => s.pct >= 0) && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
                <h2 className="text-sm font-semibold text-foreground mb-4">Nível por Matéria</h2>
                <div className="space-y-2">
                  {subjectScores.map((s) => (
                    <div key={s.subject} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100">
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
                        <>
                          <span className="text-xs font-semibold text-foreground w-8 text-right">{s.pct}%</span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${levelBadgeColor(s.pct)}`}>
                            {levelLabel(s.pct)}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">Sem dados</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Tópicos com Dificuldade ─── */}
            {difficultTopics.length > 0 && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.25s" }}>
                <h2 className="text-sm font-semibold text-foreground mb-4">Áreas para melhorar</h2>
                <div className="space-y-2">
                  {difficultTopics.map((t) => (
                    <div key={t.label} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100">
                      <span className="text-sm font-medium text-foreground">{t.label}</span>
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-50 text-red-700">
                        {t.pct}% de acerto
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Últimos Simulados ─── */}
            {examHistory.length > 0 && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <h2 className="text-sm font-semibold text-foreground mb-4">Últimos Simulados</h2>
                <div className="space-y-2">
                  {examHistory.map((e, i) => {
                    const c = e.score_percent >= 70 ? "text-green-700 bg-green-50" : e.score_percent >= 40 ? "text-yellow-700 bg-yellow-50" : "text-red-700 bg-red-50";
                    return (
                      <div key={i} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100">
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

            {/* ─── Evolução por Matéria (line chart, only with enough data) ─── */}
            {chartData.length > 1 && totalAnswered >= 50 && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.35s" }}>
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
                <div className="bg-gray-50 rounded-2xl p-4 h-52">
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

export default Performance;
