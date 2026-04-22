import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { setOnboardingCache } from "@/components/ProtectedRoute";
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
    // `profiles.name` is NOT NULL. We use upsert so users whose row
    // was never created at signup (e.g. the email-confirmation flow,
    // where AuthContext can't insert until the user confirms) still end
    // up with a valid row — but the INSERT branch needs a name. Pull it
    // from user_metadata (set during supabase.auth.signUp) and fall back
    // to the email prefix so the upsert never throws NOT NULL.
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fallbackName =
      (typeof metadata.name === "string" && metadata.name) ||
      user.email?.split("@")[0] ||
      "Estudante";

    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          name: fallbackName,
          exam_config_id: data.exam_config_id,
          school_stage: data.school_stage,
          hours_per_day: data.hours_per_day,
          available_days: data.available_days,
          current_biggest_difficulty: data.current_biggest_difficulty,
          self_declared_blocks: data.self_declared_blocks,
          onboarding_completed_at: new Date().toISOString(),
          onboarding_complete: true,
        } as any,
        { onConflict: "id" },
      );
    setLoading(false);
    if (error) {
      console.error("[Onboarding.handleFinish] upsert failed", error);
      toast.error(`Erro ao salvar: ${error.message}`);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setOnboardingCache(user.id, true);
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
    <div className="min-h-screen bg-bg-app flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="h-8 w-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold text-ink-strong tracking-tight">Cátedra</span>
        </div>

        {/* Progress steps */}
        <div className="mb-8">
          <ProgressIndicator current={step} total={TOTAL_STEPS} />
        </div>

        {/* Main card */}
        <div className="bg-bg-card max-w-lg w-full mx-auto rounded-card shadow-card p-8 border border-line-light">
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
              onChangeHours={(v) => update("hours_per_day", v)}
              onToggleDay={toggleDay}
            />
          )}

          {step === 3 && (
            <StepAboutYou
              schoolStage={data.school_stage}
              difficulty={data.current_biggest_difficulty}
              onChangeStage={(v) => update("school_stage", v)}
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
          <div className="flex justify-between items-center mt-6">
            {step > 1 ? (
              <button
                onClick={handleBack}
                className="bg-transparent text-ink-soft hover:text-ink text-sm font-medium transition-colors"
              >
                ← Voltar
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="bg-ink-strong text-white rounded-input px-6 py-3 font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : step === TOTAL_STEPS ? (
                <>
                  Começar diagnóstico rápido
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Próximo
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {step === TOTAL_STEPS && (
            <p className="text-xs text-ink-muted text-center mt-4">
              São apenas 8 questões para montar seu ponto de partida.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
