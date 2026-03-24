import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, Clock, Target, ChevronRight, Lightbulb, Zap } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const DiagnosticIntro = () => {
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get("mode") || "router") as "router" | "deep";

  const isRouter = mode === "router";

  return (
    <div className="min-h-screen bg-white pb-20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="container mx-auto flex h-14 items-center justify-between px-4 max-w-3xl">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-foreground flex items-center justify-center">
              <BookOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-base font-semibold text-foreground tracking-tight">Cátedra</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-lg">
        <div className="text-center animate-fade-in">
          <div className="h-20 w-20 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-6">
            {isRouter ? (
              <Zap className="h-10 w-10 text-foreground" />
            ) : (
              <Target className="h-10 w-10 text-foreground" />
            )}
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            {isRouter ? "Vamos montar seu ponto de partida" : "Vamos descobrir seu nível atual"}
          </h1>
          <p className="text-muted-foreground mt-3 leading-relaxed">
            {isRouter ? (
              <>
                São <strong className="text-foreground">8 questões rápidas</strong> para entender suas forças e lacunas. Usamos isso para montar seu plano personalizado.
              </>
            ) : (
              <>
                Você vai responder <strong className="text-foreground">30 questões adaptativas</strong>. O teste ajusta a dificuldade com base nas suas respostas.
              </>
            )}
          </p>
        </div>

        <div className="mt-8 space-y-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl">
            <div className="h-9 w-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {isRouter ? "~5 minutos" : "~30 minutos"}
              </p>
              <p className="text-xs text-muted-foreground">Tempo estimado para completar</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl">
            <div className="h-9 w-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Target className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {isRouter ? "Diagnóstico rápido" : "Adaptativo"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isRouter
                  ? "Questões estratégicas para mapear seu perfil"
                  : "A dificuldade se ajusta ao seu nível"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl">
            <div className="h-9 w-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Lightbulb className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Não vale chutar!</p>
              <p className="text-xs text-muted-foreground">É melhor errar para a IA entender suas lacunas reais.</p>
            </div>
          </div>
        </div>

        <div className="mt-10 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <Link
            to={`/diagnostic/test?mode=${mode}`}
            className="w-full h-12 inline-flex items-center justify-center rounded-full bg-foreground text-white text-base font-medium hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200"
          >
            {isRouter ? "Começar Diagnóstico Rápido" : "Iniciar Diagnóstico Completo"}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default DiagnosticIntro;
