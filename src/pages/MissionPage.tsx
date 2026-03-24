import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Question { id: string; subject: string; subtopic: string; difficulty: number; question_text: string; options: { label: string; text: string; is_correct: boolean }[]; explanation: string; }
interface MissionData { id: string; subject: string; subtopic: string; mission_type: string; status: string; }

const BLOCK_MAP: Record<string, string[]> = {
  "Português": ["Português", "Inglês"],
  "Inglês": ["Português", "Inglês"],
  "História": ["História", "Geografia", "Filosofia"],
  "Geografia": ["História", "Geografia", "Filosofia"],
  "Filosofia": ["História", "Geografia", "Filosofia"],
  "Biologia": ["Biologia", "Física", "Química"],
  "Física": ["Biologia", "Física", "Química"],
  "Química": ["Biologia", "Física", "Química"],
  "Matemática": ["Matemática"],
};

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchMissionQuestions(
  userId: string,
  subject: string,
  subtopic: string,
  examSlug: string = "fuvest",
  limit: number = 8
): Promise<Question[]> {
  // Buscar IDs de questões respondidas nas últimas 48h
  const { data: recentAnswers } = await supabase
    .from("answer_history")
    .select("question_id")
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString());
  const recentIds = new Set((recentAnswers || []).map(a => a.question_id));

  // Helper: buscar de ambas as tabelas e combinar
  async function fetchBoth(
    diagFilter: (q: ReturnType<ReturnType<typeof supabase.from>["select"]>) => typeof q,
    questFilter: (q: ReturnType<ReturnType<typeof supabase.from>["select"]>) => typeof q,
    fetchLimit: number
  ): Promise<Question[]> {
    const [diagResult, questResult] = await Promise.all([
      diagFilter(supabase.from("diagnostic_questions").select("*").eq("is_active", true)).limit(fetchLimit),
      questFilter(supabase.from("questions").select("*")).limit(fetchLimit),
    ]);
    const seen = new Set<string>();
    const combined: Question[] = [];
    for (const q of [...(diagResult.data || []), ...(questResult.data || [])] as any[]) {
      if (!seen.has(q.id)) { seen.add(q.id); combined.push(q as Question); }
    }
    return combined;
  }

  // Nível 1: buscar por subtópico (ilike parcial) em ambas as tabelas
  const level1 = await fetchBoth(
    (q) => q.eq("exam_slug", examSlug).eq("subject", subject).ilike("subtopic", `%${subtopic}%`),
    (q) => q.eq("subject", subject).ilike("subtopic", `%${subtopic}%`),
    limit
  );
  if (level1.length >= 5) {
    const fresh = level1.filter(q => !recentIds.has(q.id));
    const pool = fresh.length >= 3 ? fresh : level1;
    return shuffleArray(pool).slice(0, limit);
  }

  // Nível 2: buscar por matéria inteira (ignora subtópico)
  const level2 = await fetchBoth(
    (q) => q.eq("exam_slug", examSlug).eq("subject", subject),
    (q) => q.eq("subject", subject),
    limit * 2
  );
  if (level2.length >= 3) {
    const fresh = level2.filter(q => !recentIds.has(q.id));
    const pool = fresh.length >= 3 ? fresh : level2;
    return shuffleArray(pool).slice(0, limit);
  }

  // Nível 3: buscar por bloco (linguagens, humanas, natureza, matemática)
  const blockSubjects = BLOCK_MAP[subject] || [subject];
  const level3 = await fetchBoth(
    (q) => q.eq("exam_slug", examSlug).in("subject", blockSubjects),
    (q) => q.in("subject", blockSubjects),
    limit * 3
  );
  if (level3.length >= 3) {
    const fresh = level3.filter(q => !recentIds.has(q.id));
    const pool = fresh.length >= 3 ? fresh : level3;
    return shuffleArray(pool).slice(0, limit);
  }

  // Nível 4: qualquer questão ativa (último recurso)
  const level4 = await fetchBoth(
    (q) => q.eq("exam_slug", examSlug),
    (q) => q,
    limit * 3
  );
  if (level4.length > 0) {
    const fresh = level4.filter(q => !recentIds.has(q.id));
    const pool = fresh.length >= 3 ? fresh : level4;
    return shuffleArray(pool).slice(0, limit);
  }

  return [];
}

