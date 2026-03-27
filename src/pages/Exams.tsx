import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText, Clock, ChevronRight, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";

interface ExamResult { id: string; exam_name: string; score_percent: number; correct_answers: number; total_questions: number; created_at: string; }
interface ExamOption { id: string; name: string; desc: string; questions: number; duration: string; highlight?: boolean; }

const FALLBACK_EXAM_OPTIONS: ExamOption[] = [
  { id: "fuvest-mini", name: "Mini Simulado Fuvest", desc: "25 questões em ~75 min — distribuição proporcional", questions: 25, duration: "1h15", highlight: true },
  { id: "enem-rapido", name: "ENEM Rápido", desc: "30 questões em 1h30", questions: 30, duration: "1h30" },
  { id: "fuvest", name: "Fuvest 1ª Fase", desc: "45 questões em 2h30", questions: 45, duration: "2h30" },
  { id: "unicamp", name: "Unicamp", desc: "36 questões em 2h", questions: 36, duration: "2h" },
];

function formatDuration(totalQuestions: number): string {
  const mins = Math.round(totalQuestions * 3);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
  }
  return `${mins}min`;
}

const Exams = () => {
  const { user } = useAuth();
  const [history, setHistory] = useState<ExamResult[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [examOptions, setExamOptions] = useState<ExamOption[]>(FALLBACK_EXAM_OPTIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [{ data: results }, { count }, { data: dbConfigs }] = await Promise.all([
        supabase.from("exam_results").select("id, exam_name, score_percent, correct_answers, total_questions, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("questions").select("id", { count: "exact", head: true }),
        supabase.from("exam_configs").select("exam_slug, exam_name, course_name, total_questions, subject_distribution").eq("is_active", true),
      ]);
      if (results) setHistory(results);
      setQuestionCount(count || 0);

      // Use DB configs if available, otherwise keep fallback
      if (dbConfigs && dbConfigs.length > 0) {
        const mapped: ExamOption[] = dbConfigs.map((ec, i) => ({
          id: ec.exam_slug,
          name: ec.exam_name + (ec.course_name ? ` — ${ec.course_name}` : ""),
          desc: `${ec.total_questions} questões em ${formatDuration(ec.total_questions)}`,
          questions: ec.total_questions,
          duration: formatDuration(ec.total_questions),
          highlight: i === 0,
        }));
        setExamOptions(mapped);
      }

      setLoading(false);
    };
    fetchData();
  }, [user]);

  const getColor = (p: number) => p >= 70 ? "text-signal-ok bg-signal-ok/10" : p >= 40 ? "text-brand-500 bg-brand-100" : "text-signal-error bg-signal-error/10";

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-ink-strong border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-app pb-24 md:pb-0">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6 animate-fade-in">
        <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center">
          <FileText className="h-4 w-4 text-brand-500" />
        </div>
        <h1 className="text-2xl font-bold text-ink-strong">Simulados</h1>
      </header>

      {questionCount < 30 && (
        <div className="bg-signal-info/10 border border-signal-info/20 rounded-card p-4 mb-6 animate-fade-in">
          <p className="text-sm font-medium text-signal-info">Banco com apenas {questionCount} questões. Importe mais questões para simulados completos.</p>
        </div>
      )}

      {/* Exam grid */}
      <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wider mb-4">Escolha um simulado</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {examOptions.map((exam) => {
          const canTake = questionCount >= exam.questions;
          const isHighlight = exam.highlight;

          return canTake ? (
            <Link key={exam.id} to={`/exam/${exam.id}`}
              className={`group bg-bg-card rounded-card border shadow-card hover:shadow-card-hover transition-all p-5 ${
                isHighlight ? "border-brand-500/30 ring-1 ring-brand-500/10" : "border-line-light"
              }`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-ink-strong text-sm">{exam.name}</h3>
                    {isHighlight && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-500 text-white">Recomendado</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-soft">{exam.desc}</p>
                  <div className="mt-3 flex items-center gap-4">
                    <span className="flex items-center text-xs text-ink-muted"><FileText className="h-3 w-3 mr-1" />{exam.questions}q</span>
                    <span className="flex items-center text-xs text-ink-muted"><Clock className="h-3 w-3 mr-1" />{exam.duration}</span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-ink-muted group-hover:text-brand-500 transition-colors mt-1" />
              </div>
            </Link>
          ) : (
            <div key={exam.id}
              className="bg-bg-card rounded-card border border-line-light p-5 opacity-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-ink-strong text-sm">{exam.name}</h3>
                  <p className="text-xs text-ink-soft mt-1">{exam.desc}</p>
                  <div className="mt-3 flex items-center gap-4">
                    <span className="flex items-center text-xs text-ink-muted"><FileText className="h-3 w-3 mr-1" />{exam.questions}q</span>
                    <span className="flex items-center text-xs text-ink-muted"><Clock className="h-3 w-3 mr-1" />{exam.duration}</span>
                  </div>
                </div>
                <Lock className="h-4 w-4 text-ink-muted mt-1" />
              </div>
            </div>
          );
        })}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="animate-fade-in">
          <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wider mb-4">Histórico</h2>
          <div className="space-y-2">
            {history.map(r => (
              <div key={r.id} className="bg-bg-card rounded-card border border-line-light shadow-card p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink-strong">{r.exam_name}</p>
                  <p className="text-xs text-ink-muted">{new Date(r.created_at).toLocaleDateString("pt-BR")} · {r.correct_answers}/{r.total_questions} corretas</p>
                </div>
                <span className={`text-sm font-semibold px-3 py-1 rounded-full ${getColor(r.score_percent)}`}>{Math.round(r.score_percent)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Exams;
