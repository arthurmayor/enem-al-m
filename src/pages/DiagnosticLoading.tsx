import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Brain, Sparkles, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const tips = [
  { icon: Brain, text: "A IA está identificando seus pontos fortes e fracos..." },
  { icon: Sparkles, text: "Criando seu perfil de aprendizado personalizado..." },
  { icon: BarChart3, text: "Calculando suas proficiências por matéria..." },
];

const DiagnosticLoading = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentTip, setCurrentTip] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tipInterval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % tips.length);
    }, 2500);

    return () => clearInterval(tipInterval);
  }, []);

  useEffect(() => {
    if (!user) return;

    const runAnalysis = async () => {
      try {
        const { data: answers, error: answersError } = await supabase
          .from("answer_history")
          .select("*")
          .eq("user_id", user.id)
          .eq("context", "diagnostic")
          .order("created_at", { ascending: true });

        if (answersError) throw new Error(answersError.message);
        if (!answers?.length) {
          setError("Nenhuma resposta de diagnóstico encontrada.");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("name, education_goal, school_year, desired_course, exam_date, hours_per_day, study_days")
          .eq("id", user.id)
          .single();

        const userProfile = profile || {};

        const { data: { session } } = await supabase.auth.getSession();
        const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZmdxcmpjcnpncnByenFlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTksImV4cCI6MjA4OTEyMjY1OX0.Q4jeuVOyZr3DheO7nLg4ISgD7SBnTUoBXA6VAgB4_0E";

        const fnResponse = await fetch("https://nbfgqrjcrzgrprzqedtl.supabase.co/functions/v1/analyze-diagnostic", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + (session?.access_token || anonKey),
            "apikey": anonKey,
          },
          body: JSON.stringify({ answers, userProfile }),
        });

        if (!fnResponse.ok) {
          const errBody = await fnResponse.text();
          console.error("analyze-diagnostic response:", fnResponse.status, errBody);
          throw new Error("Erro na analise: " + errBody);
        }

        const analysis = await fnResponse.json();
        if (analysis?.error) throw new Error(analysis.error);

        const { proficiency, overall_readiness, priority_areas, summary } = analysis;

        const { error: saveError } = await supabase.from("proficiency_scores").upsert(
          {
            user_id: user.id,
            overall_readiness: overall_readiness ?? 0,
            summary: summary ?? "",
            priority_areas: priority_areas ?? [],
            proficiency: proficiency ?? [],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

        if (saveError) throw new Error(saveError.message);

        navigate("/diagnostic/results", {
          state: {
            proficiency,
            overall_readiness,
            priority_areas,
            summary,
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao analisar diagnóstico.");
      }
    };

    runAnalysis();
  }, [user, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-destructive font-medium">{error}</p>
          <button
            onClick={() => navigate("/diagnostic/intro")}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const tip = tips[currentTip];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="relative mx-auto mb-8">
          <div className="h-24 w-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Brain className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Analisando suas respostas...</h1>
        <div className="mt-8 flex items-center gap-3 justify-center text-muted-foreground animate-fade-in" key={currentTip}>
          <tip.icon className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm">{tip.text}</p>
        </div>
      </div>
    </div>
  );
};

export default DiagnosticLoading;