const MissionPage = () => {
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [mission, setMission] = useState<MissionData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    const loadMission = async () => {
      const { data: missionData } = await supabase.from("daily_missions").select("id, subject, subtopic, mission_type, status").eq("id", id).single();
      if (missionData) { setMission(missionData); if (missionData.status === "completed") { setCompleted(true); setLoading(false); return; } }
      const subject = missionData?.subject || "";
      const subtopic = missionData?.subtopic || "";
      const selectedQuestions = await fetchMissionQuestions(user.id, subject, subtopic);
      setQuestions(selectedQuestions);
      setLoading(false);
      setQuestionStartTime(Date.now());
    };
    loadMission();
  }, [user, id]);

  const currentQuestion = questions[currentIndex];

  const handleAnswer = useCallback(async (optionLabel: string) => {
    if (selectedOption || !currentQuestion || !user) return;
    setSelectedOption(optionLabel);
    const correct = currentQuestion.options.find((o) => o.label === optionLabel)?.is_correct || false;
    const responseTime = Math.floor((Date.now() - questionStartTime) / 1000);
    setScore((prev) => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));
    if (!currentQuestion.id.startsWith("mock")) {
      await supabase.from("answer_history").insert({ user_id: user.id, question_id: currentQuestion.id, selected_option: optionLabel, is_correct: correct, response_time_seconds: responseTime, context: "practice" });
    }
    setTimeout(() => {
      if (currentIndex < questions.length - 1) { setCurrentIndex((i) => i + 1); setSelectedOption(null); setQuestionStartTime(Date.now()); }
      else finishMission();
    }, 1200);
  }, [selectedOption, currentQuestion, currentIndex, questionStartTime, user, questions.length]);

  const finishMission = async () => {
    if (!user || !id) return;
    const finalScore = Math.round(((score.correct + (currentQuestion?.options.find((o) => o.label === selectedOption)?.is_correct ? 1 : 0)) / (score.total + 1)) * 100);
    await supabase.from("daily_missions").update({ status: "completed", score: finalScore }).eq("id", id);
    setCompleted(true);
    const today = new Date().toISOString().split("T")[0];
    const { data: currentProfile } = await supabase.from("profiles").select("total_xp, current_streak, longest_streak, missions_completed, last_activity_date").eq("id", user.id).single();
    if (currentProfile) {
      const lastDate = currentProfile.last_activity_date;
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      const newStreak = lastDate === yesterdayStr ? (currentProfile.current_streak || 0) + 1 : lastDate === today ? currentProfile.current_streak || 1 : 1;
      const xpEarned = 10 + Math.round(finalScore * 0.5);
      await supabase.from("profiles").update({ total_xp: (currentProfile.total_xp || 0) + xpEarned, current_streak: newStreak, longest_streak: Math.max(newStreak, currentProfile.longest_streak || 0), missions_completed: (currentProfile.missions_completed || 0) + 1, last_activity_date: today }).eq("id", user.id);
    }
  };

  if (loading) { return (<div className="min-h-screen bg-white flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>); }

  if (completed) {
    const finalPercent = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
    const scoreColor = finalPercent >= 70 ? "text-success bg-success/10" : finalPercent >= 40 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm animate-fade-in">
          <CheckCircle2 className="h-16 w-16 text-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-foreground">Missão Concluída!</h1>
          {score.total > 0 && (<div className={`mt-4 inline-flex items-center justify-center h-20 w-20 rounded-full ${scoreColor} text-2xl font-semibold`}>{finalPercent}%</div>)}
          <p className="text-sm text-muted-foreground mt-4">{mission?.subject} — {mission?.subtopic}</p>
          {score.total > 0 && (<p className="text-sm text-muted-foreground mt-1">{score.correct} de {score.total} corretas</p>)}
          <div className="mt-8 flex gap-3 justify-center">
            <Link to="/dashboard" className="px-6 py-2.5 rounded-full bg-foreground text-white text-sm font-medium hover:bg-foreground/90 transition-all">Voltar ao Dashboard</Link>
            <Link to="/study" className="px-6 py-2.5 rounded-full bg-white border border-gray-200 text-foreground text-sm font-medium hover:shadow-md transition-all">Mais Missões</Link>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 px-6 text-center">
          <p className="text-lg font-medium text-foreground">
            Estamos preparando questões para este tópico
          </p>
          <p className="text-sm text-muted-foreground">
            Enquanto isso, que tal conversar com o Tutor IA sobre {mission?.subject || "este assunto"}?
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate(-1)}>
              ← Voltar
            </Button>
            <Button onClick={() => navigate("/ai-tutor")}>
              Abrir Tutor IA
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center justify-between h-14">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
            <span className="text-sm font-semibold text-foreground">{currentIndex + 1} de {questions.length}</span>
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-foreground">{mission?.subject}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full -mt-1 mb-1"><div className="h-1.5 bg-foreground rounded-full transition-all duration-500" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} /></div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="animate-fade-in" key={currentIndex}>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">{mission?.subtopic}</p>
          <p className="text-lg font-semibold text-foreground leading-relaxed">{currentQuestion.question_text}</p>

          <div className="mt-8 space-y-3">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedOption === option.label;
              const showResult = selectedOption !== null;
              const isCorrect = option.is_correct;

              let optionClasses = "w-full p-4 rounded-2xl text-left transition-all duration-200 flex items-start gap-3 ";
              if (showResult) {
                if (isCorrect) optionClasses += "bg-success/10 shadow-[inset_0_0_0_2px_hsl(var(--success))]";
                else if (isSelected && !isCorrect) optionClasses += "bg-destructive/10 shadow-[inset_0_0_0_2px_hsl(var(--destructive))]";
                else optionClasses += "bg-white opacity-50";
              } else {
                optionClasses += "bg-white border border-gray-200 hover:border-gray-400 hover:shadow-md cursor-pointer";
              }

              return (
                <button key={option.label} onClick={() => handleAnswer(option.label)} disabled={!!selectedOption} className={optionClasses}>
                  <span className={`h-8 w-8 shrink-0 rounded-xl flex items-center justify-center text-sm font-semibold ${
                    showResult && isCorrect ? "bg-success text-success-foreground" :
                    showResult && isSelected ? "bg-destructive text-destructive-foreground" :
                    "bg-gray-100 text-muted-foreground"
                  }`}>{option.label}</span>
                  <span className="text-sm text-foreground pt-1">{option.text}</span>
                </button>
              );
            })}
          </div>

          {selectedOption && currentQuestion.explanation && (
            <div className="mt-6 p-4 bg-gray-50 rounded-2xl animate-fade-in">
              <p className="text-xs font-semibold text-foreground mb-1">Explicação</p>
              <p className="text-sm text-foreground leading-relaxed">{currentQuestion.explanation}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default MissionPage;
