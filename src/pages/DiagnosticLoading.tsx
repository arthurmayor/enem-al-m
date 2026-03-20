import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Brain, Sparkles, BarChart3 } from "lucide-react";

const tips = [
  { icon: Brain, text: "Identificando seus pontos fortes e fracos..." },
  { icon: Sparkles, text: "Criando seu perfil de aprendizado personalizado..." },
  { icon: BarChart3, text: "Calculando suas proficiências por matéria..." },
];

const DiagnosticLoading = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentTip, setCurrentTip] = useState(0);

  // Rotate tips
  useEffect(() => {
    const tipInterval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % tips.length);
    }, 800);
    return () => clearInterval(tipInterval);
  }, []);

  // Redirect after 2 seconds (calculation already done on frontend)
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = location.state;
      if (state) {
        navigate("/diagnostic/results", { state });
      } else {
        navigate("/diagnostic/results");
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigate, location.state]);

  const tip = tips[currentTip];

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="relative mx-auto mb-8">
          <div className="h-24 w-24 rounded-full border-4 border-gray-200 border-t-foreground animate-spin mx-auto" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Brain className="h-8 w-8 text-foreground" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Analisando suas respostas...</h1>
        <div className="mt-8 flex items-center gap-3 justify-center text-muted-foreground animate-fade-in" key={currentTip}>
          <tip.icon className="h-5 w-5 text-foreground shrink-0" />
          <p className="text-sm">{tip.text}</p>
        </div>
      </div>
    </div>
  );
};

export default DiagnosticLoading;
