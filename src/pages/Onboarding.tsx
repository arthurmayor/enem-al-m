import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ProgressIndicator from "@/components/onboarding/ProgressIndicator";
import StepCourse from "@/components/onboarding/StepCourse";
import StepRoutine from "@/components/onboarding/StepRoutine";
import StepAboutYou from "@/components/onboarding/StepAboutYou";
import StepSelfAssessment from "@/components/onboarding/StepSelfAssessment";
import { type OnboardingData, INITIAL_DATA, STORAGE_KEY } from "@/components/onboarding/types";
import { trackEvent } from "@/lib/trackEvent";

const TOTAL_STEPS = 4;

const loadDraft = (): OnboardingData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...INITIAL_DATA, ...JSON.parse(raw) };
  } catch {}
  return { ...INITIAL_DATA };
};

const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<OnboardingData>(loadDraft);
  const [loading, setLoading] = useState(false);
  const step = data.current_step;

  // Track onboarding start once
  useEffect(() => {
    trackEvent("onboarding_started", {}, user?.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist draft on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const update = useCallback(
    <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
      setData((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const canProceed = () => {
    if (step === 1) return !!data.exam_config_id;
    if (step === 2) return data.hours_per_day !== null && data.available_days.length > 0;
    if (step === 3) return !!data.school_stage;
    if (step === 4) return Object.keys(data.self_declared_blocks).length === 4;
    return false;
  };

  const handleFinish = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        exam_config_id: data.exam_config_id,
        school_stage: data.school_stage,
        school_type: data.school_type,
        hours_per_day: data.hours_per_day,
        available_days: data.available_days,
        preferred_shift: data.preferred_shift,
        routine_is_unstable: data.routine_is_unstable,
        last_mock_experience: data.last_mock_experience,
        current_biggest_difficulty: data.current_biggest_difficulty,
        self_declared_blocks: data.self_declared_blocks,
        onboarding_completed_at: new Date().toISOString(),
        onboarding_complete: true,
      } as any)
      .eq("id", user.id);
    setLoading(false);
    if (error) {
      console.error(error);
      toast.error("Erro ao salvar. Tente novamente.");
    } else {
      localStorage.removeItem(STORAGE_KEY);
      trackEvent("onboarding_completed", {}, user?.id);
      navigate("/diagnostic/intro");
    }
  };

  const handleNext = () => {
    trackEvent("onboarding_step_completed", { step }, user?.id);
    if (step < TOTAL_STEPS) update("current_step", step + 1);
    else handleFinish();
  };

  const handleBack = () => {
    if (step > 1) update("current_step", step - 1);
  };

  const toggleDay = (day: string) => {
    const days = data.available_days.includes(day)
      ? data.available_days.filter((d) => d !== day)
      : [...data.available_days, day];
    update("available_days", days);
  };

  const updateBlock = useCallback(
    (key: string, value: string) => {
      setData((prev) => ({
        ...prev,
        self_declared_blocks: { ...prev.self_declared_blocks, [key]: value },
      }));
    },
    []
  );

  const handleCourseChange = useCallback(
    (id: string, label: string) => {
      setData((prev) => ({ ...prev, exam_config_id: id, course_label: label }));
    },
    []
  );

  return (
    <div className="min-h-screen bg-secondary/30 flex items-start justify-center px-4 py-8 sm:py-16">
      <div className="w-full max-w-[480px] sm:max-w-[560px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-foreground flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground tracking-tight">Cátedra</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {step} de {TOTAL_STEPS}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <ProgressIndicator current={step} total={TOTAL_STEPS} />
        </div>

        {/* Main card */}
        <div className="bg-card rounded-2xl border border-border shadow-rest p-6 sm:p-8">
          {step === 1 && (
            <StepCourse
              selectedId={data.exam_config_id}
              courseLabel={data.course_label}
              onChange={handleCourseChange}
            />
          )}

          {step === 2 && (
            <StepRoutine
              hoursPerDay={data.hours_per_day}
              availableDays={data.available_days}
              preferredShift={data.preferred_shift}
              routineIsUnstable={data.routine_is_unstable}
              onChangeHours={(v) => update("hours_per_day", v)}
              onToggleDay={toggleDay}
              onChangeShift={(v) => update("preferred_shift", v)}
              onChangeUnstable={(v) => update("routine_is_unstable", v)}
            />
          )}

          {step === 3 && (
            <StepAboutYou
              schoolStage={data.school_stage}
              schoolType={data.school_type}
              lastMockExperience={data.last_mock_experience}
              difficulty={data.current_biggest_difficulty}
              onChangeStage={(v) => update("school_stage", v)}
              onChangeType={(v) => update("school_type", v)}
              onChangeMock={(v) => update("last_mock_experience", v)}
              onChangeDifficulty={(v) => update("current_biggest_difficulty", v)}
            />
          )}

          {step === 4 && (
            <StepSelfAssessment
              selfDeclaredBlocks={data.self_declared_blocks}
              onChange={updateBlock}
            />
          )}

          {/* Navigation */}
          <div className="mt-8 flex gap-3">
            {step > 1 && (
              <button
                onClick={handleBack}
                className="flex-1 h-12 rounded-xl bg-background text-foreground text-sm font-medium border border-border hover:bg-secondary/60 transition-all"
              >
                Voltar
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="flex-1 h-12 rounded-xl bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : step === TOTAL_STEPS ? (
                <>
                  Começar diagnóstico rápido
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                "Continuar"
              )}
            </button>
          </div>

          {step === TOTAL_STEPS && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              São apenas 8 questões para montar seu ponto de partida.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
