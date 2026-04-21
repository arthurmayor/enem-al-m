import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Clock, ChevronLeft, ChevronRight, Flag, CheckCircle2, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import SubjectBadge from "@/components/ui/SubjectBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import { getSubjectColor } from "@/lib/subjectColors";
import { useInvalidateDashboard } from "@/hooks/dashboard/useInvalidateDashboard";

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
  const invalidateDashboard = useInvalidateDashboard();
  const fallbackConfig = EXAM_CONFIGS[examId || ""] || EXAM_CONFIGS["enem-rapido"];

  const [config, setConfig] = useState(fallbackConfig);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(fallbackConfig.durationMinutes * 60);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<{ score: number; correct: number; total: number; perSubject: PerSubjectScore[]; cutoffPercent?: number } | null>(null);
  const [showNav, setShowNav] = useState(false);

  useEffect(() => {
    if (!user) return;
    const loadQuestions = async () => {
      // Resolve config: try DB first, then fallback to hardcoded
      let resolvedConfig = fallbackConfig;
      if (examId) {
        const { data: dbConfig } = await supabase
          .from("exam_configs")
          .select("exam_slug, exam_name, total_questions, subject_distribution")
          .eq("exam_slug", examId)
          .eq("is_active", true)
          .limit(1)
          .single();
        if (dbConfig) {
          resolvedConfig = {
            name: dbConfig.exam_name,
            questionCount: dbConfig.total_questions,
            durationMinutes: Math.round(dbConfig.total_questions * 3),
            examType: dbConfig.exam_name,
          };
        }
      }
      setConfig(resolvedConfig);
      setTimeLeft(resolvedConfig.durationMinutes * 60);
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
        const pool = fresh.length >= resolvedConfig.questionCount ? fresh : allQuestions;

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
          while (picked.length < resolvedConfig.questionCount && idx < 500) {
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

    // Dashboard consumes exam_results (useExamHighlights / useExamsEvolution /
    // useDashboardMetrics.total_exams, best/last_exam_score), answer_history
    // (useAccuracy*, useQuestions*, useProficiency*) and profiles.total_xp —
    // all of which we just mutated. Mark the dashboard queries stale so the
    // user sees the updated numbers when they navigate back.
    invalidateDashboard();
  }, [submitted, user, questions, answers, timeLeft, config, invalidateDashboard]);

  useEffect(() => {
    if (submitted || loading) return;
    const interval = setInterval(() => { setTimeLeft(prev => { if (prev <= 1) { handleSubmit(); return 0; } return prev - 1; }); }, 1000);
    return () => clearInterval(interval);
  }, [submitted, loading, handleSubmit]);

  const formatTime = (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60; return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}` : `${m}:${sec.toString().padStart(2, "0")}`; };
  const handleAnswer = (optionLabel: string) => { setAnswers(prev => ({ ...prev, [currentIndex]: optionLabel })); };
  const toggleFlag = () => { setFlagged(prev => { const next = new Set(prev); next.has(currentIndex) ? next.delete(currentIndex) : next.add(currentIndex); return next; }); };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-ink-strong border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-ink-soft">Banco de questões insuficiente para este simulado.</p>
          <Link to="/exams" className="mt-4 inline-flex text-sm font-medium text-ink-strong underline underline-offset-4">Voltar</Link>
        </div>
      </div>
    );
  }

  if (submitted && results) {
    const getScoreColor = (p: number) => p >= 70 ? "text-signal-ok" : p >= 40 ? "text-brand-500" : "text-signal-error";

    return (
      <div className="min-h-screen bg-bg-app px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center animate-fade-in">
            <CheckCircle2 className="h-16 w-16 text-signal-ok mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-ink-strong">{config.name} — Resultado</h1>
            <p className={`mt-4 text-4xl font-bold ${getScoreColor(results.score)}`}>{results.score}%</p>
            <p className="mt-2 text-sm text-ink-muted">{results.correct} de {results.total} corretas · Tempo: {formatTime((config.durationMinutes * 60) - timeLeft)}</p>
          </div>

          {results.cutoffPercent !== undefined && (
            <div className="mt-6 bg-bg-card rounded-card p-5 border border-line-light shadow-card animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-ink-strong" />
                <span className="text-sm font-semibold text-ink-strong">Comparação com nota de corte</span>
              </div>
              <div className="h-3 bg-line rounded-full relative overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-700 ${results.score >= results.cutoffPercent ? "bg-signal-ok" : "bg-brand-500"}`}
                  style={{ width: `${Math.min(results.score, 100)}%` }}
                />
                <div className="absolute top-0 bottom-0 w-0.5 bg-ink-strong" style={{ left: `${Math.min(results.cutoffPercent, 100)}%` }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-xs text-ink-muted">Você: {results.score}%</span>
                <span className="text-xs text-ink-muted">Corte: {results.cutoffPercent}%</span>
              </div>
              <p className={`text-xs mt-2 font-medium ${results.score >= results.cutoffPercent ? "text-signal-ok" : "text-brand-500"}`}>
                {results.score >= results.cutoffPercent ? "Acima da nota de corte!" : `Faltam ${results.cutoffPercent - results.score}% para a nota de corte`}
              </p>
            </div>
          )}

          <div className="mt-8 animate-fade-in">
            <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wider mb-4">Desempenho por Matéria</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {results.perSubject.map(s => (
                <div
                  key={s.subject}
                  className="bg-bg-card rounded-card p-4 border border-line-light shadow-card"
                  style={{ borderTopWidth: "3px", borderTopColor: getSubjectColor(s.subject) }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <SubjectBadge subject={s.subject} />
                    <span className={`text-sm font-bold ${getScoreColor(s.percent)}`}>{s.percent}%</span>
                  </div>
                  <ProgressBar value={s.percent} />
                  <p className="text-xs text-ink-muted mt-2">{s.correct}/{s.total} corretas</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex gap-3 justify-center animate-fade-in">
            <Link to="/exams" className="bg-ink-strong text-white rounded-input px-6 py-3 text-sm font-medium hover:opacity-90 transition-all">
              Voltar aos simulados
            </Link>
            <Link to="/desempenho" className="bg-bg-card border border-line-light text-ink rounded-input px-6 py-3 text-sm font-medium hover:shadow-card transition-all">
              Ver Performance
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const timerMinutes = Math.floor(timeLeft / 60);

  return (
    <div className="min-h-screen bg-bg-app flex flex-col">
      {/* Timer bar */}
      <div className="sticky top-0 z-10 bg-bg-card border-b border-line-light p-4 flex items-center justify-between">
        <span className="text-sm text-ink-soft">{config.name}</span>
        <span className={`text-2xl font-bold font-mono ${
          timerMinutes < 5 ? "text-signal-error animate-pulse" :
          timerMinutes < 10 ? "text-signal-error" :
          "text-ink-strong"
        }`}>
          <Clock className="h-4 w-4 inline mr-1" />
          {formatTime(timeLeft)}
        </span>
      </div>

      {/* Nav grid */}
      <div className="bg-bg-card rounded-card p-4 border border-line-light shadow-card mx-4 mt-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {questions.map((_, i) => (
            <button key={i} onClick={() => setCurrentIndex(i)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-medium cursor-pointer transition-colors ${
                i === currentIndex
                  ? "border-2 border-brand-500 text-brand-500 font-bold"
                  : answers[i]
                    ? "bg-signal-ok text-white"
                    : flagged.has(i)
                      ? "border-2 border-signal-warn bg-signal-warn/10 text-signal-warn"
                      : "bg-bg-app text-ink-soft border border-line"
              }`}>{i + 1}</button>
          ))}
        </div>
      </div>

      {/* Question card */}
      <main className="flex-1 px-4 max-w-3xl mx-auto w-full">
        <div className="bg-bg-card rounded-card p-6 border border-line-light shadow-card animate-fade-in" key={currentIndex}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-ink-muted">Questão {currentIndex + 1} de {questions.length}</span>
            <span className="text-xs text-ink-muted">·</span>
            <SubjectBadge subject={q.subject} />
          </div>
          <p className="text-base text-ink leading-relaxed mb-6">{q.question_text}</p>

          <div className="space-y-3">
            {q.options.map(option => {
              const isSelected = answers[currentIndex] === option.label;
              return (
                <button key={option.label} onClick={() => handleAnswer(option.label)}
                  className={`w-full border rounded-input p-4 transition-all duration-200 flex items-center gap-3 text-left ${
                    isSelected
                      ? "border-brand-500 bg-brand-50"
                      : "border-line hover:border-ink-soft"
                  }`}>
                  <span className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-medium shrink-0 ${
                    isSelected
                      ? "bg-brand-500 text-white border-brand-500"
                      : "border-line text-ink-muted"
                  }`}>{option.label}</span>
                  <span className="text-sm text-ink">{option.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <div className="sticky bottom-0 bg-bg-card border-t border-line-light p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}
            className="bg-transparent text-ink-soft hover:text-ink disabled:opacity-50 text-sm font-medium flex items-center gap-1 transition-colors">
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>

          <div className="flex items-center gap-2">
            <button onClick={toggleFlag}
              className={`h-9 px-3 rounded-input text-sm font-medium flex items-center gap-1 transition-colors ${
                flagged.has(currentIndex)
                  ? "bg-signal-warn/10 text-signal-warn border border-signal-warn/20"
                  : "bg-bg-app border border-line text-ink-muted"
              }`}>
              <Flag className="h-3.5 w-3.5" />
            </button>
            <span className="text-sm text-ink-muted">Questão {currentIndex + 1} de {questions.length}</span>
          </div>

          {currentIndex < questions.length - 1 ? (
            <button onClick={() => setCurrentIndex(i => i + 1)}
              className="bg-ink-strong text-white rounded-input px-4 py-2 text-sm font-medium flex items-center gap-1 hover:opacity-90 transition-all">
              Próxima <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={handleSubmit}
              className="bg-ink-strong text-white rounded-input px-4 py-2 text-sm font-medium hover:opacity-90 transition-all">
              Finalizar ({answeredCount}/{questions.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamSession;
