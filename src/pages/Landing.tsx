import { Link } from "react-router-dom";
import { BookOpen, Target, Brain, BarChart3, Clock, Users, Search, Zap, TrendingUp, ChevronRight, Star } from "lucide-react";

const features = [
  { icon: Search, title: "Diagnóstico Inteligente", desc: "Teste adaptativo que identifica exatamente onde você precisa melhorar." },
  { icon: Target, title: "Plano Personalizado", desc: "IA cria seu plano de estudos semanal baseado nas suas lacunas e horários." },
  { icon: Brain, title: "Tutor com IA", desc: "Tire dúvidas a qualquer momento com um tutor que conhece seu nível." },
  { icon: TrendingUp, title: "Performance em Tempo Real", desc: "Acompanhe sua evolução e probabilidade de aprovação." },
];

const steps = [
  { num: "1", title: "Faça seu diagnóstico", desc: "Responda 25 questões adaptativas em ~30 minutos." },
  { num: "2", title: "Receba seu plano personalizado", desc: "A IA monta um plano semanal ajustado aos seus horários." },
  { num: "3", title: "Evolua diariamente", desc: "Complete missões, tire dúvidas com o tutor e acompanhe seu progresso." },
];

const testimonials = [
  { name: "Lucas Mendes", exam: "Aprovado em Medicina — USP", quote: "O diagnóstico mostrou exatamente onde eu estava errando. Em 3 meses minha nota subiu 180 pontos." },
  { name: "Ana Beatriz", exam: "Aprovada na OAB", quote: "O tutor com IA me ajudou a entender temas que eu não conseguia de jeito nenhum. Recomendo demais!" },
  { name: "Pedro Henrique", exam: "ENEM 2025 — 780 pontos", quote: "As missões diárias mantiveram minha disciplina. Nunca estudei tão bem na vida." },
];

const exams = ["ENEM", "Fuvest", "Unicamp", "OAB", "CPA-20", "CEA"];

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
              className="h-10 px-5 inline-flex items-center rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
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
            <Zap className="h-3.5 w-3.5" />
            Plataforma de estudo com IA
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Sua plataforma de<br />estudo com IA
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto animate-fade-in" style={{ animationDelay: "0.2s" }}>
            Descubra suas lacunas, crie um plano de estudos inteligente e maximize suas chances de aprovação.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <Link
              to="/registro"
              className="h-12 px-8 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
            >
              Começar Grátis
              <ChevronRight className="ml-1 h-4 w-4" />
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
              <span key={exam} className="px-5 py-2 rounded-full bg-primary/5 text-sm font-semibold text-primary">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
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

      {/* How It Works */}
      <section className="bg-card/50 border-y border-border/50">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">Como funciona</h2>
            <p className="mt-3 text-muted-foreground">Três passos para transformar seus estudos.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((s, i) => (
              <div key={s.num} className="text-center animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-5">
                  {s.num}
                </div>
                <h3 className="font-semibold text-foreground text-lg">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="container mx-auto px-4 py-20 md:py-28">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">Quem já usou, aprovou</h2>
          <p className="mt-3 text-muted-foreground">Veja o que nossos alunos estão dizendo.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className="p-6 bg-card rounded-xl shadow-rest animate-fade-in"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="flex gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="h-4 w-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="text-sm text-foreground leading-relaxed">"{t.quote}"</p>
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-success font-medium">{t.exam}</p>
                  </div>
                </div>
              </div>
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
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="font-bold text-foreground">Cátedra</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Termos de Uso</a>
              <a href="#" className="hover:text-foreground transition-colors">Política de Privacidade</a>
              <a href="#" className="hover:text-foreground transition-colors">Contato</a>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-6">
            © 2026 Cátedra. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
