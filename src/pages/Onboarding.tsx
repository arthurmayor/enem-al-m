import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ExamOption {
  exam_slug: string;
  exam_name: string;
}

interface CourseOption {
  id: string;
  course_name: string;
  campus: string;
  course_slug: string;
}

const schoolYearOptions = ["1º ano EM", "2º ano EM", "3º ano EM", "Cursinho", "Formado", "Graduação"];
const universityOptions = ["USP", "Unicamp", "UNESP", "UFMG", "UFRJ", "Outro"];

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

  // Step 1: Exam + Course from exam_configs
  const [examOptions, setExamOptions] = useState<ExamOption[]>([]);
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>([]);
  const [selectedExamSlug, setSelectedExamSlug] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [loadingExams, setLoadingExams] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(false);

  // Step 2
  const [targetUniversities, setTargetUniversities] = useState<string[]>([]);
  const [schoolYear, setSchoolYear] = useState("");
  const [age, setAge] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(3);
  const [selectedDays, setSelectedDays] = useState<string[]>(["segunda", "terca", "quarta", "quinta", "sexta"]);
  const [examDate, setExamDate] = useState("");

  // Load exam options from exam_configs
  useEffect(() => {
    const loadExams = async () => {
      const { data, error } = await supabase
        .from("exam_configs")
        .select("exam_slug, exam_name")
        .eq("is_active", true);
      if (error) {
        console.error("Error loading exams:", error);
        setLoadingExams(false);
        return;
      }
      // Deduplicate by exam_slug
      const seen = new Set<string>();
      const unique: ExamOption[] = [];
      for (const row of data || []) {
        if (!seen.has(row.exam_slug)) {
          seen.add(row.exam_slug);
          unique.push({ exam_slug: row.exam_slug, exam_name: row.exam_name });
        }
      }
      setExamOptions(unique);
      setLoadingExams(false);
    };
    loadExams();
  }, []);

  // Load courses when exam changes
  useEffect(() => {
    if (!selectedExamSlug) {
      setCourseOptions([]);
      setSelectedConfigId("");
      return;
    }
    const loadCourses = async () => {
      setLoadingCourses(true);
      const { data, error } = await supabase
        .from("exam_configs")
        .select("id, course_name, campus, course_slug")
        .eq("exam_slug", selectedExamSlug)
        .eq("is_active", true);
      if (error) {
        console.error("Error loading courses:", error);
        setLoadingCourses(false);
        return;
      }
      setCourseOptions(data || []);
      setSelectedConfigId("");
      setLoadingCourses(false);
    };
    loadCourses();
  }, [selectedExamSlug]);

  const selectedExamName = examOptions.find((e) => e.exam_slug === selectedExamSlug)?.exam_name || "";
  const selectedCourse = courseOptions.find((c) => c.id === selectedConfigId);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };
  const toggleUniversity = (uni: string) => {
    setTargetUniversities((prev) => {
      if (prev.includes(uni)) return prev.filter((u) => u !== uni);
      if (prev.length >= 3) return prev;
      return [...prev, uni];
    });
  };
  const canProceed = () => {
    if (step === 1) return !!selectedExamSlug && !!selectedConfigId;
    if (step === 2) return true;
    if (step === 3) return selectedDays.length > 0 && hoursPerDay > 0;
    return false;
  };

  const handleFinish = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("profiles").update({
      education_goal: selectedExamSlug,
      desired_course: selectedCourse?.course_name || "",
      target_universities: targetUniversities,
      school_year: schoolYear,
      age: age ? parseInt(age) : null,
      hours_per_day: hoursPerDay,
      study_days: selectedDays,
      exam_date: examDate || null,
      exam_config_id: selectedConfigId,
      onboarding_complete: true,
    }).eq("id", user.id);
    setLoading(false);
    if (error) { toast.error("Erro ao salvar seus dados. Tente novamente."); console.error(error); }
    else navigate("/diagnostic/intro");
  };

  const handleNext = () => { if (step < 3) setStep(step + 1); else handleFinish(); };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="h-9 w-9 rounded-xl bg-foreground flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-semibold text-foreground tracking-tight">Cátedra</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-sm font-semibold transition-all duration-200 ${
                s <= step ? "bg-foreground text-white" : "bg-gray-100 text-muted-foreground"
              }`}>
                {s < step ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 rounded-full ${s < step ? "bg-foreground" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        <div className="bg-card rounded-xl shadow-rest p-8">
          {/* Step 1: Vestibular + Curso */}
          {step === 1 && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-foreground text-center">Qual é o seu objetivo?</h2>
              <p className="text-sm text-muted-foreground text-center mt-1">Selecione o vestibular e o curso desejado</p>

              <div className="mt-6 space-y-5">
                {/* Dropdown vestibular */}
                <div>
                  <label className="text-sm font-medium text-foreground">Qual vestibular?</label>
                  {loadingExams ? (
                    <div className="mt-1.5 h-11 flex items-center justify-center">
                      <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <select
                      value={selectedExamSlug}
                      onChange={(e) => setSelectedExamSlug(e.target.value)}
                      className="mt-1.5 w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    >
                      <option value="">Selecione o vestibular...</option>
                      {examOptions.map((exam) => (
                        <option key={exam.exam_slug} value={exam.exam_slug}>
                          {exam.exam_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Dropdown curso */}
                {selectedExamSlug && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Qual curso?</label>
                    {loadingCourses ? (
                      <div className="mt-1.5 h-11 flex items-center justify-center">
                        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <select
                        value={selectedConfigId}
                        onChange={(e) => setSelectedConfigId(e.target.value)}
                        className="mt-1.5 w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      >
                        <option value="">Selecione o curso...</option>
                        {courseOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.course_name}{c.campus ? ` — ${c.campus}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: About */}
          {step === 2 && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-foreground text-center">Sobre você</h2>
              <p className="text-sm text-muted-foreground text-center mt-1">
                {selectedExamName ? `${selectedExamName} — ${selectedCourse?.course_name || ""}` : "Nos conte mais para personalizar seu plano"}
              </p>
              <div className="mt-6 space-y-5">
                <div>
                  <label className="text-sm font-medium text-foreground">Universidades alvo (até 3)</label>
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
                <div>
                  <label className="text-sm font-medium text-foreground">Série / Escolaridade</label>
                  <select value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)}
                    className="mt-1.5 w-full h-11 px-4 rounded-xl bg-white border border-gray-200 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-foreground transition-all">
                    <option value="">Selecione...</option>
                    {schoolYearOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Idade</label>
                  <input type="number" min="13" max="60" value={age} onChange={(e) => setAge(e.target.value)}
                    className="mt-1.5 w-full h-11 px-4 rounded-xl bg-white border border-gray-200 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-foreground transition-all"
                    placeholder="Sua idade" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-semibold text-foreground text-center">Sua rotina de estudos</h2>
              <p className="text-sm text-muted-foreground text-center mt-1">Quando e quanto você pode estudar?</p>
              <div className="mt-6 space-y-6">
                <div>
                  <label className="text-sm font-medium text-foreground">Dias de estudo</label>
                  <div className="mt-3 flex gap-2 justify-center">
                    {weekDays.map((day) => (
                      <button key={day.id} onClick={() => toggleDay(day.id)}
                        className={`h-10 w-10 rounded-full text-xs font-semibold transition-all duration-200 ${
                          selectedDays.includes(day.id) ? "bg-foreground text-white" : "bg-white text-muted-foreground border border-gray-200 hover:border-gray-400"
                        }`}>{day.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Horas por dia</label>
                  <div className="mt-3">
                    <input type="range" min="1" max="8" value={hoursPerDay} onChange={(e) => setHoursPerDay(parseInt(e.target.value))}
                      className="w-full accent-[hsl(var(--foreground))]" />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>1h</span>
                      <span className="text-base font-semibold text-foreground">{hoursPerDay}h/dia</span>
                      <span>8h</span>
                    </div>
                  </div>
                  <p className="text-center text-sm text-muted-foreground mt-2">{hoursPerDay * selectedDays.length}h por semana</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Data do próximo exame</label>
                  <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)}
                    className="mt-1.5 w-full h-11 px-4 rounded-xl bg-white border border-gray-200 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-foreground transition-all" />
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex gap-3">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)}
                className="flex-1 h-11 rounded-full bg-white text-foreground text-sm font-medium border border-gray-200 hover:shadow-md transition-all">
                Voltar
              </button>
            )}
            <button onClick={handleNext} disabled={!canProceed() || loading}
              className="flex-1 h-11 rounded-full bg-foreground text-white text-sm font-medium hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-40">
              {loading ? "Salvando..." : step === 3 ? "Começar Diagnóstico" : "Continuar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
