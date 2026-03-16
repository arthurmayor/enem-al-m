import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const subjects = ["Matemática", "Português", "Biologia", "Química", "Física", "História", "Geografia"];

const mockQuestions = subjects.flatMap((subject, si) =>
  Array.from({ length: 5 }, (_, qi) => ({
    id: `mock-${si}-${qi}`, subject, subtopic: `Tópico ${qi + 1}`, difficulty: 3,
    question_text: `[${subject}] Questão de exemplo ${qi + 1} — Esta é uma questão placeholder de dificuldade média. Selecione a alternativa correta.`,
    options: [
      { label: "A", text: "Alternativa A", is_correct: qi === 0 },
      { label: "B", text: "Alternativa B", is_correct: qi === 1 },
      { label: "C", text: "Alternativa C", is_correct: qi === 2 },
      { label: "D", text: "Alternativa D", is_correct: qi === 3 },
      { label: "E", text: "Alternativa E", is_correct: qi === 4 },
    ],
    explanation: "Explicação da resposta correta.",
  }))
);

interface Question { id: string; subject: string; subtopic: string; difficulty: number; question_text: string; options: { label: string; text: string; is_correct: boolean }[]; explanation: string; }

const DiagnosticTest = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState(3);
  const [startTime, setStartTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setElapsedTime(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  useEffect(() => {
    const loadQuestions = async () => {
      const { data } = await supabase.from("questions").select("*").limit(100);
      if (data && data.length >= 25) {
        const bySubject: Record<string, Question[]> = {};
        data.forEach((q: Question) => { if (!bySubject[q.subject]) bySubject[q.subject] = []; bySubject[q.subject].push(q); });
        const picked: Question[] = [];
        let subjectIdx = 0;
        while (picked.length < 25) {
          const subj = subjects[subjectIdx % subjects.length];
          const available = bySubject[subj]?.filter((q) => !picked.includes(q));
          if (available?.length) picked.push(available[0]);
          subjectIdx++;
          if (subjectIdx > 175) break;
        }
        setQuestions(picked);
      } else {
        setUsingMock(true);
        setQuestions(mockQuestions.slice(0, 25));
      }
      setLoading(false);
      setStartTime(Date.now());
      setQuestionStartTime(Date.now());
    };
    loadQuestions();
  }, []);

  const currentQuestion = questions[currentIndex];
  const currentSubject = currentQuestion?.subject || "";
  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const handleAnswer = useCallback(async (optionLabel: string) => {
    if (selectedOption) return;
    setSelectedOption(optionLabel);
    const q = currentQuestion;
    const correct = q.options.find((o) => o.label === optionLabel)?.is_correct || false;
    const responseTime = Math.floor((Date.now() - questionStartTime) / 1000);

    if (user && !q.id.startsWith("mock")) {
      await supabase.from("answer_history").insert({
        user_id: user.id, question_id: q.id, selected_option: optionLabel,
        is_correct: correct, response_time_seconds: responseTime, context: "diagnostic",
      });
    }

    if (correct && responseTime < 60) setDifficulty((d) => Math.min(5, d + 1));
    else if (!correct) setDifficulty((d) => Math.max(1, d - 1));

    setTimeout(() => {
      if (currentIndex < 24) {
        setCurrentIndex((i) => i + 1);
        setSelectedOption(null);
        setQuestionStartTime(Date.now());
      } else {
        navigate("/diagnostic/loading");
      }
    }, 1200);
  }, [selectedOption, currentQuestion, currentIndex, questionStartTime, user, navigate]);

  if (loading || !currentQuestion) {
    return (<div className="min-h-screen bg-white flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>);
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center justify-between h-14">
            <span className="text-sm font-semibold text-foreground">Questão {currentIndex + 1} de 25</span>
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-foreground">{currentSubject}</span>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {formatTime(elapsedTime)}
            </div>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full -mt-1 mb-1">
            <div className="h-1.5 bg-foreground rounded-full transition-all duration-500 ease-out" style={{ width: `${((currentIndex + 1) / 25) * 100}%` }} />
          </div>
        </div>
      </header>

      {usingMock && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
          <p className="text-xs text-center text-muted-foreground font-medium max-w-3xl mx-auto">
            Modo demonstração — banco de questões vazio. Importe questões para diagnóstico real.
          </p>
        </div>
      )}

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="animate-fade-in" key={currentIndex}>
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

          <div className="mt-6 flex items-center justify-center gap-1">
            {[1, 2, 3, 4, 5].map((d) => (
              <div key={d} className={`h-1.5 w-6 rounded-full transition-all ${d <= difficulty ? "bg-foreground" : "bg-gray-200"}`} />
            ))}
            <span className="ml-2 text-[10px] text-muted-foreground">Dificuldade</span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DiagnosticTest;
