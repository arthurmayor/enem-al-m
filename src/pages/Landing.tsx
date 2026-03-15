import { Link } from "react-router-dom";
import { BookOpen, Target, Brain, BarChart3, Clock, Users } from "lucide-react";

const features = [
  { icon: Target, title: "Plano Personalizado", desc: "Estudo adaptado ao seu concurso e disponibilidade." },
  { icon: Brain, title: "Tutor com IA", desc: "Tire dúvidas a qualquer momento com inteligência artificial." },
  { icon: BarChart3, title: "Análise de Desempenho", desc: "Acompanhe sua evolução com métricas detalhadas." },
  { icon: Clock, title: "Missões Diárias", desc: "Tarefas focadas para manter a consistência." },
  { icon: BookOpen, title: "Simulados Diagnósticos", desc: "Identifique seus pontos fracos rapidamente." },
  { icon: Users, title: "Comunidade", desc: "Estude com milhares de alunos com o mesmo objetivo." },
];

const exams = ["ENEM", "Fuvest", "Unicamp", "OAB", "CPA-20"];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-md shadow-rest">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold text-foreground">Cátedra</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Entrar
            </Link>
            <Link
              to="/registro"
              className="h-10 px-5 inline-flex items-center rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-accent active:scale-[0.98] transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
            >
              Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary mb-8 animate-fade-in">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Plataforma de estudos inteligente
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight animate-fade-in" style={{ animationDelay: "0.1s" }}>
            A aprovação é uma<br />construção diária.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto animate-fade-in" style={{ animationDelay: "0.2s" }}>
            Prepare-se para ENEM, vestibulares e concursos com um plano de estudos personalizado, missões diárias e inteligência artificial.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <Link
              to="/registro"
              className="h-12 px-8 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-base font-semibold hover:bg-accent active:scale-[0.98] transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
            >
              Começar Plano de Estudos
            </Link>
            <Link
              to="/login"
              className="h-12 px-8 inline-flex items-center justify-center rounded-lg bg-card text-foreground text-base font-medium shadow-rest hover:shadow-interactive transition-all duration-200"
            >
              Já tenho conta
            </Link>
          </div>
        </div>
      </section>

      {/* Exams ribbon */}
      <section className="border-y border-border/50 bg-card/50">
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-6">
            Preparação completa para
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {exams.map((exam) => (
              <span
                key={exam}
                className="px-5 py-2 rounded-full bg-primary/5 text-sm font-semibold text-primary"
              >
                {exam}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20 md:py-28">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            Tudo que você precisa para ser aprovado
          </h2>
          <p className="mt-3 text-muted-foreground">
            Ferramentas construídas por quem entende a jornada do estudante.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group p-6 bg-card rounded-xl shadow-rest hover:shadow-elevated transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="h-10 w-10 rounded-lg bg-primary/5 flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary">
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground">
            Comece hoje. Sua vaga está esperando.
          </h2>
          <p className="mt-3 text-primary-foreground/70 max-w-md mx-auto">
            Crie sua conta gratuita e receba seu primeiro plano de estudos em minutos.
          </p>
          <Link
            to="/registro"
            className="mt-8 h-12 px-8 inline-flex items-center justify-center rounded-lg bg-card text-foreground text-base font-semibold hover:bg-background active:scale-[0.98] transition-all duration-200"
          >
            Começar Grátis
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border/50">
        <div className="container mx-auto px-4 py-8 text-center text-sm text-muted-foreground">
          © 2026 Cátedra. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
};

export default Landing;
