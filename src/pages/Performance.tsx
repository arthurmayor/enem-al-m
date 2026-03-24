import { useState, useEffect } from "react";
import { ArrowLeft, Zap, Flame, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ProficiencyRow { subject: string; subtopic: string; score: number; measured_at: string; source: string; }
interface MissionRow { status: string; score: number | null; date: string; }
interface AnswerRow { is_correct: boolean; created_at: string; }
interface SubtopicError { name: string; subject: string; gap: number; }

const BAND_LABELS: Record<string, string> = {
  base: "Base",
  intermediario: "Intermediário",
  competitivo: "Competitivo",
  forte: "Forte",
};

const Performance = () => {
  const { user } = useAuth();
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [loading, setLoading] = useState(true);
  const [proficiencyData, setProficiencyData] = useState<ProficiencyRow[]>([]);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [subtopicErrors, setSubtopicErrors] = useState<SubtopicError[]>([]);
  const [examHistory, setExamHistory] = useState<{ exam_name: string; score_percent: number; created_at: string }[]>([]);
  const [profileStats, setProfileStats] = useState<{ total_xp: number; current_streak: number; longest_streak: number; missions_completed: number; exams_completed: number } | null>(null);

  // Gate data (Change 2)
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
      const { data: answerData } = await supabase.from("answer_history").select("is_correct, created_at").eq("user_id", user.id).gte("created_at", weekAgo.toISOString());
      if (answerData) setAnswers(answerData);
      if (profData) {
        const errorMap: Record<string, SubtopicError> = {};
        profData.filter((p) => p.score < 0.5).forEach((p) => {
          const key = `${p.subject}-${p.subtopic}`;
          if (!errorMap[key]) errorMap[key] = { name: p.subtopic, subject: p.subject, gap: Math.round((1 - p.score) * 100) };
        });
        setSubtopicErrors(Object.values(errorMap).sort((a, b) => b.gap - a.gap).slice(0, 5));
      }
      const { data: examData } = await supabase.from("exam_results").select("exam_name, score_percent, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
      if (examData) setExamHistory(examData);
      const { data: profileStatsData } = await supabase.from("profiles").select("total_xp, current_streak, longest_streak, missions_completed, exams_completed").eq("id", user.id).single();
      if (profileStatsData) setProfileStats(profileStatsData);

      // ─── Gate data (Change 2) ──────────────────────────────────────
      // Total questões respondidas (all time)
      const { count: totalCount } = await supabase.from("answer_history").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      setTotalAnswered(totalCount || 0);

      // Matérias distintas cobertas
      const distinctSubjects = new Set((profData || []).map(p => p.subject));
      setSubjectsCovered(distinctSubjects.size);

      // Planos com status='superseded' (indica regeneração)
      const { count: supersededCount } = await supabase.from("study_plans").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "superseded");
      setRegenerations(supersededCount || 0);

      // Placement band mais recente
      const { data: latestEstimate } = await supabase.from("diagnostic_estimates").select("placement_band").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
      if (latestEstimate && latestEstimate.length > 0 && latestEstimate[0].placement_band) {
        setPlacementBand(latestEstimate[0].placement_band);
      }

      setLoading(false);
    };
    fetchAll();
  }, [user]);

  const completedMissions = missions.filter((m) => m.status === "completed").length;
  const totalMissions = missions.length;
  const accuracyRate = answers.length > 0 ? Math.round((answers.filter((a) => a.is_correct).length / answers.length) * 100) : 0;
  const subjects = [...new Set(proficiencyData.map((p) => p.subject))];
  const subjectFilters = ["all", ...subjects];

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

  const latestScores = subjects.map((s) => {
    const subjectRows = proficiencyData.filter((p) => p.subject === s);
    return subjectRows.length > 0 ? subjectRows.reduce((sum, r) => sum + r.score, 0) / subjectRows.length : 0;
  });
  const passProb = latestScores.length > 0 ? Math.round((latestScores.reduce((a, b) => a + b, 0) / latestScores.length) * 100) : 0;
  const probColor = passProb >= 70 ? "text-success" : passProb >= 40 ? "text-warning" : "text-destructive";
  const probBg = passProb >= 70 ? "bg-success/10" : passProb >= 40 ? "bg-warning/10" : "bg-destructive/10";

  // Gate: only show probability if enough data (Change 2)
  const canShowProbability = totalAnswered >= 60 && subjectsCovered >= 4 && regenerations >= 1;

  const hasData = proficiencyData.length > 0;

  if (loading) { return (<div className="min-h-screen bg-white flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>); }

  return (
    <div className="min-h-screen bg-white pb-20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4 max-w-3xl">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="text-base font-semibold text-foreground">Performance</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {!hasData ? (
          <div className="text-center py-16 animate-fade-in">
            <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4"><ArrowLeft className="h-6 w-6 text-muted-foreground rotate-180" /></div>
            <h2 className="text-lg font-semibold text-foreground">Sem dados ainda</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">Complete o diagnóstico e algumas missões para ver suas estatísticas aqui.</p>
            <Link to="/diagnostic/intro" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-foreground">Fazer diagnóstico</Link>
          </div>
        ) : (
          <>
            {canShowProbability ? (
              <div className="text-center animate-fade-in">
                <div className={`inline-flex items-center justify-center h-24 w-24 rounded-full ${probBg} ${probColor} text-3xl font-semibold`}>{passProb}%</div>
                <p className="mt-3 text-sm font-semibold text-foreground">Probabilidade de Aprovação</p>
                <p className="text-xs text-muted-foreground">Estimativa baseada no seu desempenho</p>
              </div>
            ) : (
              <div className="text-center animate-fade-in">
                <div className="inline-flex items-center justify-center h-24 w-24 rounded-full bg-gray-100 text-foreground text-lg font-semibold">
                  {placementBand ? BAND_LABELS[placementBand] || placementBand : <Lock className="h-6 w-6 text-muted-foreground" />}
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">Nível Atual{placementBand ? `: ${BAND_LABELS[placementBand] || placementBand}` : ""}</p>
                <div className="mt-3 max-w-xs mx-auto">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-2 rounded-full bg-foreground transition-all duration-700" style={{ width: `${Math.min(100, Math.round((totalAnswered / 60) * 100))}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Continue estudando para desbloquear sua estimativa de aprovação</p>
                </div>
              </div>
            )}

            <div className="mt-8 grid grid-cols-2 gap-3 animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <div className="p-4 bg-gray-50 rounded-2xl"><p className="text-lg font-semibold text-foreground">{completedMissions}/{totalMissions}</p><p className="text-xs text-muted-foreground mt-1">Missões completadas</p></div>
              <div className="p-4 bg-gray-50 rounded-2xl"><p className="text-lg font-semibold text-foreground">{accuracyRate}%</p><p className="text-xs text-muted-foreground mt-1">Taxa de acerto</p></div>
              <div className="p-4 bg-gray-50 rounded-2xl"><p className="text-lg font-semibold text-foreground">{answers.length}</p><p className="text-xs text-muted-foreground mt-1">Questões respondidas</p></div>
              <div className="p-4 bg-gray-50 rounded-2xl"><p className="text-lg font-semibold text-foreground">{subjects.length}</p><p className="text-xs text-muted-foreground mt-1">Matérias avaliadas</p></div>
            </div>

            {profileStats && (
              <div className="mt-4 flex gap-3 animate-fade-in" style={{ animationDelay: "0.15s" }}>
                <div className="flex-1 p-4 bg-gray-50 rounded-2xl text-center">
                  <div className="flex items-center justify-center gap-1 mb-1"><Flame className="h-4 w-4 text-foreground" /></div>
                  <p className="text-2xl font-semibold text-foreground">{profileStats.current_streak || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Dias seguidos</p>
                </div>
                <div className="flex-1 p-4 bg-gray-50 rounded-2xl text-center">
                  <div className="flex items-center justify-center gap-1 mb-1"><Zap className="h-4 w-4 text-foreground" /></div>
                  <p className="text-2xl font-semibold text-foreground">{profileStats.total_xp || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">XP total</p>
                </div>
              </div>
            )}

            {subjects.length >= 3 && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.25s" }}>
                <h2 className="text-base font-semibold text-foreground mb-4">Perfil por Matéria</h2>
                <div className="bg-gray-50 rounded-2xl p-4 flex justify-center">
                  <ResponsiveContainer width={280} height={250}>
                    <RadarChart data={subjects.map(s => {
                      const rows = proficiencyData.filter(p => p.subject === s);
                      const avg = rows.length > 0 ? Math.round((rows.reduce((sum, r) => sum + r.score, 0) / rows.length) * 100) : 0;
                      return { subject: s.length > 6 ? s.slice(0, 6) + "." : s, score: avg };
                    })}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                      <Radar dataKey="score" stroke="hsl(var(--foreground))" fill="hsl(var(--foreground))" fillOpacity={0.1} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {examHistory.length > 0 && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.35s" }}>
                <h2 className="text-base font-semibold text-foreground mb-4">Últimos Simulados</h2>
                <div className="space-y-2">
                  {examHistory.map((e, i) => {
                    const c = e.score_percent >= 70 ? "text-success bg-success/10" : e.score_percent >= 40 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
                    return (
                      <div key={i} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100">
                        <div><p className="text-sm font-semibold text-foreground">{e.exam_name}</p><p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString("pt-BR")}</p></div>
                        <span className={`text-sm font-semibold px-3 py-1 rounded-full ${c}`}>{Math.round(e.score_percent)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {chartData.length > 0 && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
                <h2 className="text-base font-semibold text-foreground mb-4">Evolução por Matéria</h2>
                <div className="flex gap-2 mb-4 overflow-x-auto">
                  {subjectFilters.map((s) => (
                    <button key={s} onClick={() => setSelectedSubject(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${selectedSubject === s ? "bg-foreground text-white" : "bg-white border border-gray-200 text-foreground"}`}>
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

            {subtopicErrors.length > 0 && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <h2 className="text-base font-semibold text-foreground mb-4">Tópicos com Mais Dificuldade</h2>
                <div className="space-y-2">
                  {subtopicErrors.map((t) => (
                    <div key={`${t.subject}-${t.name}`} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100">
                      <div><p className="text-sm font-semibold text-foreground">{t.name}</p><p className="text-xs text-muted-foreground">{t.subject}</p></div>
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-destructive/10 text-destructive">{t.gap}% lacuna</span>
                    </div>
                  ))}
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
