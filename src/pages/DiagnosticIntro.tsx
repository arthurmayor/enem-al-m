import { Link } from "react-router-dom";
import { BookOpen, Clock, Target, ChevronRight, Lightbulb } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const DiagnosticIntro = () => {
  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto flex h-14 items-center justify-between px-4 max-w-3xl">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg gradient-bg flex items-center justify-center">
              <BookOpen className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-base font-bold text-foreground tracking-tight">Cátedra</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-lg">
        <div className="text-center animate-fade-in">
          <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Target className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">Vamos descobrir seu nível atual</h1>
          <p className="text-muted-foreground mt-3 leading-relaxed">
            Você vai responder <strong className="text-foreground">25 questões adaptativas</strong>. O teste ajusta a dificuldade com base nas suas respostas.
          </p>
        </div>

        <div className="mt-8 space-y-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-start gap-3 p-4 bg-card rounded-2xl border border-border/50">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">~30 minutos</p>
              <p className="text-xs text-muted-foreground">Tempo estimado para completar</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-card rounded-2xl border border-border/50">
            <div className="h-9 w-9 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
              <Target className="h-4 w-4 text-secondary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Adaptativo</p>
              <p className="text-xs text-muted-foreground">A dificuldade se ajusta ao seu nível</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-warning/5 rounded-2xl border border-warning/20">
            <div className="h-9 w-9 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
              <Lightbulb className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Não vale chutar!</p>
              <p className="text-xs text-muted-foreground">É melhor errar para a IA entender suas lacunas reais.</p>
            </div>
          </div>
        </div>

        <div className="mt-10 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <Link
            to="/diagnostic/test"
            className="w-full h-12 inline-flex items-center justify-center rounded-xl gradient-bg text-primary-foreground text-base font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-[0_4px_14px_rgba(99,102,241,0.3)]"
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
