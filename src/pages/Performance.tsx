import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const mockData = [
  { week: "Sem 1", matematica: 35, portugues: 60, fisica: 30 },
  { week: "Sem 2", matematica: 42, portugues: 63, fisica: 35 },
  { week: "Sem 3", matematica: 48, portugues: 68, fisica: 40 },
  { week: "Sem 4", matematica: 55, portugues: 72, fisica: 48 },
];

const weeklyStats = [
  { label: "Missões completadas", value: "12/15" },
  { label: "Taxa de acerto", value: "68%" },
  { label: "Horas estudadas", value: "14h" },
  { label: "Melhoria da semana", value: "+8% em Matemática" },
];

const worstSubtopics = [
  { name: "Geometria Espacial", subject: "Matemática", errors: 8 },
  { name: "Termodinâmica", subject: "Física", errors: 7 },
  { name: "Química Orgânica", subject: "Química", errors: 6 },
  { name: "Sintaxe", subject: "Português", errors: 4 },
];

const Performance = () => {
  const [selectedSubject, setSelectedSubject] = useState("all");
  const subjects = ["all", "Matemática", "Português", "Física"];

  const passProb = 52;
  const probColor = passProb >= 70 ? "text-success" : passProb >= 40 ? "text-warning" : "text-destructive";
  const probBg = passProb >= 70 ? "bg-success/10" : passProb >= 40 ? "bg-warning/10" : "bg-destructive/10";

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md shadow-rest">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4 max-w-3xl">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="text-base font-bold text-foreground">Performance</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* Pass Probability */}
        <div className="text-center animate-fade-in">
          <div className={`inline-flex items-center justify-center h-24 w-24 rounded-full ${probBg} ${probColor} text-3xl font-bold`}>
            {passProb}%
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">Probabilidade de Aprovação</p>
          <p className="text-xs text-muted-foreground">Estimativa baseada no seu desempenho</p>
        </div>

        {/* Weekly Summary */}
        <div className="mt-8 grid grid-cols-2 gap-3 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          {weeklyStats.map((stat) => (
            <div key={stat.label} className="p-4 bg-card rounded-xl shadow-rest">
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-base font-semibold text-foreground mb-4">Evolução por Matéria</h2>
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSubject(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedSubject === s ? "bg-primary text-primary-foreground" : "bg-card shadow-rest text-foreground"
                }`}
              >
                {s === "all" ? "Todas" : s}
              </button>
            ))}
          </div>
          <div className="bg-card rounded-xl shadow-rest p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockData}>
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip />
                {(selectedSubject === "all" || selectedSubject === "Matemática") && (
                  <Line type="monotone" dataKey="matematica" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Matemática" />
                )}
                {(selectedSubject === "all" || selectedSubject === "Português") && (
                  <Line type="monotone" dataKey="portugues" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Português" />
                )}
                {(selectedSubject === "all" || selectedSubject === "Física") && (
                  <Line type="monotone" dataKey="fisica" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} name="Física" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Worst Subtopics */}
        <div className="mt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <h2 className="text-base font-semibold text-foreground mb-4">Tópicos com Mais Erros</h2>
          <div className="space-y-2">
            {worstSubtopics.map((t) => (
              <div key={t.name} className="flex items-center justify-between p-4 bg-card rounded-xl shadow-rest">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.subject} • {t.errors} erros</p>
                </div>
                <Link
                  to="/study"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Praticar
                </Link>
              </div>
            ))}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Performance;
