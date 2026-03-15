import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const subjectScores = [
  { name: "Matemática", score: 45, weakness: "Geometria espacial e probabilidade" },
  { name: "Português", score: 72, weakness: "Sintaxe e concordância verbal" },
  { name: "Biologia", score: 58, weakness: "Genética e ecologia" },
  { name: "Química", score: 35, weakness: "Química orgânica e estequiometria" },
  { name: "Física", score: 42, weakness: "Termodinâmica e eletromagnetismo" },
  { name: "História", score: 68, weakness: "Brasil República e Era Vargas" },
  { name: "Geografia", score: 55, weakness: "Climatologia e geopolítica" },
];

const overallScore = Math.round(subjectScores.reduce((a, b) => a + b.score, 0) / subjectScores.length);

const getScoreColor = (score: number) => {
  if (score >= 70) return "text-success bg-success/10";
  if (score >= 40) return "text-warning bg-warning/10";
  return "text-destructive bg-destructive/10";
};

const getBarColor = (score: number) => {
  if (score >= 70) return "bg-success";
  if (score >= 40) return "bg-warning";
  return "bg-destructive";
};

const DiagnosticResults = () => {
  const priorityAreas = [...subjectScores]
    .sort((a, b) => a.score - b.score)
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md shadow-rest">
        <div className="container mx-auto flex h-14 items-center px-4 max-w-3xl">
          <span className="text-base font-bold text-foreground">Resultado do Diagnóstico</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Overall Score */}
        <div className="text-center animate-fade-in">
          <div className={`inline-flex items-center justify-center h-28 w-28 rounded-full ${getScoreColor(overallScore)} text-4xl font-bold`}>
            {overallScore}%
          </div>
          <p className="mt-4 text-lg font-semibold text-foreground">
            {overallScore >= 70 ? "Bom nível!" : overallScore >= 40 ? "Nível intermediário" : "Precisa de reforço"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Sua preparação geral para o exame</p>
        </div>

        {/* Subject Scores */}
        <div className="mt-10 space-y-3 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <h2 className="text-base font-semibold text-foreground mb-4">Proficiência por Matéria</h2>
          {subjectScores.map((s) => (
            <div key={s.name} className="p-4 bg-card rounded-xl shadow-rest">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground">{s.name}</span>
                <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${getScoreColor(s.score)}`}>
                  {s.score}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full">
                <div className={`h-2 rounded-full transition-all duration-700 ${getBarColor(s.score)}`} style={{ width: `${s.score}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Foco: {s.weakness}</p>
            </div>
          ))}
        </div>

        {/* Priority Areas */}
        <div className="mt-10 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-base font-semibold text-foreground mb-4">Áreas Prioritárias</h2>
          <div className="space-y-2">
            {priorityAreas.map((area, i) => (
              <div key={area.name} className="flex items-center gap-3 p-3 bg-destructive/5 rounded-lg border border-destructive/10">
                <span className="text-sm font-bold text-destructive">{i + 1}.</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{area.name}</p>
                  <p className="text-xs text-muted-foreground">{area.weakness}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Summary */}
        <div className="mt-10 p-5 bg-primary/5 rounded-xl border border-primary/10 animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <p className="text-sm text-foreground leading-relaxed">
            Você demonstra bom conhecimento em <strong>Português</strong> e <strong>História</strong>, mas precisa reforçar significativamente <strong>Química</strong>, <strong>Física</strong> e <strong>Matemática</strong>. Recomendamos focar nessas áreas nos próximos 30 dias com exercícios diários e revisões espaçadas.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-10 animate-fade-in" style={{ animationDelay: "0.4s" }}>
          <Link
            to="/dashboard"
            className="w-full h-12 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200"
          >
            Gerar Meu Plano de Estudos
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default DiagnosticResults;
