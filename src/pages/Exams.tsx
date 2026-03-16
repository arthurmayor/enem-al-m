import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText, Clock, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";

interface ExamResult { id: string; exam_name: string; score_percent: number; correct_answers: number; total_questions: number; created_at: string; }

const examOptions = [
  { id: "enem-rapido", name: "ENEM Rápido", desc: "30 questões em 1h30", questions: 30, duration: "1h30" },
  { id: "enem-completo", name: "ENEM Completo", desc: "90 questões em 5h", questions: 90, duration: "5h" },
  { id: "fuvest", name: "Fuvest 1ª Fase", desc: "45 questões em 2h30", questions: 45, duration: "2h30" },
  { id: "unicamp", name: "Unicamp", desc: "36 questões em 2h", questions: 36, duration: "2h" },
];

const Exams = () => {
  const { user } = useAuth();
  const [history, setHistory] = useState<ExamResult[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const { data: results } = await supabase.from("exam_results").select("id, exam_name, score_percent, correct_answers, total_questions, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
      if (results) setHistory(results);
      const { count } = await supabase.from("questions").select("id", { count: "exact", head: true });
      setQuestionCount(count || 0);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const getColor = (p: number) => p >= 70 ? "text-success bg-success/10" : p >= 40 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";

  if (loading) { return (<div className="min-h-screen bg-white flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>); }

  return (
    <div className="min-h-screen bg-white pb-20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto flex h-14 items-center px-4 max-w-3xl">
          <FileText className="h-5 w-5 text-foreground mr-2" />
          <span className="text-base font-semibold text-foreground">Simulados</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {questionCount < 30 && (
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 mb-6 animate-fade-in">
            <p className="text-sm text-muted-foreground font-medium">Banco com apenas {questionCount} questões. Importe mais questões para simulados completos.</p>
          </div>
        )}

        <h2 className="text-base font-semibold text-foreground mb-4">Escolha um simulado</h2>
        <div className="space-y-3">
          {examOptions.map((exam, i) => {
            const canTake = questionCount >= exam.questions;
            return canTake ? (
              <Link key={exam.id} to={`/exam/${exam.id}`}
                className="group flex items-center justify-between p-5 bg-white rounded-2xl border border-gray-100 transition-all duration-300 animate-fade-in hover:shadow-md hover:-translate-y-0.5"
                style={{ animationDelay: `${i * 0.05}s` }}>
                <div>
                  <h3 className="font-semibold text-foreground">{exam.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{exam.desc}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="flex items-center text-xs text-muted-foreground"><FileText className="h-3 w-3 mr-1" />{exam.questions}q</span>
                    <span className="flex items-center text-xs text-muted-foreground"><Clock className="h-3 w-3 mr-1" />{exam.duration}</span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            ) : (
              <div key={exam.id} className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl animate-fade-in opacity-50" style={{ animationDelay: `${i * 0.05}s` }}>
                <div>
                  <h3 className="font-semibold text-foreground">{exam.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{exam.desc}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="flex items-center text-xs text-muted-foreground"><FileText className="h-3 w-3 mr-1" />{exam.questions}q</span>
                    <span className="flex items-center text-xs text-muted-foreground"><Clock className="h-3 w-3 mr-1" />{exam.duration}</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground font-medium">Questões insuficientes</span>
              </div>
            );
          })}
        </div>

        {history.length > 0 && (
          <div className="mt-10 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <h2 className="text-base font-semibold text-foreground mb-4">Histórico</h2>
            <div className="space-y-2">
              {history.map(r => (
                <div key={r.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{r.exam_name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")} • {r.correct_answers}/{r.total_questions} corretas</p>
                  </div>
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full ${getColor(r.score_percent)}`}>{Math.round(r.score_percent)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default Exams;
