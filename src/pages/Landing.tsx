import { Link } from "react-router-dom";
import { BookOpen, Target, Brain, TrendingUp, ChevronRight, Star, Zap, Trophy, Sparkles } from "lucide-react";

const features = [
  { icon: "🎯", title: "Diagnóstico Inteligente", desc: "Teste adaptativo que identifica exatamente onde você precisa melhorar.", color: "border-l-primary" },
  { icon: "📋", title: "Plano Personalizado", desc: "IA cria seu plano de estudos semanal baseado nas suas lacunas e horários.", color: "border-l-secondary" },
  { icon: "🧠", title: "Tutor com IA", desc: "Tire dúvidas a qualquer momento com um tutor que conhece seu nível.", color: "border-l-xp" },
  { icon: "🏆", title: "Ranking & Gamificação", desc: "Ganhe XP, mantenha sequências e dispute com outros estudantes.", color: "border-l-warning" },
];

const steps = [
  { num: "1", title: "Faça o diagnóstico", desc: "Responda 25 questões adaptativas em ~30 minutos.", color: "gradient-bg" },
  { num: "2", title: "Receba seu plano", desc: "A IA monta um plano semanal ajustado aos seus horários.", color: "bg-secondary" },
  { num: "3", title: "Evolua e conquiste", desc: "Complete missões, tire dúvidas com o tutor e acompanhe seu progresso.", color: "bg-xp" },
];

const testimonials = [
  { name: "Lucas Mendes", exam: "Aprovado em Medicina — USP", quote: "O diagnóstico mostrou exatamente onde eu estava errando. Em 3 meses minha nota subiu 180 pontos.", avatar: "L" },
  { name: "Ana Beatriz", exam: "Aprovada na OAB", quote: "O tutor com IA me ajudou a entender temas que eu não conseguia de jeito nenhum. Recomendo demais!", avatar: "A" },
  { name: "Pedro Henrique", exam: "ENEM 2025 — 780 pontos", quote: "As missões diárias mantiveram minha disciplina. Nunca estudei tão bem na vida.", avatar: "P" },
];

