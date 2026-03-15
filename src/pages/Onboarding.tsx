import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Check } from "lucide-react";

const examOptions = [
  { id: "enem", label: "ENEM", desc: "Exame Nacional do Ensino Médio" },
  { id: "fuvest", label: "Fuvest", desc: "Vestibular da USP" },
  { id: "unicamp", label: "Unicamp", desc: "Vestibular da Unicamp" },
  { id: "oab", label: "OAB", desc: "Ordem dos Advogados do Brasil" },
  { id: "cpa20", label: "CPA-20", desc: "Certificação Profissional ANBIMA" },
];

const weekDays = [
  { id: "seg", label: "S" },
  { id: "ter", label: "T" },
  { id: "qua", label: "Q" },
  { id: "qui", label: "Q" },
  { id: "sex", label: "S" },
  { id: "sab", label: "S" },
  { id: "dom", label: "D" },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedExam, setSelectedExam] = useState("");
  const [university, setUniversity] = useState("");
  const [course, setCourse] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("3");
  const [selectedDays, setSelectedDays] = useState<string[]>(["seg", "ter", "qua", "qui", "sex"]);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const canProceed = () => {
    if (step === 1) return !!selectedExam;
    if (step === 2) return true; // optional
    if (step === 3) return selectedDays.length > 0 && Number(hoursPerDay) > 0;
    return false;
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else navigate("/dashboard");
  };

  const isVestibular = ["enem", "fuvest", "unicamp"].includes(selectedExam);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-10">
          <BookOpen className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-foreground">Cátedra</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200 ${
                  s < step
                    ? "bg-primary text-primary-foreground"
                    : s === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s < step ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-0.5 ${s < step ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-card rounded-xl shadow-rest p-8">
          {/* Step 1 */}
          {step === 1 && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-foreground text-center">Qual é seu objetivo?</h2>
              <p className="text-sm text-muted-foreground text-center mt-1">Selecione o exame que você vai prestar</p>
              <div className="mt-6 space-y-3">
                {examOptions.map((exam) => (
                  <button
                    key={exam.id}
                    onClick={() => setSelectedExam(exam.id)}
                    className={`w-full p-4 rounded-xl text-left transition-all duration-200 ${
                      selectedExam === exam.id
                        ? "bg-primary/5 shadow-[inset_0_0_0_2px_hsl(var(--primary))]"
                        : "bg-background shadow-rest hover:shadow-interactive"
                    }`}
                  >
                    <span className="font-semibold text-foreground">{exam.label}</span>
                    <span className="block text-sm text-muted-foreground mt-0.5">{exam.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-foreground text-center">
                {isVestibular ? "Universidade e curso" : "Área de atuação"}
              </h2>
              <p className="text-sm text-muted-foreground text-center mt-1">
                {isVestibular ? "Qual universidade e curso você deseja?" : "Nos conte mais sobre seus objetivos"}
              </p>
              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">
                    {isVestibular ? "Universidade" : "Objetivo principal"}
                  </label>
                  <select
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    className="mt-1.5 w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  >
                    <option value="">Selecione...</option>
                    {isVestibular ? (
                      <>
                        <option value="usp">USP</option>
                        <option value="unicamp">Unicamp</option>
                        <option value="unesp">UNESP</option>
                        <option value="federal">Universidade Federal</option>
                        <option value="outra">Outra</option>
                      </>
                    ) : (
                      <>
                        <option value="aprovacao">Aprovação no exame</option>
                        <option value="revisao">Revisão geral</option>
                        <option value="pratica">Questões práticas</option>
                      </>
                    )}
                  </select>
                </div>
                {isVestibular && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Curso desejado</label>
                    <input
                      type="text"
                      value={course}
                      onChange={(e) => setCourse(e.target.value)}
                      className="mt-1.5 w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="Ex: Medicina, Engenharia, Direito"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-foreground text-center">Sua disponibilidade</h2>
              <p className="text-sm text-muted-foreground text-center mt-1">Quando e quanto você pode estudar?</p>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="text-sm font-medium text-foreground">Dias de estudo</label>
                  <div className="mt-3 flex gap-2 justify-center">
                    {weekDays.map((day) => (
                      <button
                        key={day.id}
                        onClick={() => toggleDay(day.id)}
                        className={`h-10 w-10 rounded-lg text-sm font-semibold transition-all duration-200 ${
                          selectedDays.includes(day.id)
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground shadow-rest hover:shadow-interactive"
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Horas por dia</label>
                  <div className="mt-3 flex items-center gap-4 justify-center">
                    <button
                      onClick={() => setHoursPerDay(String(Math.max(1, Number(hoursPerDay) - 1)))}
                      className="h-10 w-10 rounded-lg bg-background shadow-rest hover:shadow-interactive text-foreground font-semibold transition-all"
                    >
                      −
                    </button>
                    <span className="text-3xl font-bold text-foreground tabular-nums w-12 text-center">
                      {hoursPerDay}
                    </span>
                    <button
                      onClick={() => setHoursPerDay(String(Math.min(12, Number(hoursPerDay) + 1)))}
                      className="h-10 w-10 rounded-lg bg-background shadow-rest hover:shadow-interactive text-foreground font-semibold transition-all"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-center text-sm text-muted-foreground mt-2">
                    {Number(hoursPerDay) * selectedDays.length}h por semana
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 flex gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex-1 h-11 rounded-lg bg-background text-foreground text-sm font-medium shadow-rest hover:shadow-interactive transition-all"
              >
                Voltar
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-accent active:scale-[0.98] transition-all duration-200 disabled:opacity-40"
            >
              {step === 3 ? "Começar Estudos" : "Continuar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
