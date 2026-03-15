import { Link } from "react-router-dom";
import { BookOpen, Clock, Target, ChevronRight, Lightbulb } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const DiagnosticIntro = () => {
  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md shadow-rest">
        <div className="container mx-auto flex h-14 items-center justify-between px-4 max-w-3xl">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="text-base font-bold text-foreground">Cátedra</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-lg">
        <div className="text-center animate-fade-in">
          <div className="h-20 w-20 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-6">
            <Target className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Vamos descobrir seu nível atual</h1>
          <p className="text-muted-foreground mt-3 leading-relaxed">
            Você vai responder <strong className="text-foreground">25 questões adaptativas</strong>. O teste ajusta a dificuldade com base nas suas respostas.
          </p>
        </div>

        <div className="mt-8 space-y-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-start gap-3 p-4 bg-card rounded-xl shadow-rest">
            <Clock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">~30 minutos</p>
              <p className="text-xs text-muted-foreground">Tempo estimado para completar</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-card rounded-xl shadow-rest">
            <Target className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Adaptativo</p>
              <p className="text-xs text-muted-foreground">A dificuldade se ajusta ao seu nível</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-warning/5 rounded-xl border border-warning/20">
            <Lightbulb className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Não vale chutar!</p>
              <p className="text-xs text-muted-foreground">É melhor errar para a IA entender suas lacunas reais.</p>
            </div>
          </div>
        </div>

        <div className="mt-10 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <Link
            to="/diagnostic/test"
            className="w-full h-12 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200"
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
