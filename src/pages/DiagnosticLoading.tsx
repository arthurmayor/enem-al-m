import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Brain, Sparkles, BarChart3 } from "lucide-react";

const tips = [
  { icon: Brain, text: "A IA está identificando seus pontos fortes e fracos..." },
  { icon: Sparkles, text: "Criando seu perfil de aprendizado personalizado..." },
  { icon: BarChart3, text: "Calculando suas proficiências por matéria..." },
];

const DiagnosticLoading = () => {
  const navigate = useNavigate();
  const [currentTip, setCurrentTip] = useState(0);

  useEffect(() => {
    const tipInterval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % tips.length);
    }, 2500);

    const timeout = setTimeout(() => {
      navigate("/diagnostic/results");
    }, 6000);

    return () => {
      clearInterval(tipInterval);
      clearTimeout(timeout);
    };
  }, [navigate]);

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
