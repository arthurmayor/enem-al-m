import { Link } from "react-router-dom";
import { BookOpen, Brain, Calendar, Sparkles, RefreshCw, Plus, Minus } from "lucide-react";
import { useState } from "react";

const testimonials = [
  { name: "Lucas M.", role: "Aprovado Medicina USP", quote: "O diagnóstico mostrou exatamente onde eu estava errando. Em 3 meses minha nota subiu 180 pontos.", avatar: "L" },
  { name: "Ana B.", role: "Aprovada OAB", quote: "O tutor com IA me ajudou a entender temas que eu não conseguia de jeito nenhum.", avatar: "A" },
  { name: "Pedro H.", role: "ENEM 2025", quote: "As missões diárias mantiveram minha disciplina. Nunca estudei tão bem.", avatar: "P" },
];

const faqs = [
  { q: "Como funciona o diagnóstico?", a: "Você responde 25 questões adaptativas que ajustam a dificuldade ao seu nível. A IA identifica suas lacunas em minutos." },
  { q: "A plataforma é gratuita?", a: "Sim, você pode começar gratuitamente. Sem cartão de crédito." },
  { q: "Para quais vestibulares a Cátedra prepara?", a: "ENEM, Fuvest, Unicamp, OAB, CPA-20, CEA e outros concursos e vestibulares." },
  { q: "Como o tutor com IA me ajuda?", a: "O tutor conhece seu nível e adapta as explicações. Você pode tirar dúvidas a qualquer momento." },
  { q: "Posso usar no celular?", a: "Sim, a plataforma é totalmente responsiva e funciona em qualquer dispositivo." },
];

const features = [
  {
    icon: Brain,
    title: "Diagnóstico adaptativo",
    desc: "25 questões que ajustam a dificuldade ao seu nível. A IA identifica suas lacunas em minutos.",
  },
  {
    icon: Calendar,
    title: "Plano de estudos com IA",
    desc: "Missões diárias personalizadas baseadas nas suas fraquezas, horários e data da prova.",
  },
  {
    icon: Sparkles,
    title: "Tutor inteligente",
    desc: "Tire dúvidas a qualquer momento. O tutor conhece seu nível e adapta as explicações.",
  },
  {
    icon: RefreshCw,
    title: "Replanejamento semanal",
    desc: "Seu plano evolui toda semana com base no seu desempenho real. Não é estático.",
    highlight: true,
  },
];

const steps = [
  { num: "1", title: "Faça o diagnóstico", desc: "25 questões adaptativas em ~15 min" },
  { num: "2", title: "Receba seu plano", desc: "Missões diárias personalizadas" },
  { num: "3", title: "Estude com o tutor", desc: "Ajuda contextual sem sair da questão" },
  { num: "4", title: "Evolua toda semana", desc: "O plano se adapta ao seu progresso" },
];

const universidades = ["FUVEST", "USP", "UNICAMP", "ENEM", "PUC", "UNESP", "INSPER", "OAB"];

