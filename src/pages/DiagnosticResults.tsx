import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ProficiencyItem {
  subject: string;
  subtopic: string;
  score: number;
  confidence?: number;
  weakness_notes?: string;
}

interface DiagnosticState {
  proficiency: ProficiencyItem[];
  overall_readiness: number;
  priority_areas: string[];
  summary: string;
}

const getScoreColor = (scorePercent: number) => {
  if (scorePercent >= 70) return "text-success bg-success/10";
  if (scorePercent >= 40) return "text-warning bg-warning/10";
  return "text-destructive bg-destructive/10";
};

const getBarColor = (scorePercent: number) => {
  if (scorePercent >= 70) return "bg-success";
  if (scorePercent >= 40) return "bg-warning";
  return "bg-destructive";
};

const DiagnosticResults = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DiagnosticState | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  useEffect(() => {
    const state = location.state as DiagnosticState | null;
    if (state?.proficiency?.length) { setData(state); setLoading(false); return; }
    if (!user) { setLoading(false); return; }
    const fetchScores = async () => {
      const { data: rows, error } = await supabase.from("proficiency_scores").select("subject, subtopic, score, confidence, source").eq("user_id", user.id).eq("source", "diagnostic").order("measured_at", { ascending: false });
      if (!error && rows && rows.length > 0) {
        const proficiency: ProficiencyItem[] = rows.map((r: { subject: string; subtopic: string; score: number; confidence: number }) => ({
          subject: r.subject, subtopic: r.subtopic, score: r.score, confidence: r.confidence, weakness_notes: r.subtopic,
        }));
        const avgScore = proficiency.reduce((sum, p) => sum + p.score, 0) / proficiency.length;
        setData({ proficiency, overall_readiness: avgScore, priority_areas: proficiency.filter((p) => p.score < 0.4).map((p) => p.subtopic), summary: "" });
      }
      setLoading(false);
    };
    fetchScores();
  }, [user, location.state]);

  const handleGeneratePlan = async () => {
    if (!user || !data) return;
    setGeneratingPlan(true);
    try {
      const { data: profile } = await supabase.from("profiles").select("name, education_goal, desired_course, exam_date, hours_per_day, study_days").eq("id", user.id).single();
      const userProfile = profile || {};
      const proficiencyScores = { proficiency: data.proficiency, overall_readiness: data.overall_readiness, priority_areas: data.priority_areas, summary: data.summary };
      const { data: plan, error: invokeError } = await supabase.functions.invoke("generate-study-plan", { body: { proficiencyScores, userProfile } });
      if (invokeError) throw new Error(invokeError.message);
      if (plan?.error) throw new Error(plan.error);

      await supabase.from("daily_missions").delete().eq("user_id", user.id);
      await supabase.from("study_plans").delete().eq("user_id", user.id);

      const { data: savedPlan, error: planError } = await supabase.from("study_plans").insert({ user_id: user.id, week_number: 1, start_date: new Date().toISOString().split("T")[0], plan_json: plan, is_current: true, version: 1 }).select("id").single();
      if (planError) throw new Error(planError.message);

      const dayNames: Record<string, number> = { Domingo: 0, Segunda: 1, Terca: 2, Quarta: 3, Quinta: 4, Sexta: 5, Sabado: 6 };
      const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + 1);
      const firstOfWeekday: Record<number, Date> = {};
      for (let wd = 0; wd <= 6; wd++) { const d = new Date(start); while (d.getDay() !== wd) d.setDate(d.getDate() + 1); firstOfWeekday[wd] = new Date(d); }
      const weekdayCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
      const missionsToInsert: { user_id: string; study_plan_id: string; date: string; subject: string; subtopic: string; mission_type: string; status: string }[] = [];

      for (const week of plan.weeks ?? []) {
        for (const dayObj of week.days ?? []) {
          const targetWeekday = dayNames[dayObj.day] ?? 1;
          const n = weekdayCount[targetWeekday] ?? 0;
          const base = firstOfWeekday[targetWeekday];
          const d = new Date(base); d.setDate(d.getDate() + n * 7);
          weekdayCount[targetWeekday] = n + 1;
          const dateStr = d.toISOString().split("T")[0];
          for (const mission of dayObj.missions ?? []) {
            missionsToInsert.push({ user_id: user.id, study_plan_id: savedPlan.id, date: dateStr, subject: mission.subject ?? "Geral", subtopic: mission.subtopic ?? "", mission_type: mission.type ?? "questions", status: "pending" });
          }
        }
      }

      if (missionsToInsert.length > 0) await supabase.from("daily_missions").insert(missionsToInsert);
      navigate("/dashboard");
    } catch (err) { console.error(err); setGeneratingPlan(false); }
  };

  if (loading) {
    return (<div className="min-h-screen bg-background flex items-center justify-center"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>);
  }

  if (!data?.proficiency?.length) {
    return (<div className="min-h-screen bg-background flex items-center justify-center px-4"><div className="text-center"><p className="text-muted-foreground">Nenhum resultado de diagnóstico encontrado.</p><Link to="/diagnostic/intro" className="mt-4 inline-block text-primary font-semibold">Fazer diagnóstico</Link></div></div>);
  }

  const overallPercent = Math.round((data.overall_readiness ?? 0) * 100);
  const subjectScores = data.proficiency.map((p) => ({ name: p.subject, score: Math.round((p.score ?? 0) * 100), weakness: p.weakness_notes ?? p.subtopic ?? "" }));
  const bySubject = subjectScores.reduce<{ name: string; score: number; weakness: string }[]>((acc, p) => {
    const existing = acc.find((x) => x.name === p.name);
    if (existing) { existing.score = Math.round((existing.score + p.score) / 2); if (p.weakness) existing.weakness = p.weakness; }
    else acc.push({ ...p });
    return acc;
  }, []);
  const priorityAreas = [...bySubject].sort((a, b) => a.score - b.score).slice(0, 4);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto flex h-14 items-center px-4 max-w-3xl">
          <span className="text-base font-bold text-foreground">Resultado do Diagnóstico</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="text-center animate-fade-in">
          <div className={`inline-flex items-center justify-center h-28 w-28 rounded-full ${getScoreColor(overallPercent)} text-4xl font-extrabold`}>
            {overallPercent}%
          </div>
          <p className="mt-4 text-lg font-bold text-foreground">
            {overallPercent >= 70 ? "Bom nível!" : overallPercent >= 40 ? "Nível intermediário" : "Precisa de reforço"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Sua preparação geral para o exame</p>
        </div>

        <div className="mt-10 space-y-3 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <h2 className="text-base font-bold text-foreground mb-4">Proficiência por Matéria</h2>
          {bySubject.map((s) => (
            <div key={s.name} className="p-4 bg-card rounded-2xl border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-foreground">{s.name}</span>
                <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${getScoreColor(s.score)}`}>{s.score}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full">
                <div className={`h-2 rounded-full transition-all duration-700 ${getBarColor(s.score)}`} style={{ width: `${Math.min(100, s.score)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Foco: {s.weakness}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-base font-bold text-foreground mb-4">Áreas Prioritárias</h2>
          <div className="space-y-2">
            {priorityAreas.map((area, i) => (
              <div key={area.name} className="flex items-center gap-3 p-3 bg-destructive/5 rounded-xl border border-destructive/10">
                <span className="text-sm font-bold text-destructive">{i + 1}.</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{area.name}</p>
                  <p className="text-xs text-muted-foreground">{area.weakness}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {data.summary && (
          <div className="mt-10 p-5 bg-primary/5 rounded-2xl border border-primary/10 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <p className="text-sm text-foreground leading-relaxed">{data.summary}</p>
          </div>
        )}

        <div className="mt-10 animate-fade-in" style={{ animationDelay: "0.4s" }}>
          <button onClick={handleGeneratePlan} disabled={generatingPlan}
            className="w-full h-12 inline-flex items-center justify-center rounded-xl gradient-bg text-primary-foreground text-base font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 shadow-[0_4px_14px_rgba(99,102,241,0.3)]">
            {generatingPlan ? "Gerando plano..." : "Gerar Meu Plano de Estudos"}
            <ChevronRight className="ml-1 h-4 w-4" />
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default DiagnosticResults;
