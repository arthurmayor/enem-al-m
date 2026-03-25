import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Clock, ChevronLeft, ChevronRight, Flag, CheckCircle2, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Question { id: string; subject: string; subtopic: string; difficulty: number; question_text: string; options: { label: string; text: string; is_correct: boolean }[]; explanation: string; }
interface PerSubjectScore { subject: string; correct: number; total: number; percent: number; }

const EXAM_CONFIGS: Record<string, { name: string; questionCount: number; durationMinutes: number; examType: string }> = {
  "fuvest-mini": { name: "Mini Simulado Fuvest", questionCount: 25, durationMinutes: 75, examType: "Fuvest" },
  "enem-rapido": { name: "ENEM Rápido", questionCount: 30, durationMinutes: 90, examType: "ENEM" },
  "fuvest": { name: "Fuvest 1ª Fase", questionCount: 45, durationMinutes: 150, examType: "Fuvest" },
  "unicamp": { name: "Unicamp", questionCount: 36, durationMinutes: 120, examType: "Unicamp" },
};

// Fuvest proportional distribution for 25 questions (total 90 → scale by 25/90 ≈ 0.278)
const FUVEST_MINI_DISTRIBUTION: Record<string, number> = {
  "Português": 4,
  "Matemática": 4,
  "História": 3,
  "Geografia": 3,
  "Biologia": 3,
  "Física": 3,
  "Química": 3,
  "Inglês": 1,
  "Filosofia": 1,
}; // = 25

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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
  const [results, setResults] = useState<{ score: number; correct: number; total: number; perSubject: PerSubjectScore[]; cutoffPercent?: number } | null>(null);
  const [showNav, setShowNav] = useState(false);

  useEffect(() => {
    if (!user) return;
    const loadQuestions = async () => {
      // Fetch questions recently answered (72h dedup)
      const since72h = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
      const { data: recentAnswers } = await supabase
        .from("answer_history")
        .select("question_id")
        .eq("user_id", user.id)
        .gte("created_at", since72h);
      const recentIds = new Set((recentAnswers || []).map(a => a.question_id));

      // Fetch from BOTH tables (diagnostic_questions + questions), combine & deduplicate
      const [{ data: diagData }, { data: questData }] = await Promise.all([
        supabase.from("diagnostic_questions").select("*").eq("is_active", true).limit(300),
        supabase.from("questions").select("*").limit(300),
      ]);
      const seen = new Set<string>();
      const allQuestions: Question[] = [];
      for (const q of [...(diagData || []), ...(questData || [])] as unknown as Question[]) {
        if (!seen.has(q.id)) { seen.add(q.id); allQuestions.push(q); }
      }

      if (allQuestions.length > 0) {
        // Separate into fresh and recent
        const fresh = allQuestions.filter((q: Question) => !recentIds.has(q.id));
        const pool = fresh.length >= config.questionCount ? fresh : allQuestions;

        const bySubject: Record<string, Question[]> = {};
        (pool as Question[]).forEach((q) => {
          if (!bySubject[q.subject]) bySubject[q.subject] = [];
          bySubject[q.subject].push(q);
        });
        Object.values(bySubject).forEach(arr => shuffleArray(arr).splice(0)); // shuffle in-place
        for (const key of Object.keys(bySubject)) {
          bySubject[key] = shuffleArray(bySubject[key]);
        }

        const picked: Question[] = [];

        if (examId === "fuvest-mini") {
          // Proportional distribution for mini simulado
          for (const [subject, count] of Object.entries(FUVEST_MINI_DISTRIBUTION)) {
            const subPool = bySubject[subject] || [];
            const take = Math.min(count, subPool.length);
            for (let i = 0; i < take; i++) picked.push(subPool[i]);
          }
          // If we didn't fill 25, pad with any remaining
          if (picked.length < 25) {
            const usedIds = new Set(picked.map(q => q.id));
            const remaining = (pool as Question[]).filter(q => !usedIds.has(q.id));
            for (const q of shuffleArray(remaining)) {
              if (picked.length >= 25) break;
              picked.push(q);
            }
          }
        } else {
          // Generic round-robin distribution
          const subjects = Object.keys(bySubject);
          let idx = 0;
          while (picked.length < config.questionCount && idx < 500) {
            const subj = subjects[idx % subjects.length];
            const subjPool = bySubject[subj];
            if (subjPool && subjPool.length > 0) picked.push(subjPool.shift()!);
            idx++;
          }
        }
        setQuestions(shuffleArray(picked));
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

    // Fetch cutoff for comparison
    let cutoffPercent: number | undefined;
    const { data: profileForCutoff } = await supabase.from("profiles").select("exam_config_id").eq("id", user.id).single();
    if (profileForCutoff?.exam_config_id) {
      const { data: ec } = await supabase.from("exam_configs").select("cutoff_mean, total_questions").eq("id", profileForCutoff.exam_config_id).single();
      if (ec && ec.total_questions > 0) {
        cutoffPercent = Math.round((ec.cutoff_mean / ec.total_questions) * 100);
      }
    }

    setResults({ score: scorePercent, correct, total, perSubject, cutoffPercent });

    await supabase.from("exam_results").insert({ user_id: user.id, exam_type: config.examType, exam_name: config.name, total_questions: total, correct_answers: correct, score_percent: scorePercent, time_spent_seconds: (config.durationMinutes * 60) - timeLeft, per_subject_scores: perSubject } as any);

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

  if (loading) { return (<div className="min-h-screen bg-white flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>); }

  if (questions.length === 0) {
    return (<div className="min-h-screen bg-white flex items-center justify-center px-4"><div className="text-center"><p className="text-muted-foreground">Banco de questões insuficiente para este simulado.</p><Link to="/exams" className="mt-4 inline-flex text-sm font-medium text-foreground">Voltar</Link></div></div>);
  }

  if (submitted && results) {
    const getColor = (p: number) => p >= 70 ? "text-success" : p >= 40 ? "text-warning" : "text-destructive";
    const getBg = (p: number) => p >= 70 ? "bg-success/10" : p >= 40 ? "bg-warning/10" : "bg-destructive/10";
    const getBar = (p: number) => p >= 70 ? "bg-success" : p >= 40 ? "bg-warning" : "bg-destructive";

    return (
      <div className="min-h-screen bg-white px-4 py-8">
        <div className="max-w-lg mx-auto">
          <div className="text-center animate-fade-in">
            <CheckCircle2 className="h-16 w-16 text-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-foreground">{config.name} — Resultado</h1>
            <div className={`mt-6 inline-flex items-center justify-center h-28 w-28 rounded-full ${getBg(results.score)} ${getColor(results.score)} text-4xl font-semibold`}>{results.score}%</div>
            <p className="mt-3 text-sm text-muted-foreground">{results.correct} de {results.total} corretas • Tempo: {formatTime((config.durationMinutes * 60) - timeLeft)}</p>
          </div>
          {results.cutoffPercent !== undefined && (
            <div className="mt-6 p-4 bg-white rounded-2xl border border-gray-100 animate-fade-in" style={{ animationDelay: "0.08s" }}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-foreground" />
                <span className="text-sm font-semibold text-foreground">Comparação com nota de corte</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="h-3 bg-gray-100 rounded-full relative overflow-hidden">
                    <div className={`h-3 rounded-full transition-all duration-700 ${results.score >= results.cutoffPercent ? "bg-success" : "bg-warning"}`} style={{ width: `${Math.min(results.score, 100)}%` }} />
                    <div className="absolute top-0 bottom-0 w-0.5 bg-foreground" style={{ left: `${Math.min(results.cutoffPercent, 100)}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-muted-foreground">Você: {results.score}%</span>
                    <span className="text-xs text-muted-foreground">Corte: {results.cutoffPercent}%</span>
                  </div>
                </div>
              </div>
              <p className="text-xs mt-2 font-medium" style={{ color: results.score >= results.cutoffPercent ? "hsl(var(--success))" : "hsl(var(--warning))" }}>
                {results.score >= results.cutoffPercent ? "Acima da nota de corte!" : `Faltam ${results.cutoffPercent - results.score}% para a nota de corte`}
              </p>
            </div>
          )}
          <div className="mt-8 space-y-3 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-base font-semibold text-foreground">Desempenho por Matéria</h2>
            {results.perSubject.map(s => (
              <div key={s.subject} className="p-4 bg-white rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-foreground">{s.subject}</span>
                  <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${getBg(s.percent)} ${getColor(s.percent)}`}>{s.percent}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full"><div className={`h-2 rounded-full transition-all duration-700 ${getBar(s.percent)}`} style={{ width: `${s.percent}%` }} /></div>
                <p className="text-xs text-muted-foreground mt-1">{s.correct}/{s.total} corretas</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex gap-3 justify-center animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <Link to="/exams" className="px-6 py-2.5 rounded-full bg-foreground text-white text-sm font-medium">Mais Simulados</Link>
            <Link to="/desempenho" className="px-6 py-2.5 rounded-full bg-white border border-gray-200 text-foreground text-sm font-medium">Ver Performance</Link>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[currentIndex];
  const timerColor = timeLeft < 300 ? "text-destructive" : timeLeft < 600 ? "text-warning" : "text-muted-foreground";
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center justify-between h-14">
            <span className="text-sm font-semibold text-foreground">{currentIndex + 1}/{questions.length}</span>
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-foreground">{config.name}</span>
            <span className={`flex items-center gap-1 text-sm font-mono font-semibold ${timerColor}`}><Clock className="h-4 w-4" />{formatTime(timeLeft)}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full -mt-1 mb-1"><div className="h-1.5 bg-foreground rounded-full transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} /></div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="animate-fade-in" key={currentIndex}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{q.subject}</span>
            <span className="text-[10px] text-muted-foreground">•</span>
            <span className="text-[10px] text-muted-foreground">{q.subtopic}</span>
          </div>
          <p className="text-base font-semibold text-foreground leading-relaxed">{q.question_text}</p>
          <div className="mt-6 space-y-2.5">
            {q.options.map(option => {
              const isSelected = answers[currentIndex] === option.label;
              return (
                <button key={option.label} onClick={() => handleAnswer(option.label)}
                  className={`w-full p-4 rounded-2xl text-left transition-all duration-200 flex items-start gap-3 ${
                    isSelected ? "bg-gray-50 shadow-[inset_0_0_0_2px_hsl(var(--foreground))]" : "bg-white border border-gray-200 hover:border-gray-400 hover:shadow-md"
                  }`}>
                  <span className={`h-7 w-7 shrink-0 rounded-xl flex items-center justify-center text-xs font-semibold ${isSelected ? "bg-foreground text-white" : "bg-gray-100 text-muted-foreground"}`}>{option.label}</span>
                  <span className="text-sm text-foreground pt-0.5">{option.text}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}
            className="h-10 px-4 rounded-full bg-white border border-gray-200 text-sm font-medium text-foreground disabled:opacity-30 flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <button onClick={toggleFlag}
            className={`h-10 px-3 rounded-full text-sm font-medium flex items-center gap-1 ${flagged.has(currentIndex) ? "bg-warning/10 text-warning border border-warning/20" : "bg-white border border-gray-200 text-muted-foreground"}`}>
            <Flag className="h-4 w-4" />
          </button>
          {currentIndex < questions.length - 1 ? (
            <button onClick={() => setCurrentIndex(i => i + 1)} className="h-10 px-4 rounded-full bg-foreground text-white text-sm font-medium flex items-center gap-1">
              Próxima <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} className="h-10 px-5 rounded-full bg-foreground text-white text-sm font-medium">
              Finalizar ({answeredCount}/{questions.length})
            </button>
          )}
        </div>

        <div className="mt-6">
          <button onClick={() => setShowNav(!showNav)} className="text-xs font-medium text-foreground">{showNav ? "Esconder" : "Ver"} mapa de questões</button>
          {showNav && (
            <div className="mt-3 flex flex-wrap gap-1.5 animate-fade-in">
              {questions.map((_, i) => (
                <button key={i} onClick={() => { setCurrentIndex(i); setShowNav(false); }}
                  className={`h-8 w-8 rounded-xl text-xs font-semibold transition-all ${
                    i === currentIndex ? "bg-foreground text-white" :
                    answers[i] ? "bg-success/10 text-success border border-success/20" :
                    flagged.has(i) ? "bg-warning/10 text-warning border border-warning/20" :
                    "bg-white border border-gray-200 text-muted-foreground"
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