const Landing = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-bg-app">
      {/* ─── NAVBAR ─────────────────────────────────────────────────────── */}
      <nav className="bg-bg-app/80 backdrop-blur-sm sticky top-0 z-50 border-b border-line-light">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <BookOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-xl font-semibold text-ink-strong">Cátedra</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-ink-soft hover:text-ink transition-colors">Funcionalidades</a>
            <a href="#how-it-works" className="text-sm text-ink-soft hover:text-ink transition-colors">Como funciona</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-ink-soft hover:text-ink transition-colors">
              Entrar
            </Link>
            <Link
              to="/registro"
              className="bg-ink-strong text-white rounded-input px-4 py-2 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ───────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto text-center pt-20 pb-16 px-6">
        <div className="inline-flex bg-brand-100 text-brand-600 rounded-full px-4 py-1.5 text-xs font-medium mb-6">
          Preparação para os melhores vestibulares
        </div>
        <h1 className="text-3xl md:text-5xl font-bold text-ink-strong leading-tight">
          Estude com estratégia.
        </h1>
        <p className="text-lg text-ink-soft mt-4 max-w-2xl mx-auto">
          Seu plano muda com seu desempenho real. Diagnóstico adaptativo, missões diárias e tutor com IA.
        </p>
        <div className="flex gap-4 justify-center mt-8 flex-col sm:flex-row">
          <Link
            to="/registro"
            className="bg-ink-strong text-white rounded-input px-8 py-3.5 text-base font-medium hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Começar Grátis
          </Link>
          <a
            href="#features"
            className="border border-line text-ink rounded-input px-8 py-3.5 text-base font-medium hover:bg-bg-app transition-all"
          >
            Ver funcionalidades
          </a>
        </div>
        <p className="text-sm text-ink-muted mt-4">Grátis para começar. Sem cartão de crédito.</p>
      </section>

      {/* ─── MOCK DASHBOARD ─────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto mt-8 mb-16 px-6">
        <div className="bg-bg-card rounded-xl shadow-lg border border-line-light p-6">
          {/* Mock header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-brand-500 flex items-center justify-center">
                <BookOpen className="h-2.5 w-2.5 text-white" />
              </div>
              <span className="text-xs font-semibold text-ink-strong">Cátedra</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-soft">Olá, Maria</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-600 font-medium">🔥 7 dias</span>
            </div>
          </div>

          {/* Countdown card */}
          <div className="bg-brand-500 rounded-lg p-4 mb-4">
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">FUVEST 2026</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">247</span>
              <span className="text-white/50 text-sm">dias restantes</span>
            </div>
          </div>

          {/* Mock missions */}
          <div className="space-y-2">
            {[
              { subject: "Matemática", topic: "Funções do 2° grau", type: "Questões" },
              { subject: "Português", topic: "Interpretação de texto", type: "Resumo" },
            ].map((m) => (
              <div key={m.topic} className="flex items-center justify-between p-3 rounded-input border border-line-light">
                <div>
                  <p className="text-[10px] font-medium text-ink-muted uppercase tracking-wider">{m.subject}</p>
                  <p className="text-sm font-medium text-ink-strong">{m.topic}</p>
                </div>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-bg-app text-ink-soft font-medium">{m.type}</span>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-ink-soft font-medium">Progresso de hoje</span>
              <span className="text-xs text-ink-muted">3 de 5 missões</span>
            </div>
            <div className="w-full h-2 bg-line rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full transition-all duration-[800ms] ease-out" style={{ width: "60%" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ─── LOGOS ───────────────────────────────────────────────────────── */}
      <section className="border-y border-line-light py-8">
        <p className="text-xs uppercase tracking-widest text-ink-muted text-center mb-6">
          Preparação para os melhores vestibulares
        </p>
        <div className="flex items-center justify-center gap-8 flex-wrap opacity-40 grayscale px-6">
          {universidades.map((name) => (
            <span key={name} className="text-sm font-semibold text-ink-muted">{name}</span>
          ))}
        </div>
      </section>

      {/* ─── FEATURES ───────────────────────────────────────────────────── */}
      <section id="features" className="bg-ink-strong">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            De diagnóstico a aprovação.
          </h2>
          <p className="text-base text-white/60 text-center mb-12">
            Tudo que você precisa para estudar de forma inteligente.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((f) => (
              <div
                key={f.title}
                className={`flex gap-6 ${f.highlight ? "border border-brand-500/30 rounded-lg p-6" : "p-6"}`}
              >
                <div className="shrink-0">
                  <f.icon className="h-6 w-6 text-brand-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                  <p className="text-sm text-white/60 mt-1">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-bg-app">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold text-ink-strong text-center mb-12">
            Como funciona
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {steps.map((s) => (
              <div key={s.num} className="text-center md:text-left">
                <p className="text-4xl font-bold text-brand-100 mb-2">{s.num}</p>
                <h3 className="text-base font-semibold text-ink-strong">{s.title}</h3>
                <p className="text-sm text-ink-soft mt-1">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ───────────────────────────────────────────────── */}
      <section className="bg-bg-card border-y border-line-light">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-xs uppercase tracking-widest text-ink-muted text-center mb-8">Alunos</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-bg-app rounded-card p-6">
                <p className="text-sm text-ink italic mb-4">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-medium text-sm">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-strong">{t.name}</p>
                    <p className="text-xs text-ink-muted">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────────────────────── */}
      <section className="bg-bg-app">
        <div className="max-w-2xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-ink-strong text-center mb-8">
            Perguntas frequentes
          </h2>
          <div>
            {faqs.map((faq, i) => (
              <div key={i} className="border-b border-line-light">
                <button
                  className="w-full flex justify-between items-center py-4 cursor-pointer text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="text-sm font-medium text-ink-strong">{faq.q}</span>
                  {openFaq === i ? (
                    <Minus className="h-4 w-4 text-ink-muted flex-shrink-0" />
                  ) : (
                    <Plus className="h-4 w-4 text-ink-muted flex-shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <p className="text-sm text-ink-soft pb-4 leading-relaxed">{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA FINAL ───────────────────────────────────────────────────── */}
      <section className="bg-brand-50 border-y border-brand-100">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-ink-strong">
            Pare de estudar no escuro.
          </h2>
          <p className="text-sm text-ink-soft mt-2">
            Crie sua conta grátis e receba seu plano de estudos em minutos.
          </p>
          <Link
            to="/registro"
            className="inline-block bg-ink-strong text-white rounded-input px-8 py-3.5 text-base font-medium mt-6 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Começar Grátis
          </Link>
        </div>
      </section>

      {/* ─── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="bg-bg-app border-t border-line-light">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm text-ink-muted">Cátedra © 2026</span>
          <div className="flex gap-6">
            <a href="#" className="text-sm text-ink-muted hover:text-ink transition-colors">Termos de Uso</a>
            <a href="#" className="text-sm text-ink-muted hover:text-ink transition-colors">Política de Privacidade</a>
            <a href="#" className="text-sm text-ink-muted hover:text-ink transition-colors">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
