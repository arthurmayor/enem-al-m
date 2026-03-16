import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText, Clock, ChevronRight, Trophy, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";

interface ExamResult {
  id: string;
  exam_name: string;
  score_percent: number;
  correct_answers: number;
  total_questions: number;
  created_at: string;
}

const examOptions = [
  { id: "enem-rapido", name: "ENEM Rapido", desc: "30 questoes em 1h30", icon: "zap", questions: 30, duration: "1h30" },
  { id: "enem-completo", name: "ENEM Completo", desc: "90 questoes em 5h", icon: "list", questions: 90, duration: "5h" },
  { id: "fuvest", name: "Fuvest 1a Fase", desc: "45 questoes em 2h30", icon: "grad", questions: 45, duration: "2h30" },
  { id: "unicamp", name: "Unicamp", desc: "36 questoes em 2h", icon: "building", questions: 36, duration: "2h" },
];

const Exams = () => {
  const { user } = useAuth();
  const [history, setHistory] = useState<ExamResult[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const { data: results } = await supabase
        .from("exam_results")
        .select("id, exam_name, score_percent, correct_answers, total_questions, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (results) setHistory(results);

      const { count } = await supabase.from("questions").select("id", { count: "exact", head: true });
      setQuestionCount(count || 0);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const getColor = (p: number) => p >= 70 ? "text-success bg-success/10" : p >= 40 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";

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
        <div className="container mx-auto flex h-14 items-center px-4 max-w-3xl">
          <FileText className="h-5 w-5 text-primary mr-2" />
          <span className="text-base font-bold text-foreground">Simulados</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {questionCount < 30 && (
          <div className="p-4 bg-warning/10 rounded-xl border border-warning/20 mb-6 animate-fade-in">
            <p className="text-sm text-warning font-medium">
              Banco com apenas {questionCount} questoes. Importe mais questoes no Supabase para simulados completos.
            </p>
          </div>
        )}

        {/* Exam options */}
        <h2 className="text-base font-semibold text-foreground mb-4">Escolha um simulado</h2>
        <div className="space-y-3">
          {examOptions.map((exam, i) => {
            const canTake = questionCount >= exam.questions;
            return canTake ? (
              <Link
                key={exam.id}
                to={`/exam/${exam.id}`}
                className="group flex items-center justify-between p-5 bg-card rounded-xl shadow-rest transition-all duration-300 animate-fade-in hover:shadow-elevated hover:-translate-y-0.5"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div>
                  <h3 className="font-semibold text-foreground">{exam.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{exam.desc}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="flex items-center text-xs text-muted-foreground">
                      <FileText className="h-3 w-3 mr-1" />{exam.questions}q
                    </span>
                    <span className="flex items-center text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 mr-1" />{exam.duration}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            ) : (
              <div
                key={exam.id}
                className="flex items-center justify-between p-5 bg-card rounded-xl shadow-rest transition-all duration-300 animate-fade-in opacity-50"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div>
                  <h3 className="font-semibold text-foreground">{exam.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{exam.desc}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="flex items-center text-xs text-muted-foreground">
                      <FileText className="h-3 w-3 mr-1" />{exam.questions}q
                    </span>
                    <span className="flex items-center text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 mr-1" />{exam.duration}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground font-medium">Questoes insuficientes</span>
              </div>
            );
          })}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="mt-10 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <h2 className="text-base font-semibold text-foreground mb-4">Historico</h2>
            <div className="space-y-2">
              {history.map(r => (
                <div key={r.id} className="flex items-center justify-between p-4 bg-card rounded-xl shadow-rest">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{r.exam_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")} • {r.correct_answers}/{r.total_questions} corretas
                    </p>
                  </div>
                  <span className={`text-sm font-bold px-3 py-1 rounded-full ${getColor(r.score_percent)}`}>
                    {Math.round(r.score_percent)}%
                  </span>
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
