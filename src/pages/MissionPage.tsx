import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Question {
  id: string;
  subject: string;
  subtopic: string;
  difficulty: number;
  question_text: string;
  options: { label: string; text: string; is_correct: boolean }[];
  explanation: string;
}

interface MissionData {
  id: string;
  subject: string;
  subtopic: string;
  mission_type: string;
  status: string;
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
      const { data: missionData } = await supabase
        .from("daily_missions")
        .select("id, subject, subtopic, mission_type, status")
        .eq("id", id)
        .single();
      if (missionData) {
        setMission(missionData);
        if (missionData.status === "completed") {
          setCompleted(true);
          setLoading(false);
          return;
        }
      }

      const subject = missionData?.subject || "";
      const subtopic = missionData?.subtopic || "";
      const { data: questionData } = await supabase
        .from("questions")
        .select("*")
        .eq("subject", subject)
        .limit(10);

      if (questionData && questionData.length > 0) {
        const matching = questionData.filter((q: Question) =>
          q.subtopic.toLowerCase().includes(subtopic.toLowerCase()) ||
          subtopic.toLowerCase().includes(q.subtopic.toLowerCase())
        );
        setQuestions(matching.length >= 5 ? matching.slice(0, 8) : questionData.slice(0, 8));
      }
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

    setScore((prev) => ({
      correct: prev.correct + (correct ? 1 : 0),
      total: prev.total + 1,
    }));

    if (!currentQuestion.id.startsWith("mock")) {
      await supabase.from("answer_history").insert({
        user_id: user.id,
        question_id: currentQuestion.id,
        selected_option: optionLabel,
        is_correct: correct,
        response_time_seconds: responseTime,
        context: "practice",
      });
    }

    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex((i) => i + 1);
        setSelectedOption(null);
        setQuestionStartTime(Date.now());
      } else {
        finishMission();
      }
    }, 1200);
  }, [selectedOption, currentQuestion, currentIndex, questionStartTime, user, questions.length]);

  const finishMission = async () => {
    if (!user || !id) return;
    const finalScore = Math.round(((score.correct + (currentQuestion?.options.find((o) => o.label === selectedOption)?.is_correct ? 1 : 0)) / (score.total + 1)) * 100);
    await supabase
      .from("daily_missions")
      .update({ status: "completed", score: finalScore })
      .eq("id", id);
    setCompleted(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (completed) {
    const finalPercent = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
    const scoreColor = finalPercent >= 70 ? "text-success bg-success/10" : finalPercent >= 40 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-sm animate-fade-in">
          <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Missão Concluída!</h1>
          {score.total > 0 && (
            <div className={`mt-4 inline-flex items-center justify-center h-20 w-20 rounded-full ${scoreColor} text-2xl font-bold`}>
              {finalPercent}%
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-4">
            {mission?.subject} — {mission?.subtopic}
          </p>
          {score.total > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {score.correct} de {score.total} corretas
            </p>
          )}
          <div className="mt-8 flex gap-3 justify-center">
            <Link
              to="/dashboard"
              className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
            >
              Voltar ao Dashboard
            </Link>
            <Link
              to="/study"
              className="px-6 py-2.5 rounded-lg bg-card shadow-rest text-foreground text-sm font-medium hover:shadow-interactive transition-all"
            >
              Mais Missões
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-muted-foreground">Sem questões disponíveis para este tópico.</p>
          <p className="text-xs text-muted-foreground mt-2">
            {mission?.subject} — {mission?.subtopic}
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card shadow-rest">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center justify-between h-14">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <span className="text-sm font-semibold text-foreground">
              {currentIndex + 1} de {questions.length}
            </span>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/5 text-primary">
              {mission?.subject}
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full -mt-1 mb-1">
            <div
              className="h-1 bg-primary rounded-full transition-all duration-500"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="animate-fade-in" key={currentIndex}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {mission?.subtopic}
          </p>
          <p className="text-lg font-semibold text-foreground leading-relaxed">
            {currentQuestion.question_text}
          </p>

          <div className="mt-8 space-y-3">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedOption === option.label;
              const showResult = selectedOption !== null;
              const isCorrect = option.is_correct;

              let optionClasses = "w-full p-4 rounded-xl text-left transition-all duration-200 flex items-start gap-3 ";
              if (showResult) {
                if (isCorrect) optionClasses += "bg-success/10 shadow-[inset_0_0_0_2px_hsl(var(--success))]";
                else if (isSelected && !isCorrect) optionClasses += "bg-destructive/10 shadow-[inset_0_0_0_2px_hsl(var(--destructive))]";
                else optionClasses += "bg-background opacity-50";
              } else {
                optionClasses += "bg-card shadow-rest hover:shadow-interactive cursor-pointer";
              }

              return (
                <button
                  key={option.label}
                  onClick={() => handleAnswer(option.label)}
                  disabled={!!selectedOption}
                  className={optionClasses}
                >
                  <span className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold ${
                    showResult && isCorrect ? "bg-success text-success-foreground" :
                    showResult && isSelected ? "bg-destructive text-destructive-foreground" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {option.label}
                  </span>
                  <span className="text-sm text-foreground pt-1">{option.text}</span>
                </button>
              );
            })}
          </div>

          {selectedOption && currentQuestion.explanation && (
            <div className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/10 animate-fade-in">
              <p className="text-xs font-semibold text-primary mb-1">Explicação</p>
              <p className="text-sm text-foreground leading-relaxed">{currentQuestion.explanation}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default MissionPage;
