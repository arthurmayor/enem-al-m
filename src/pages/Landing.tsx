import { Link } from "react-router-dom";
import { BookOpen, Target, Trophy, BarChart3, ChevronRight, Plus, Minus } from "lucide-react";
import { useState } from "react";

const features = [
  { icon: Target, title: "Simulados reais", desc: "Provas completas no formato ENEM, Fuvest e Unicamp com correção detalhada." },
  { icon: Trophy, title: "Ranking e gamificação", desc: "Ganhe XP, mantenha sequências e compita com outros estudantes." },
  { icon: BarChart3, title: "Performance em tempo real", desc: "Acompanhe sua evolução por matéria e probabilidade de aprovação." },
];

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

const logos = ["USP", "UNICAMP", "UNESP", "INSPER", "FGV", "PUC", "UFMG", "UFRJ", "MACKENZIE", "ALBERT EINSTEIN", "FUVEST", "OAB"];

const Landing = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-[1100px] mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-black flex items-center justify-center">
              <BookOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-base font-semibold text-[#0A0A0A]">Cátedra</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-gray-500 hover:text-black transition-colors">
              Entrar
            </Link>
            <Link
              to="/registro"
              className="h-9 px-5 inline-flex items-center rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-all"
            >
              Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-20 md:pt-24 pb-12 md:pb-16">
        <div className="max-w-[1100px] mx-auto px-4 text-center">
          <h1 className="text-5xl md:text-6xl font-semibold text-[#0A0A0A] leading-[1.1] tracking-[-0.02em]">
            Seu tutor com IA para o vestibular.
          </h1>
          <p className="mt-6 text-lg text-gray-500 font-normal max-w-[600px] mx-auto">
            Plano de estudos personalizado, simulados adaptativos e tutor inteligente — tudo em um lugar.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="#funcionalidades"
              className="h-12 px-6 inline-flex items-center justify-center rounded-full bg-white text-[#0A0A0A] text-sm font-medium border border-gray-200 hover:border-gray-300 transition-all"
            >
              Ver funcionalidades
            </a>
            <Link
              to="/registro"
              className="h-12 px-6 inline-flex items-center justify-center rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-all"
            >
              Começar Grátis
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-400">Grátis para começar. Sem cartão de crédito.</p>
        </div>
      </section>

      {/* Product Screenshot */}
      <section className="pb-16">
        <div className="max-w-[900px] mx-auto px-4">
          <div
            className="rounded-xl border border-gray-200 shadow-2xl overflow-hidden bg-white"
            style={{ transform: "perspective(2000px) rotateX(2deg)" }}
          >
            {/* Fake top bar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded bg-black flex items-center justify-center">
                  <BookOpen className="h-2.5 w-2.5 text-white" />
                </div>
                <span className="text-xs font-semibold text-[#0A0A0A]">Cátedra</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Olá, Maria</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 font-medium">7 dias</span>
              </div>
            </div>
            {/* Fake dashboard */}
            <div className="p-5 md:p-6">
              <div className="bg-[#6366F1] rounded-xl p-4 mb-4">
                <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">ENEM 2026</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">247</span>
                  <span className="text-white/50 text-sm">dias restantes</span>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { subject: "Matemática", topic: "Funções do 2° grau", type: "Questões" },
                  { subject: "Português", topic: "Interpretação de texto", type: "Resumo" },
                ].map((m) => (
                  <div key={m.topic} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{m.subject}</p>
                      <p className="text-sm font-medium text-[#0A0A0A]">{m.topic}</p>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">{m.type}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500 font-medium">Progresso de hoje</span>
                  <span className="text-xs text-gray-400">3 de 5 missões</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full w-3/5 bg-[#6366F1] rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logo Strip */}
      <section className="py-16 border-y border-gray-100 overflow-hidden">
        <div className="max-w-[1100px] mx-auto px-4">
          <p className="text-center text-sm text-gray-400 font-normal mb-8">
            Preparação para os melhores vestibulares
          </p>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent z-10" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-transparent z-10" />
          <div className="flex animate-marquee">
            {[...logos, ...logos].map((logo, i) => (
              <span key={i} className="text-xl font-bold text-gray-300 whitespace-nowrap px-8 flex-shrink-0">
                {logo}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features Showcase */}
      <section id="funcionalidades" className="py-16 md:py-20">
        <div className="max-w-[1100px] mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-semibold text-[#0A0A0A] text-center">
            De diagnóstico a aprovação.
          </h2>
          <p className="text-gray-500 text-center mt-3 max-w-lg mx-auto">
            Tudo que você precisa para estudar de forma inteligente.
          </p>

          <div className="mt-12 space-y-6">
            {/* Feature 1 */}
            <div className="bg-gray-50 rounded-2xl p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center mb-4">
                  <Target className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-[#0A0A0A]">Diagnóstico adaptativo</h3>
                <p className="mt-2 text-gray-500 text-sm leading-relaxed">
                  25 questões que ajustam a dificuldade ao seu nível. A IA identifica suas lacunas em minutos.
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs text-gray-400 font-medium mb-3">Questão 12 de 25</p>
                <p className="text-sm font-medium text-[#0A0A0A] mb-4">
                  Se f(x) = 2x² - 8x + 6, qual é o vértice da parábola?
                </p>
                <div className="space-y-2">
                  {["(2, -2)", "(4, 6)", "(2, 2)", "(-2, -2)"].map((opt, i) => (
                    <div
                      key={opt}
                      className={`p-3 rounded-lg border text-sm font-medium ${
                        i === 0 ? "border-[#6366F1] bg-[#6366F1]/5 text-[#6366F1]" : "border-gray-200 text-gray-600"
                      }`}
                    >
                      <span className="text-xs mr-2 font-semibold">{String.fromCharCode(65 + i)}</span>
                      {opt}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-gray-50 rounded-2xl p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center">
              <div className="md:order-2">
                <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center mb-4">
                  <BookOpen className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-[#0A0A0A]">Plano de estudos com IA</h3>
                <p className="mt-2 text-gray-500 text-sm leading-relaxed">
                  Missões diárias personalizadas baseadas nas suas fraquezas, horários e data da prova.
                </p>
              </div>
              <div className="md:order-1 bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs text-gray-400 font-medium mb-3">Missões de hoje</p>
                <div className="space-y-2">
                  {[
                    { s: "Matemática", t: "Funções do 2° grau", done: true },
                    { s: "Português", t: "Interpretação de texto", done: true },
                    { s: "Física", t: "Cinemática", done: false },
                    { s: "Biologia", t: "Genética", done: false },
                  ].map((m) => (
                    <div key={m.t} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100">
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${m.done ? "bg-black border-black" : "border-gray-300"}`}>
                        {m.done && (
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{m.s}</p>
                        <p className={`text-sm font-medium ${m.done ? "text-gray-400 line-through" : "text-[#0A0A0A]"}`}>{m.t}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-gray-50 rounded-2xl p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center mb-4">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-[#0A0A0A]">Tutor inteligente</h3>
                <p className="mt-2 text-gray-500 text-sm leading-relaxed">
                  Tire dúvidas a qualquer momento. O tutor conhece seu nível e adapta as explicações.
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <div className="bg-black text-white text-sm px-4 py-2.5 rounded-2xl rounded-br-md max-w-[80%]">
                      Não entendi derivadas. Pode me explicar?
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-[#0A0A0A] text-sm px-4 py-2.5 rounded-2xl rounded-bl-md max-w-[80%]">
                      Claro! Derivada é a taxa de variação instantânea de uma função. Pense assim: se f(x) é a posição, f'(x) é a velocidade.
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-black text-white text-sm px-4 py-2.5 rounded-2xl rounded-br-md max-w-[80%]">
                      Ah, faz sentido! E a integral?
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3 smaller cards */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            {features.map((f) => (
              <div key={f.title} className="bg-gray-50 rounded-2xl p-8">
                <f.icon className="h-6 w-6 text-[#0A0A0A]" />
                <h3 className="text-lg font-semibold text-[#0A0A0A] mt-4">{f.title}</h3>
                <p className="text-sm text-gray-500 mt-2">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16">
        <div className="max-w-[1100px] mx-auto px-4">
          <p className="text-sm text-gray-400 uppercase tracking-wider text-center mb-10">Alunos</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((t) => (
              <div key={t.name}>
                <p className="text-sm text-gray-600 leading-relaxed">{t.quote}</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-medium text-sm">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#0A0A0A]">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="max-w-[700px] mx-auto px-4">
          <h2 className="text-3xl font-semibold text-[#0A0A0A] text-center mb-10">
            Perguntas frequentes
          </h2>
          <div>
            {faqs.map((faq, i) => (
              <div key={i} className="border-b border-gray-100">
                <button
                  className="w-full flex items-center justify-between py-5 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="text-sm font-medium text-[#0A0A0A]">{faq.q}</span>
                  {openFaq === i ? (
                    <Minus className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <Plus className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <p className="pb-5 text-sm text-gray-500 leading-relaxed">{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="max-w-[1100px] mx-auto px-4">
          <div className="bg-gray-50 rounded-2xl py-16 px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-semibold text-[#0A0A0A]">
              Estude de forma mais inteligente.
            </h2>
            <p className="text-gray-500 mt-3">
              Crie sua conta grátis e receba seu plano de estudos em minutos.
            </p>
            <Link
              to="/registro"
              className="mt-6 h-12 px-6 inline-flex items-center justify-center rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-all"
            >
              Começar Grátis
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100">
        <div className="max-w-[1100px] mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-black flex items-center justify-center">
                <BookOpen className="h-2.5 w-2.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-[#0A0A0A]">Cátedra</span>
            </div>
            <span className="text-xs text-gray-400">© 2026 Cátedra</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <a href="#" className="hover:text-gray-600 transition-colors">Termos de Uso</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Política de Privacidade</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
