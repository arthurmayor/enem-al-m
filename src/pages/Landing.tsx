import { Link } from "react-router-dom";
import { BookOpen, Target, CalendarDays, MessageSquare, Trophy, ChevronRight } from "lucide-react";

const features = [
{ icon: Target, title: "Diagnóstico Inteligente", desc: "Teste adaptativo que identifica exatamente onde você precisa melhorar." },
{ icon: CalendarDays, title: "Plano Personalizado", desc: "IA cria seu plano de estudos semanal baseado nas suas lacunas e horários." },
{ icon: MessageSquare, title: "Tutor com IA", desc: "Tire dúvidas a qualquer momento com um tutor que conhece seu nível." },
{ icon: Trophy, title: "Ranking & Gamificação", desc: "Ganhe XP, mantenha sequências e dispute com outros estudantes." }];


const steps = [
{ num: "1", title: "Faça o diagnóstico", desc: "Responda 25 questões adaptativas em ~30 minutos." },
{ num: "2", title: "Receba seu plano", desc: "A IA monta um plano semanal ajustado aos seus horários." },
{ num: "3", title: "Evolua e conquiste", desc: "Complete missões, tire dúvidas com o tutor e acompanhe seu progresso." }];


const testimonials = [
{ name: "Lucas Mendes", exam: "Aprovado em Medicina — USP", quote: "O diagnóstico mostrou exatamente onde eu estava errando. Em 3 meses minha nota subiu 180 pontos.", avatar: "L" },
{ name: "Ana Beatriz", exam: "Aprovada na OAB", quote: "O tutor com IA me ajudou a entender temas que eu não conseguia de jeito nenhum. Recomendo demais!", avatar: "A" },
{ name: "Pedro Henrique", exam: "ENEM 2025 — 780 pontos", quote: "As missões diárias mantiveram minha disciplina. Nunca estudei tão bem na vida.", avatar: "P" }];


const exams = ["ENEM", "Fuvest", "Unicamp", "OAB", "CPA-20", "CEA"];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-foreground flex items-center justify-center">
              <BookOpen className="h-3.5 w-3.5 text-background" />
            </div>
            <span className="text-base font-bold text-foreground tracking-tight">Educ</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Entrar
            </Link>
            <Link
              to="/registro"
              className="h-9 px-4 inline-flex items-center rounded-lg bg-foreground text-background text-sm font-medium hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200">
              
              Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-background">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-extrabold text-foreground leading-[1.1] animate-fade-in">
              Estude com <span className="gradient-text">IA</span>.<br />Passe no vestibular.
            </h1>
            <p className="mt-5 text-base text-muted-foreground max-w-lg mx-auto animate-fade-in" style={{ animationDelay: "0.1s" }}>
              Grátis para começar. Comece a aprender.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center animate-fade-in" style={{ animationDelay: "0.2s" }}>
              <Link
                to="/registro"
                className="h-11 px-6 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover active:scale-[0.98] transition-all duration-200 shadow-sm">
                
                Começar Grátis
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
              <a
                href="#como-funciona"
                className="h-11 px-6 inline-flex items-center justify-center rounded-lg bg-card text-foreground text-sm font-medium border border-border hover:shadow-sm transition-all duration-200">
                
                Ver como funciona
              </a>
            </div>
          </div>

          {/* App Mockup Preview */}
          <div className="mt-12 max-w-[600px] mx-auto animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <div className="bg-card rounded-xl shadow-xl border border-border p-5 md:p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-base font-bold text-foreground">Olá, Maria 👋</p>
                  <p className="text-sm text-muted-foreground">Vamos continuar de onde você parou.</p>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-warning/10 text-warning text-xs font-semibold">
                  🔥 7 dias
                </div>
              </div>
              <div className="bg-primary rounded-xl p-4 mb-3">
                <p className="text-primary-foreground/70 text-xs font-semibold uppercase tracking-wider">ENEM 2026</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-primary-foreground">247</span>
                  <span className="text-primary-foreground/60 text-sm">dias restantes</span>
                </div>
              </div>
              <div className="space-y-2">
                {[
                { subject: "Matemática", topic: "Funções do 2º grau", type: "Questões" },
                { subject: "Português", topic: "Interpretação de texto", type: "Resumo" }].
                map((m) =>
                <div key={m.topic} className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{m.subject}</p>
                      <p className="text-sm font-semibold text-foreground">{m.topic}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{m.type}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="border-y border-border">
        <div className="container mx-auto px-4 py-10 md:py-10">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-5">
            Preparação completa para
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {exams.map((exam) =>
            <span key={exam} className="px-4 py-1.5 rounded-full bg-muted text-sm font-medium text-muted-foreground border border-border">
                {exam}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-10 md:py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-extrabold text-foreground">
            Tudo que você precisa para ser aprovado
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {features.map((f, i) =>
          <div
            key={f.title}
            className="group p-5 bg-card rounded-xl border border-border hover:shadow-md transition-all duration-200 animate-fade-in"
            style={{ animationDelay: `${i * 0.06}s` }}>
            
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-bold text-foreground">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section id="como-funciona" className="border-y border-border">
        <div className="container mx-auto px-4 py-10 md:py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold text-foreground">Como funciona</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto relative">
            <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px border-t-2 border-dashed border-border" />
            {steps.map((s, i) =>
            <div key={s.num} className="text-center relative animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="h-14 w-14 rounded-2xl bg-foreground text-background flex items-center justify-center text-xl font-extrabold mx-auto mb-4">
                  {s.num}
                </div>
                <h3 className="font-bold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="container mx-auto px-4 py-10 md:py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-extrabold text-foreground">Alunos</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {testimonials.map((t, i) =>
          <div
            key={t.name}
            className="p-5 bg-card rounded-xl border border-border animate-fade-in"
            style={{ animationDelay: `${i * 0.06}s` }}>
            
              <p className="text-sm text-foreground leading-relaxed">"{t.quote}"</p>
              <div className="mt-4 pt-3 border-t border-border">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold text-sm">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-success font-medium">{t.exam}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-foreground">
        <div className="container mx-auto px-4 py-10 md:py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-background">
            Comece agora.
          </h2>
          <Link
            to="/registro"
            className="mt-6 h-11 px-6 inline-flex items-center justify-center rounded-lg bg-background text-foreground text-sm font-semibold hover:bg-background/90 active:scale-[0.98] transition-all duration-200">
            
            Criar conta grátis
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground border-t border-border">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-background/10 flex items-center justify-center">
                <BookOpen className="h-3 w-3 text-background/60" />
              </div>
              <span className="text-sm font-semibold text-background/60">Educ</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-background/40">
              <a href="#" className="hover:text-background/60 transition-colors">Termos</a>
              <a href="#" className="hover:text-background/60 transition-colors">Privacidade</a>
              <a href="#" className="hover:text-background/60 transition-colors">Contato</a>
            </div>
            <p className="text-xs text-background/30">© 2026 Educ</p>
          </div>
        </div>
      </footer>
    </div>);

};

export default Landing;