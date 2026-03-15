import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const examOptions = [
  { id: "enem", label: "ENEM", desc: "Exame Nacional do Ensino Médio" },
  { id: "fuvest", label: "Fuvest", desc: "Vestibular da USP" },
  { id: "unicamp", label: "Unicamp", desc: "Vestibular da Unicamp" },
  { id: "oab", label: "OAB", desc: "Ordem dos Advogados do Brasil" },
  { id: "cpa20", label: "CPA-20", desc: "Certificação ANBIMA Série 20" },
  { id: "cea", label: "CEA", desc: "Certificação de Especialista ANBIMA" },
  { id: "concurso", label: "Concurso Público", desc: "Preparação para concursos" },
  { id: "reforco", label: "Reforço Escolar", desc: "Reforço para ensino médio" },
];

const courseOptions = ["Engenharia", "Medicina", "Direito", "Administração", "Ciência da Computação", "Outro"];
const universityOptions = ["USP", "Unicamp", "UNESP", "UFMG", "UFRJ", "Outro"];
const schoolYearOptions = ["1º ano EM", "2º ano EM", "3º ano EM", "Cursinho", "Formado", "Graduação"];

const weekDays = [
  { id: "segunda", label: "Seg" },
  { id: "terca", label: "Ter" },
  { id: "quarta", label: "Qua" },
  { id: "quinta", label: "Qui" },
  { id: "sexta", label: "Sex" },
  { id: "sabado", label: "Sáb" },
  { id: "domingo", label: "Dom" },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [selectedExam, setSelectedExam] = useState("");
  const [course, setCourse] = useState("");

  // Step 2
  const [targetUniversities, setTargetUniversities] = useState<string[]>([]);
  const [schoolYear, setSchoolYear] = useState("");
  const [age, setAge] = useState("");

  // Step 3
  const [hoursPerDay, setHoursPerDay] = useState(3);
  const [selectedDays, setSelectedDays] = useState<string[]>(["segunda", "terca", "quarta", "quinta", "sexta"]);
  const [examDate, setExamDate] = useState("");

  const isVestibular = ["enem", "fuvest", "unicamp"].includes(selectedExam);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const toggleUniversity = (uni: string) => {
    setTargetUniversities((prev) => {
      if (prev.includes(uni)) return prev.filter((u) => u !== uni);
      if (prev.length >= 3) return prev;
      return [...prev, uni];
    });
  };

  const canProceed = () => {
    if (step === 1) return !!selectedExam;
    if (step === 2) return true;
    if (step === 3) return selectedDays.length > 0 && hoursPerDay > 0;
    return false;
  };

  const handleFinish = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      education_goal: selectedExam,
      desired_course: course,
      target_universities: targetUniversities,
      school_year: schoolYear,
      age: age ? parseInt(age) : null,
      hours_per_day: hoursPerDay,
      study_days: selectedDays,
      exam_date: examDate || null,
      onboarding_complete: true,
    });
    setLoading(false);
    if (error) {
      toast.error("Erro ao salvar seus dados. Tente novamente.");
      console.error(error);
    } else {
      navigate("/diagnostic/intro");
    }
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else handleFinish();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
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
                  s <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {s < step ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${s < step ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div className="bg-card rounded-xl shadow-rest p-8">
          {/* Step 1: Exam Goal */}
          {step === 1 && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-foreground text-center">Qual é o seu objetivo?</h2>
              <p className="text-sm text-muted-foreground text-center mt-1">Selecione o exame e o curso desejado</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {examOptions.map((exam) => (
                  <button
                    key={exam.id}
                    onClick={() => setSelectedExam(exam.id)}
                    className={`p-4 rounded-xl text-left transition-all duration-200 ${
                      selectedExam === exam.id
                        ? "bg-primary/5 shadow-[inset_0_0_0_2px_hsl(var(--primary))]"
                        : "bg-background shadow-rest hover:shadow-interactive"
                    }`}
                  >
                    <span className="font-semibold text-foreground text-sm">{exam.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{exam.desc}</span>
                  </button>
                ))}
              </div>
              {selectedExam && (
                <div className="mt-5">
                  <label className="text-sm font-medium text-foreground">
                    {isVestibular ? "Curso desejado" : "Área de foco"}
                  </label>
                  <select
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    className="mt-1.5 w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  >
                    <option value="">Selecione...</option>
                    {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Universities */}
          {step === 2 && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-foreground text-center">
                {isVestibular ? "Suas universidades alvo" : "Sobre você"}
              </h2>
              <p className="text-sm text-muted-foreground text-center mt-1">
                {isVestibular ? "Selecione até 3 universidades" : "Nos conte mais para personalizar seu plano"}
              </p>
              <div className="mt-6 space-y-5">
                {isVestibular && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Universidades (até 3)</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {universityOptions.map((uni) => (
                        <button
                          key={uni}
                          onClick={() => toggleUniversity(uni)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            targetUniversities.includes(uni)
                              ? "bg-primary text-primary-foreground"
                              : "bg-background shadow-rest text-foreground hover:shadow-interactive"
                          }`}
                        >
                          {uni}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-foreground">Série / Escolaridade</label>
                  <select
                    value={schoolYear}
                    onChange={(e) => setSchoolYear(e.target.value)}
                    className="mt-1.5 w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  >
                    <option value="">Selecione...</option>
                    {schoolYearOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Idade</label>
                  <input
                    type="number"
                    min="13"
                    max="60"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="mt-1.5 w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="Sua idade"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Schedule */}
          {step === 3 && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-foreground text-center">Sua rotina de estudos</h2>
              <p className="text-sm text-muted-foreground text-center mt-1">Quando e quanto você pode estudar?</p>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="text-sm font-medium text-foreground">Dias de estudo</label>
                  <div className="mt-3 flex gap-2 justify-center">
                    {weekDays.map((day) => (
                      <button
                        key={day.id}
                        onClick={() => toggleDay(day.id)}
                        className={`h-10 w-10 rounded-lg text-xs font-semibold transition-all duration-200 ${
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
                  <div className="mt-3">
                    <input
                      type="range"
                      min="1"
                      max="8"
                      value={hoursPerDay}
                      onChange={(e) => setHoursPerDay(parseInt(e.target.value))}
                      className="w-full accent-[hsl(var(--primary))]"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>1h</span>
                      <span className="text-base font-bold text-foreground">{hoursPerDay}h/dia</span>
                      <span>8h</span>
                    </div>
                  </div>
                  <p className="text-center text-sm text-muted-foreground mt-2">
                    {hoursPerDay * selectedDays.length}h por semana
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Data do próximo exame</label>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="mt-1.5 w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
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
              disabled={!canProceed() || loading}
              className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-40"
            >
              {loading ? "Salvando..." : step === 3 ? "Começar Diagnóstico" : "Continuar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
