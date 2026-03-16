import { Link } from "react-router-dom";
import { BookOpen, Clock, Target, ChevronRight, Lightbulb } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const DiagnosticIntro = () => {
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
            <Target className="h-10 w-10 text-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Vamos descobrir seu nível atual</h1>
          <p className="text-muted-foreground mt-3 leading-relaxed">
            Você vai responder <strong className="text-foreground">25 questões adaptativas</strong>. O teste ajusta a dificuldade com base nas suas respostas.
          </p>
        </div>

        <div className="mt-8 space-y-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl">
            <div className="h-9 w-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">~30 minutos</p>
              <p className="text-xs text-muted-foreground">Tempo estimado para completar</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl">
            <div className="h-9 w-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Target className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Adaptativo</p>
              <p className="text-xs text-muted-foreground">A dificuldade se ajusta ao seu nível</p>
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
            to="/diagnostic/test"
            className="w-full h-12 inline-flex items-center justify-center rounded-full bg-foreground text-white text-base font-medium hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200"
          >
            Iniciar Diagnóstico
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default DiagnosticIntro;
