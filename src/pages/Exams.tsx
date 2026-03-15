import { Link } from "react-router-dom";
import { FileText, Clock, ChevronRight, Lock } from "lucide-react";
import BottomNav from "@/components/BottomNav";

interface ExamOption {
  id: string;
  name: string;
  description: string;
  questionCount: number;
  duration: string;
  available: boolean;
}

const exams: ExamOption[] = [
  { id: "enem-2025", name: "ENEM 2025", description: "Simulado completo no formato ENEM", questionCount: 90, duration: "5h", available: false },
  { id: "enem-rapido", name: "ENEM Rápido", description: "Versão reduzida com 30 questões", questionCount: 30, duration: "1h30", available: false },
  { id: "fuvest-2025", name: "Fuvest 2025", description: "Simulado no formato Fuvest 1ª fase", questionCount: 45, duration: "2h30", available: false },
  { id: "unicamp-2025", name: "Unicamp 2025", description: "Simulado no formato Unicamp", questionCount: 36, duration: "2h", available: false },
];

const Exams = () => {
  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md shadow-rest">
        <div className="container mx-auto flex h-14 items-center px-4 max-w-3xl">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <span className="text-base font-bold text-foreground">Simulados</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="p-5 bg-primary/5 rounded-xl border border-primary/10 animate-fade-in">
          <h2 className="font-semibold text-foreground">Simulados em breve</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Estamos preparando provas completas no formato de cada vestibular.
            Por enquanto, pratique com as missões diárias do seu plano de estudos.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {exams.map((exam, i) => (
            <div
              key={exam.id}
              className={`p-5 bg-card rounded-xl shadow-rest animate-fade-in ${
                !exam.available ? "opacity-60" : "hover:shadow-elevated hover:-translate-y-0.5 cursor-pointer"
              } transition-all duration-300`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{exam.name}</h3>
                    {!exam.available && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                        <Lock className="h-3 w-3" />
                        Em breve
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{exam.description}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="flex items-center text-xs text-muted-foreground">
                      <FileText className="h-3 w-3 mr-1" />
                      {exam.questionCount} questões
                    </span>
                    <span className="flex items-center text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 mr-1" />
                      {exam.duration}
                    </span>
                  </div>
                </div>
                {exam.available ? (
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <p className="text-sm text-muted-foreground">Enquanto isso, continue praticando:</p>
          <div className="mt-3 flex gap-3 justify-center">
            <Link
              to="/study"
              className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
            >
              Ir para Estudar
            </Link>
            <Link
              to="/tutor"
              className="px-5 py-2.5 rounded-lg bg-card shadow-rest text-foreground text-sm font-medium hover:shadow-interactive transition-all"
            >
              Tutor IA
            </Link>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Exams;
