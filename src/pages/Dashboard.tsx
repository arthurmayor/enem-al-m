import { Link } from "react-router-dom";
import { BookOpen, Clock, Brain, BarChart3, FileText, LogOut, ChevronRight } from "lucide-react";

const missions = [
  { id: 1, subject: "Matemática", title: "Análise Combinatória", time: "25 min", color: "205 62% 28%" },
  { id: 2, subject: "Português", title: "Interpretação de Texto", time: "20 min", color: "201 96% 32%" },
  { id: 3, subject: "Física", title: "Cinemática - MRU e MRUV", time: "30 min", color: "205 62% 28%" },
];

const weekProgress = [
  { day: "Seg", done: true },
  { day: "Ter", done: true },
  { day: "Qua", done: true },
  { day: "Qui", done: false, current: true },
  { day: "Sex", done: false },
  { day: "Sáb", done: false },
  { day: "Dom", done: false },
];

const Dashboard = () => {
  const daysUntilExam = 42;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-md shadow-rest">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="text-base font-bold text-foreground">Cátedra</span>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/diagnostico" className="h-9 px-3 inline-flex items-center rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
              <FileText className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Diagnóstico</span>
            </Link>
            <Link to="/tutor" className="h-9 px-3 inline-flex items-center rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
              <Brain className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Tutor IA</span>
            </Link>
            <Link to="/desempenho" className="h-9 px-3 inline-flex items-center rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Desempenho</span>
            </Link>
            <Link to="/" className="h-9 px-3 inline-flex items-center rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
              <LogOut className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Greeting */}
        <div className="animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground">Olá, Maria 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">Vamos continuar de onde você parou.</p>
        </div>

        {/* Countdown */}
        <div className="mt-6 bg-primary rounded-xl p-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <p className="text-primary-foreground/60 text-xs font-semibold uppercase tracking-wider">
            ENEM 2026
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-bold text-primary-foreground tabular-nums">
              {daysUntilExam}
            </span>
            <span className="text-primary-foreground/70 text-lg">dias restantes</span>
          </div>
          <div className="mt-3 w-full bg-primary-foreground/10 rounded-full h-1.5">
            <div className="bg-primary-foreground/40 h-1.5 rounded-full" style={{ width: "68%" }} />
          </div>
          <p className="text-primary-foreground/50 text-xs mt-2">68% do plano concluído</p>
        </div>

        {/* Today's Missions */}
        <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Missões de Hoje</h2>
            <span className="text-xs text-muted-foreground">0 de 3 concluídas</span>
          </div>
          <div className="space-y-3">
            {missions.map((mission) => (
              <Link
                key={mission.id}
                to="/diagnostico"
                className="group flex items-center justify-between p-5 bg-card rounded-xl shadow-rest hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300"
              >
                <div>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider text-primary/60"
                  >
                    {mission.subject}
                  </span>
                  <h3 className="mt-0.5 font-semibold text-foreground">{mission.title}</h3>
                  <div className="mt-2 flex items-center text-xs text-muted-foreground">
                    <Clock className="w-3 h-3 mr-1" />
                    {mission.time}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        {/* Weekly Progress */}
        <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <h2 className="text-base font-semibold text-foreground mb-4">Progresso Semanal</h2>
          <div className="bg-card rounded-xl shadow-rest p-6">
            <div className="flex justify-between">
              {weekProgress.map((day) => (
                <div key={day.day} className="flex flex-col items-center gap-2">
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center text-sm font-semibold transition-all ${
                      day.done
                        ? "bg-primary text-primary-foreground"
                        : day.current
                        ? "bg-primary/10 text-primary shadow-[inset_0_0_0_2px_hsl(var(--primary))]"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {day.done ? "✓" : day.day.charAt(0)}
                  </div>
                  <span className="text-xs text-muted-foreground">{day.day}</span>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>Meta semanal</span>
                <span>3 de 5 dias</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: "60%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 mb-12 grid grid-cols-2 gap-3 animate-fade-in" style={{ animationDelay: "0.4s" }}>
          <Link
            to="/diagnostico"
            className="p-5 bg-card rounded-xl shadow-rest hover:shadow-interactive transition-all flex flex-col gap-2"
          >
            <FileText className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">Simulado Diagnóstico</span>
            <span className="text-xs text-muted-foreground">Teste seus conhecimentos</span>
          </Link>
          <Link
            to="/tutor"
            className="p-5 bg-card rounded-xl shadow-rest hover:shadow-interactive transition-all flex flex-col gap-2"
          >
            <Brain className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">Tutor com IA</span>
            <span className="text-xs text-muted-foreground">Tire suas dúvidas</span>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
