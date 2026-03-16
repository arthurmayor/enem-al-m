import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Clock, ChevronLeft, ChevronRight, Flag, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Question { id: string; subject: string; subtopic: string; difficulty: number; question_text: string; options: { label: string; text: string; is_correct: boolean }[]; explanation: string; }
interface PerSubjectScore { subject: string; correct: number; total: number; percent: number; }

const EXAM_CONFIGS: Record<string, { name: string; questionCount: number; durationMinutes: number; examType: string }> = {
  "enem-rapido": { name: "ENEM Rápido", questionCount: 30, durationMinutes: 90, examType: "ENEM" },
  "enem-completo": { name: "ENEM Completo", questionCount: 90, durationMinutes: 300, examType: "ENEM" },
  "fuvest": { name: "Fuvest 1ª Fase", questionCount: 45, durationMinutes: 150, examType: "Fuvest" },
  "unicamp": { name: "Unicamp", questionCount: 36, durationMinutes: 120, examType: "Unicamp" },
};

const ExamSession = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const config = EXAM_CONFIGS[examId || ""] || EXAM_CONFIGS["enem-rapido"];

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(config.durationMinutes * 60);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<{ score: number; correct: number; total: number; perSubject: PerSubjectScore[] } | null>(null);
  const [showNav, setShowNav] = useState(false);

  useEffect(() => {
    if (!user) return;
    const loadQuestions = async () => {
      const { data } = await supabase.from("questions").select("*").limit(200);
      if (data && data.length > 0) {
        const bySubject: Record<string, Question[]> = {};
        data.forEach((q: Question) => { if (!bySubject[q.subject]) bySubject[q.subject] = []; bySubject[q.subject].push(q); });
        Object.values(bySubject).forEach(pool => pool.sort(() => Math.random() - 0.5));
        const picked: Question[] = [];
        const subjects = Object.keys(bySubject);
        let idx = 0;
        while (picked.length < config.questionCount && idx < 500) {
          const subj = subjects[idx % subjects.length];
          const pool = bySubject[subj];
          if (pool && pool.length > 0) picked.push(pool.shift()!);
          idx++;
        }
        setQuestions(picked);
      }
      setLoading(false);
    };
    loadQuestions();
  }, [user]);

  const handleSubmit = useCallback(async () => {
    if (submitted || !user) return;
    setSubmitted(true);
    let correct = 0;
    const subjectScores: Record<string, { correct: number; total: number }> = {};
    questions.forEach((q, i) => {
      const selected = answers[i];
      const isCorrect = selected ? q.options.find(o => o.label === selected)?.is_correct || false : false;
      if (isCorrect) correct++;
      if (!subjectScores[q.subject]) subjectScores[q.subject] = { correct: 0, total: 0 };
      subjectScores[q.subject].total++;
      if (isCorrect) subjectScores[q.subject].correct++;
    });
    const total = questions.length;
    const scorePercent = Math.round((correct / total) * 100);
    const perSubject: PerSubjectScore[] = Object.entries(subjectScores).map(([subject, s]) => ({ subject, correct: s.correct, total: s.total, percent: Math.round((s.correct / s.total) * 100) })).sort((a, b) => a.percent - b.percent);
    setResults({ score: scorePercent, correct, total, perSubject });

    await supabase.from("exam_results").insert({ user_id: user.id, exam_type: config.examType, exam_name: config.name, total_questions: total, correct_answers: correct, score_percent: scorePercent, time_spent_seconds: (config.durationMinutes * 60) - timeLeft, per_subject_scores: perSubject });

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]; const selected = answers[i];
      if (selected) {
        await supabase.from("answer_history").insert({ user_id: user.id, question_id: q.id, selected_option: selected, is_correct: q.options.find(o => o.label === selected)?.is_correct || false, response_time_seconds: 0, context: "exam" });
      }
    }

    const xpEarned = 50 + Math.round(scorePercent * 0.5);
    const { data: prof } = await supabase.from("profiles").select("total_xp, exams_completed").eq("id", user.id).single();
    if (prof) {
      await supabase.from("profiles").update({ total_xp: (prof.total_xp || 0) + xpEarned, exams_completed: (prof.exams_completed || 0) + 1, last_activity_date: new Date().toISOString().split("T")[0] }).eq("id", user.id);
    }
  }, [submitted, user, questions, answers, timeLeft, config]);

  useEffect(() => {
    if (submitted || loading) return;
    const interval = setInterval(() => { setTimeLeft(prev => { if (prev <= 1) { handleSubmit(); return 0; } return prev - 1; }); }, 1000);
    return () => clearInterval(interval);
  }, [submitted, loading, handleSubmit]);

  const formatTime = (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60; return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}` : `${m}:${sec.toString().padStart(2, "0")}`; };
  const handleAnswer = (optionLabel: string) => { setAnswers(prev => ({ ...prev, [currentIndex]: optionLabel })); };
  const toggleFlag = () => { setFlagged(prev => { const next = new Set(prev); next.has(currentIndex) ? next.delete(currentIndex) : next.add(currentIndex); return next; }); };

  if (loading) { return (<div className="min-h-screen bg-background flex items-center justify-center"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>); }

  if (questions.length === 0) {
    return (<div className="min-h-screen bg-background flex items-center justify-center px-4"><div className="text-center"><p className="text-muted-foreground">Banco de questões insuficiente para este simulado.</p><Link to="/exams" className="mt-4 inline-flex text-sm font-semibold text-primary">Voltar</Link></div></div>);
  }

  if (submitted && results) {
    const getColor = (p: number) => p >= 70 ? "text-success" : p >= 40 ? "text-warning" : "text-destructive";
    const getBg = (p: number) => p >= 70 ? "bg-success/10" : p >= 40 ? "bg-warning/10" : "bg-destructive/10";
    const getBar = (p: number) => p >= 70 ? "bg-success" : p >= 40 ? "bg-warning" : "bg-destructive";

    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="max-w-lg mx-auto">
          <div className="text-center animate-fade-in">
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-extrabold text-foreground">{config.name} — Resultado</h1>
            <div className={`mt-6 inline-flex items-center justify-center h-28 w-28 rounded-full ${getBg(results.score)} ${getColor(results.score)} text-4xl font-extrabold`}>{results.score}%</div>
            <p className="mt-3 text-sm text-muted-foreground">{results.correct} de {results.total} corretas • Tempo: {formatTime((config.durationMinutes * 60) - timeLeft)}</p>
          </div>
          <div className="mt-8 space-y-3 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-base font-bold text-foreground">Desempenho por Matéria</h2>
            {results.perSubject.map(s => (
              <div key={s.subject} className="p-4 bg-card rounded-2xl border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-foreground">{s.subject}</span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${getBg(s.percent)} ${getColor(s.percent)}`}>{s.percent}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full"><div className={`h-2 rounded-full transition-all duration-700 ${getBar(s.percent)}`} style={{ width: `${s.percent}%` }} /></div>
                <p className="text-xs text-muted-foreground mt-1">{s.correct}/{s.total} corretas</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex gap-3 justify-center animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <Link to="/exams" className="px-6 py-2.5 rounded-xl gradient-bg text-primary-foreground text-sm font-semibold">Mais Simulados</Link>
            <Link to="/desempenho" className="px-6 py-2.5 rounded-xl bg-card border border-border/50 text-foreground text-sm font-medium">Ver Performance</Link>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[currentIndex];
  const timerColor = timeLeft < 300 ? "text-destructive" : timeLeft < 600 ? "text-warning" : "text-muted-foreground";
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center justify-between h-14">
            <span className="text-sm font-bold text-foreground">{currentIndex + 1}/{questions.length}</span>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary">{config.name}</span>
            <span className={`flex items-center gap-1 text-sm font-mono font-bold ${timerColor}`}><Clock className="h-4 w-4" />{formatTime(timeLeft)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full -mt-1 mb-1"><div className="h-1.5 gradient-bg rounded-full transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} /></div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="animate-fade-in" key={currentIndex}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{q.subject}</span>
            <span className="text-[10px] text-muted-foreground">•</span>
            <span className="text-[10px] text-muted-foreground">{q.subtopic}</span>
          </div>
          <p className="text-base font-bold text-foreground leading-relaxed">{q.question_text}</p>
          <div className="mt-6 space-y-2.5">
            {q.options.map(option => {
              const isSelected = answers[currentIndex] === option.label;
              return (
                <button key={option.label} onClick={() => handleAnswer(option.label)}
                  className={`w-full p-4 rounded-2xl text-left transition-all duration-200 flex items-start gap-3 ${
                    isSelected ? "bg-primary/5 shadow-[inset_0_0_0_2px_hsl(var(--primary))]" : "bg-card border border-border/50 hover:border-primary/30 hover:shadow-interactive"
                  }`}>
                  <span className={`h-7 w-7 shrink-0 rounded-xl flex items-center justify-center text-xs font-bold ${isSelected ? "gradient-bg text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{option.label}</span>
                  <span className="text-sm text-foreground pt-0.5">{option.text}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}
            className="h-10 px-4 rounded-xl bg-card border border-border/50 text-sm font-medium text-foreground disabled:opacity-30 flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <button onClick={toggleFlag}
            className={`h-10 px-3 rounded-xl text-sm font-medium flex items-center gap-1 ${flagged.has(currentIndex) ? "bg-warning/10 text-warning border border-warning/20" : "bg-card border border-border/50 text-muted-foreground"}`}>
            <Flag className="h-4 w-4" />
          </button>
          {currentIndex < questions.length - 1 ? (
            <button onClick={() => setCurrentIndex(i => i + 1)} className="h-10 px-4 rounded-xl gradient-bg text-primary-foreground text-sm font-bold flex items-center gap-1">
              Próxima <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} className="h-10 px-5 rounded-xl bg-success text-success-foreground text-sm font-bold">
              Finalizar ({answeredCount}/{questions.length})
            </button>
          )}
        </div>

        <div className="mt-6">
          <button onClick={() => setShowNav(!showNav)} className="text-xs font-bold text-primary">{showNav ? "Esconder" : "Ver"} mapa de questões</button>
          {showNav && (
            <div className="mt-3 flex flex-wrap gap-1.5 animate-fade-in">
              {questions.map((_, i) => (
                <button key={i} onClick={() => { setCurrentIndex(i); setShowNav(false); }}
                  className={`h-8 w-8 rounded-xl text-xs font-bold transition-all ${
                    i === currentIndex ? "gradient-bg text-primary-foreground" :
                    answers[i] ? "bg-success/10 text-success border border-success/20" :
                    flagged.has(i) ? "bg-warning/10 text-warning border border-warning/20" :
                    "bg-card border border-border/50 text-muted-foreground"
                  }`}>{i + 1}</button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ExamSession;
