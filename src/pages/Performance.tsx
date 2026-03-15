import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ProficiencyRow {
  subject: string;
  subtopic: string;
  score: number;
  measured_at: string;
  source: string;
}

interface MissionRow {
  status: string;
  score: number | null;
  date: string;
}

interface AnswerRow {
  is_correct: boolean;
  created_at: string;
}

interface SubtopicError {
  name: string;
  subject: string;
  gap: number;
}

const Performance = () => {
  const { user } = useAuth();
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [loading, setLoading] = useState(true);

  const [proficiencyData, setProficiencyData] = useState<ProficiencyRow[]>([]);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [subtopicErrors, setSubtopicErrors] = useState<SubtopicError[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchAll = async () => {
      const { data: profData } = await supabase
        .from("proficiency_scores")
        .select("subject, subtopic, score, measured_at, source")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true });
      if (profData) setProficiencyData(profData);

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: missionData } = await supabase
        .from("daily_missions")
        .select("status, score, date")
        .eq("user_id", user.id)
        .gte("date", weekAgo.toISOString().split("T")[0]);
      if (missionData) setMissions(missionData);

      const { data: answerData } = await supabase
        .from("answer_history")
        .select("is_correct, created_at")
        .eq("user_id", user.id)
        .gte("created_at", weekAgo.toISOString());
      if (answerData) setAnswers(answerData);

      if (profData) {
        const errorMap: Record<string, SubtopicError> = {};
        profData
          .filter((p) => p.score < 0.5)
          .forEach((p) => {
            const key = `${p.subject}-${p.subtopic}`;
            if (!errorMap[key]) {
              errorMap[key] = { name: p.subtopic, subject: p.subject, gap: Math.round((1 - p.score) * 100) };
            }
          });
        setSubtopicErrors(Object.values(errorMap).sort((a, b) => b.gap - a.gap).slice(0, 5));
      }

      setLoading(false);
    };
    fetchAll();
  }, [user]);

  const completedMissions = missions.filter((m) => m.status === "completed").length;
  const totalMissions = missions.length;
  const accuracyRate = answers.length > 0
    ? Math.round((answers.filter((a) => a.is_correct).length / answers.length) * 100)
    : 0;

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
    Object.entries(scores).forEach(([subj, vals]) => {
      entry[subj] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    });
    return entry;
  });

  const latestScores = subjects.map((s) => {
    const subjectRows = proficiencyData.filter((p) => p.subject === s);
    return subjectRows.length > 0
      ? subjectRows.reduce((sum, r) => sum + r.score, 0) / subjectRows.length
      : 0;
  });
  const passProb = latestScores.length > 0
    ? Math.round((latestScores.reduce((a, b) => a + b, 0) / latestScores.length) * 100)
    : 0;
  const probColor = passProb >= 70 ? "text-success" : passProb >= 40 ? "text-warning" : "text-destructive";
  const probBg = passProb >= 70 ? "bg-success/10" : passProb >= 40 ? "bg-warning/10" : "bg-destructive/10";

  const chartColors: Record<string, string> = {
    "Matemática": "hsl(var(--primary))",
    "Português": "hsl(var(--success))",
    "Física": "hsl(var(--warning))",
    "Química": "hsl(var(--accent))",
    "Biologia": "hsl(142 64% 40%)",
    "História": "hsl(var(--destructive))",
    "Geografia": "hsl(28 80% 52%)",
  };

  const hasData = proficiencyData.length > 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md shadow-rest">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4 max-w-3xl">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="text-base font-bold text-foreground">Performance</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {!hasData ? (
          <div className="text-center py-16 animate-fade-in">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <ArrowLeft className="h-6 w-6 text-muted-foreground rotate-180" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Sem dados ainda</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
              Complete o diagnóstico e algumas missões para ver suas estatísticas aqui.
            </p>
            <Link
              to="/diagnostic/intro"
              className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary"
            >
              Fazer diagnóstico
            </Link>
          </div>
        ) : (
          <>
            {/* Pass Probability */}
            <div className="text-center animate-fade-in">
              <div className={`inline-flex items-center justify-center h-24 w-24 rounded-full ${probBg} ${probColor} text-3xl font-bold`}>
                {passProb}%
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">Probabilidade de Aprovação</p>
              <p className="text-xs text-muted-foreground">Estimativa baseada no seu desempenho</p>
            </div>

            {/* Weekly Summary */}
            <div className="mt-8 grid grid-cols-2 gap-3 animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <div className="p-4 bg-card rounded-xl shadow-rest">
                <p className="text-lg font-bold text-foreground">{completedMissions}/{totalMissions}</p>
                <p className="text-xs text-muted-foreground mt-1">Missões completadas</p>
              </div>
              <div className="p-4 bg-card rounded-xl shadow-rest">
                <p className="text-lg font-bold text-foreground">{accuracyRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">Taxa de acerto</p>
              </div>
              <div className="p-4 bg-card rounded-xl shadow-rest">
                <p className="text-lg font-bold text-foreground">{answers.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Questões respondidas</p>
              </div>
              <div className="p-4 bg-card rounded-xl shadow-rest">
                <p className="text-lg font-bold text-foreground">{subjects.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Matérias avaliadas</p>
              </div>
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
                <h2 className="text-base font-semibold text-foreground mb-4">Evolução por Matéria</h2>
                <div className="flex gap-2 mb-4 overflow-x-auto">
                  {subjectFilters.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSubject(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
                        selectedSubject === s ? "bg-primary text-primary-foreground" : "bg-card shadow-rest text-foreground"
                      }`}
                    >
                      {s === "all" ? "Todas" : s}
                    </button>
                  ))}
                </div>
                <div className="bg-card rounded-xl shadow-rest p-4 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip />
                      {subjects
                        .filter((s) => selectedSubject === "all" || selectedSubject === s)
                        .map((s) => (
                          <Line
                            key={s}
                            type="monotone"
                            dataKey={s}
                            stroke={chartColors[s] || "hsl(var(--primary))"}
                            strokeWidth={2}
                            dot={false}
                            name={s}
                          />
                        ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Worst Subtopics */}
            {subtopicErrors.length > 0 && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <h2 className="text-base font-semibold text-foreground mb-4">Tópicos com Mais Dificuldade</h2>
                <div className="space-y-2">
                  {subtopicErrors.map((t) => (
                    <div key={`${t.subject}-${t.name}`} className="flex items-center justify-between p-4 bg-card rounded-xl shadow-rest">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.subject}</p>
                      </div>
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-destructive/10 text-destructive">
                        {t.gap}% lacuna
                      </span>
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