const exams = ["ENEM", "Fuvest", "Unicamp", "OAB", "CPA-20", "CEA"];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg gradient-bg flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight">Cátedra</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Entrar
            </Link>
            <Link
              to="/registro"
              className="h-10 px-5 inline-flex items-center rounded-xl gradient-bg text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-[0_2px_8px_rgba(99,102,241,0.25)]"
            >
              Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="animated-gradient">
        <div className="container mx-auto px-4 py-20 md:py-32">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary mb-8 animate-fade-in">
              <Sparkles className="h-3.5 w-3.5" />
              Plataforma de estudo com IA
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-foreground leading-[1.1] animate-fade-in" style={{ animationDelay: "0.1s" }}>
              Estude com <span className="gradient-text">IA</span>.<br />Passe no vestibular.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto animate-fade-in" style={{ animationDelay: "0.2s" }}>
              Plano de estudos personalizado, tutor inteligente e simulados adaptativos — tudo em um lugar.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <Link
                to="/registro"
                className="h-12 px-8 inline-flex items-center justify-center rounded-xl gradient-bg text-primary-foreground text-base font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-[0_4px_14px_rgba(99,102,241,0.3)]"
              >
                Começar Grátis
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
              <a
                href="#como-funciona"
                className="h-12 px-8 inline-flex items-center justify-center rounded-xl bg-card text-foreground text-base font-medium border border-border hover:border-primary/30 hover:shadow-interactive transition-all duration-200"
              >
                Ver como funciona
              </a>
            </div>
          </div>

          {/* App Mockup Preview */}
          <div className="mt-16 max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: "0.5s" }}>
            <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-6 md:p-8" style={{ transform: "perspective(1200px) rotateX(2deg)" }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-lg font-bold text-foreground">Olá, Maria 👋</p>
                  <p className="text-sm text-muted-foreground">Vamos continuar de onde você parou.</p>
                </div>
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-warning/10 text-warning text-xs font-semibold">
                  🔥 7 dias
                </div>
              </div>
              <div className="gradient-bg rounded-xl p-5 mb-4">
                <p className="text-primary-foreground/70 text-xs font-semibold uppercase tracking-wider">ENEM 2026</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-primary-foreground">247</span>
                  <span className="text-primary-foreground/60 text-sm">dias restantes</span>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { subject: "Matemática", topic: "Funções do 2º grau", type: "Questões", color: "bg-primary" },
                  { subject: "Português", topic: "Interpretação de texto", type: "Resumo", color: "bg-secondary" },
                ].map((m) => (
                  <div key={m.topic} className="flex items-center justify-between p-3.5 bg-background rounded-xl border border-border/50">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${m.color}`} />
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.subject}</p>
                        <p className="text-sm font-semibold text-foreground">{m.topic}</p>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{m.type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="border-y border-border/50 bg-card/50">
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-6">
            Preparação completa para
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {exams.map((exam) => (
              <span key={exam} className="px-5 py-2 rounded-full bg-primary/5 text-sm font-semibold text-primary border border-primary/10">
                {exam}
              </span>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-center gap-2">
            <div className="flex -space-x-2">
              {["M", "J", "A", "P"].map((l, i) => (
                <div key={i} className="h-7 w-7 rounded-full gradient-bg flex items-center justify-center text-[10px] font-bold text-primary-foreground border-2 border-background">
                  {l}
                </div>
              ))}
            </div>
            <span className="text-sm text-muted-foreground ml-1">Já ajudamos <strong className="text-foreground">+500 estudantes</strong></span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20 md:py-28">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-extrabold text-foreground">
            Tudo que você precisa para ser aprovado
          </h2>
          <p className="mt-3 text-muted-foreground">
            Ferramentas construídas por quem entende a jornada do estudante.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`group p-6 bg-card rounded-2xl border border-border/50 border-l-4 ${f.color} hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300 animate-fade-in`}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <span className="text-2xl mb-3 block">{f.icon}</span>
              <h3 className="font-bold text-foreground text-lg">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="como-funciona" className="bg-card/50 border-y border-border/50">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-4xl font-extrabold text-foreground">Como funciona</h2>
            <p className="mt-3 text-muted-foreground">Três passos para transformar seus estudos.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto relative">
            {/* Dotted line connector (desktop) */}
            <div className="hidden md:block absolute top-10 left-[20%] right-[20%] h-0.5 border-t-2 border-dashed border-border" />
            {steps.map((s, i) => (
              <div key={s.num} className="text-center relative animate-fade-in" style={{ animationDelay: `${i * 0.12}s` }}>
                <div className={`h-16 w-16 rounded-2xl ${s.color} text-primary-foreground flex items-center justify-center text-2xl font-extrabold mx-auto mb-5 shadow-[0_4px_14px_rgba(99,102,241,0.2)]`}>
                  {s.num}
                </div>
                <h3 className="font-bold text-foreground text-lg">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="container mx-auto px-4 py-20 md:py-28">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-extrabold text-foreground">Quem já usou, aprovou</h2>
          <p className="mt-3 text-muted-foreground">Veja o que nossos alunos estão dizendo.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className="p-6 bg-card rounded-2xl border border-border/50 hover:shadow-interactive transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="flex gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="h-4 w-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="text-sm text-foreground leading-relaxed">"{t.quote}"</p>
              <div className="mt-5 pt-4 border-t border-border">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full gradient-bg flex items-center justify-center text-primary-foreground font-bold text-sm">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-secondary font-medium">{t.exam}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="gradient-bg">
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl md:text-4xl font-extrabold text-primary-foreground">
            Sua vaga está esperando.
          </h2>
          <p className="mt-3 text-primary-foreground/70 max-w-md mx-auto">
            Crie sua conta gratuita e receba seu primeiro plano de estudos em minutos.
          </p>
          <Link
            to="/registro"
            className="mt-8 h-12 px-8 inline-flex items-center justify-center rounded-xl bg-card text-foreground text-base font-bold hover:bg-background active:scale-[0.98] transition-all duration-200 shadow-elevated"
          >
            Começar Grátis
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg gradient-bg flex items-center justify-center">
                <BookOpen className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="font-bold text-background">Cátedra</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-background/50">
              <a href="#" className="hover:text-background transition-colors">Termos de Uso</a>
              <a href="#" className="hover:text-background transition-colors">Política de Privacidade</a>
              <a href="#" className="hover:text-background transition-colors">Contato</a>
            </div>
          </div>
          <p className="text-center text-sm text-background/40 mt-6">
            © 2026 Cátedra. Feito com ❤️ para estudantes brasileiros.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
