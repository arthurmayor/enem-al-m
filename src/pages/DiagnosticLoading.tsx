import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/trackEvent";
import { MISSION_STATUSES, PLAN_STATUSES } from "@/lib/constants";

const TIPS = [
  "Estudar 45 min com foco supera 3 horas de distração.",
  "Repetição espaçada é a técnica mais eficaz para memorizar.",
  "Começar pela matéria mais difícil quando a energia está alta aumenta o rendimento.",
];

interface RouterResultData {
  placementBand: "base" | "intermediario" | "competitivo" | "forte";
  placementConfidence: "low" | "medium";
  strengths: string[];
  bottlenecks: string[];
  initialPriority: Array<{ subject: string; weight: number }>;
  routerNote: string;
}

interface ExamConfigState {
  id: string;
  exam_slug: string;
  exam_name: string;
  course_slug: string;
  course_name: string;
  campus: string;
  cutoff_mean: number;
  cutoff_sd: number;
  total_questions: number;
  phase2_subjects: string[];
  competition_ratio: number;
  subject_distribution: Record<string, unknown>;
}

interface ProficiencyEntry {
  elo: number;
  correct: number;
  total: number;
  level: { label: string; color: string };
}

interface RouterState {
  mode: "router";
  routerResult: RouterResultData;
  totalCorrect: number;
  totalQuestions: number;
  examConfig: ExamConfigState;
  answers: Array<{ subject: string; is_correct: boolean; difficulty_elo: number }>;
}

interface DiagnosticState {
  proficiencies: Record<string, ProficiencyEntry>;
  estimatedScore: number;
  cutoff: number;
  gap: number;
  probability: number;
  totalCorrect: number;
  totalQuestions: number;
  examConfig: ExamConfigState;
}

async function generateAndSavePlan(
  userId: string,
  proficiencyScores: Record<string, unknown>,
  diagnosticResult: { placement_band: string; strengths: string[]; bottlenecks: string[] },
  examConfigData: {
    phase2_subjects: string[];
    cutoff_mean: number;
    competition_ratio: number;
    subject_distribution: Record<string, unknown>;
    total_questions: number;
  },
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, education_goal, desired_course, exam_date, hours_per_day, study_days, available_days, self_declared_blocks")
    .eq("id", userId)
    .single();
  const profileData = profile as Record<string, unknown> | null;
  const numDays = Array.isArray(profileData?.available_days)
    ? (profileData.available_days as unknown[]).length
    : Array.isArray(profileData?.study_days)
      ? (profileData.study_days as unknown[]).length
      : typeof profileData?.study_days === "number"
        ? (profileData.study_days as number)
        : 5;
  const userProfile = {
    ...(profile || {}),
    study_days: numDays,
    self_declared_blocks: profileData?.self_declared_blocks || {},
  };

  const { data: plan, error: invokeError } = await supabase.functions.invoke("generate-study-plan", {
    body: { proficiencyScores, userProfile, diagnosticResult, examConfig: examConfigData },
  });
  if (invokeError) throw new Error(invokeError.message);
  if (plan?.error) throw new Error(plan.error);

  // Supersede existing active plan
  const { data: existingPlan } = await supabase
    .from("study_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("is_current", true)
    .limit(1);
  if (existingPlan && existingPlan.length > 0) {
    await supabase.from("study_plans")
      .update({ status: PLAN_STATUSES.SUPERSEDED, is_current: false } as any)
      .eq("user_id", userId)
      .eq("is_current", true);
    await supabase.from("daily_missions")
      .update({ status: MISSION_STATUSES.SUPERSEDED } as any)
      .eq("user_id", userId)
      .eq("status", MISSION_STATUSES.PENDING);
  }

  const { data: savedPlan, error: planError } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      week_number: 1,
      start_date: new Date().toISOString().split("T")[0],
      plan_json: plan,
      is_current: true,
      version: 1,
    })
    .select("id")
    .single();
  if (planError) throw new Error(planError.message);

  const dayNames: Record<string, number> = {
    Domingo: 0, Segunda: 1, Terca: 2, Quarta: 3, Quinta: 4, Sexta: 5, Sabado: 6,
  };
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + 1);
  const firstOfWeekday: Record<number, Date> = {};
  for (let wd = 0; wd <= 6; wd++) {
    const d = new Date(start);
    while (d.getDay() !== wd) d.setDate(d.getDate() + 1);
    firstOfWeekday[wd] = new Date(d);
  }
  const weekdayCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const missionsToInsert: {
    user_id: string;
    study_plan_id: string;
    date: string;
    subject: string;
    subtopic: string;
    mission_type: string;
    status: string;
    estimated_minutes: number;
  }[] = [];

  for (const week of plan.weeks ?? []) {
    for (const dayObj of week.days ?? []) {
      const targetWeekday = dayNames[dayObj.day] ?? 1;
      const n = weekdayCount[targetWeekday] ?? 0;
      const base = firstOfWeekday[targetWeekday];
      const d = new Date(base);
      d.setDate(d.getDate() + n * 7);
      weekdayCount[targetWeekday] = n + 1;
      const dateStr = d.toISOString().split("T")[0];
      for (const mission of dayObj.missions ?? []) {
        missionsToInsert.push({
          user_id: userId,
          study_plan_id: savedPlan.id,
          date: dateStr,
          subject: mission.subject ?? "Geral",
          subtopic: mission.subtopic ?? "",
          mission_type: mission.type ?? "questions",
          status: MISSION_STATUSES.PENDING,
          estimated_minutes: mission.estimated_minutes ?? 15,
        });
      }
    }
  }

  if (missionsToInsert.length > 0) {
    await supabase.from("daily_missions").insert(missionsToInsert);
  }
  trackEvent("plan_generated", { missions: missionsToInsert.length }, userId);
}

const DiagnosticLoading = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [currentTip, setCurrentTip] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // Rotate tips
  useEffect(() => {
    const tipInterval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % TIPS.length);
    }, 2500);
    return () => clearInterval(tipInterval);
  }, []);

  // Auto-generate plan on mount
  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;

    const state = location.state as (RouterState | DiagnosticState & { mode?: string }) | null;

    const run = async () => {
      try {
        if (state && "mode" in state && state.mode === "router") {
          const rs = state as RouterState;
          const rr = rs.routerResult;
          const proficiencyScores = {
            proficiency: rr.initialPriority.map((p) => ({
              subject: p.subject,
              subtopic: p.subject,
              score: Math.max(0, 1 - p.weight),
              confidence: rs.totalQuestions >= 9 ? 0.3 : 0.2,
            })),
            overall_readiness: rs.totalCorrect / rs.totalQuestions,
            priority_areas: rr.bottlenecks,
            summary: `Diagnóstico rápido — Forças: ${rr.strengths.join(", ")}. Foco: ${rr.bottlenecks.join(", ")}.`,
          };
          const ec = rs.examConfig;
          await generateAndSavePlan(
            user.id,
            proficiencyScores,
            { placement_band: rr.placementBand, strengths: rr.strengths, bottlenecks: rr.bottlenecks },
            { phase2_subjects: ec.phase2_subjects || [], cutoff_mean: ec.cutoff_mean, competition_ratio: ec.competition_ratio, subject_distribution: ec.subject_distribution, total_questions: ec.total_questions },
          );
        } else if (state && "proficiencies" in state) {
          const ds = state as DiagnosticState;
          const proficiencyScores = {
            proficiency: Object.entries(ds.proficiencies).map(([subject, p]) => ({
              subject,
              subtopic: subject,
              score: Math.min(1, Math.max(0, (p.elo - 600) / 1200)),
              confidence: Math.min(1, p.total / 10),
            })),
            overall_readiness: ds.estimatedScore / (ds.examConfig.total_questions || 90),
            priority_areas: Object.entries(ds.proficiencies)
              .sort((a, b) => a[1].elo - b[1].elo)
              .slice(0, 3)
              .map(([s]) => s),
            summary: `Diagnóstico ${ds.examConfig.exam_name} - ${ds.examConfig.course_name}. Nota estimada: ${ds.estimatedScore}/${ds.examConfig.total_questions}.`,
          };
          const accuracy = ds.totalCorrect / ds.totalQuestions;
          let band = "intermediario";
          if (accuracy >= 0.75) band = "forte";
          else if (accuracy >= 0.55) band = "competitivo";
          else if (accuracy < 0.3) band = "base";
          const deepStrengths = Object.entries(ds.proficiencies)
            .sort((a, b) => b[1].elo - a[1].elo)
            .slice(0, 2)
            .map(([s]) => s);
          const deepBottlenecks = Object.entries(ds.proficiencies)
            .sort((a, b) => a[1].elo - b[1].elo)
            .slice(0, 3)
            .map(([s]) => s);
          const ec = ds.examConfig;
          await generateAndSavePlan(
            user.id,
            proficiencyScores,
            { placement_band: band, strengths: deepStrengths, bottlenecks: deepBottlenecks },
            { phase2_subjects: ec.phase2_subjects || [], cutoff_mean: ec.cutoff_mean, competition_ratio: ec.competition_ratio, subject_distribution: ec.subject_distribution, total_questions: ec.total_questions },
          );
        } else {
          throw new Error("Dados do diagnóstico não encontrados.");
        }
        navigate("/dashboard");
      } catch (err) {
        console.error("Plan generation error:", err);
        setError("Não foi possível gerar o plano. Tente novamente.");
      }
    };

    run();
  }, [user, location.state, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-base text-ink-strong font-medium">{error}</p>
          <button
            onClick={() => {
              started.current = false;
              setError(null);
            }}
            className="mt-4 px-6 py-2.5 bg-ink-strong text-white rounded-input text-sm font-semibold hover:bg-ink-strong/90 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <CheckCircle2 className="h-14 w-14 text-amber-500 mx-auto mb-6" />
        <h1 className="text-2xl font-semibold text-foreground">Diagnóstico concluído</h1>
        <p className="text-sm text-muted-foreground mt-2">Gerando seu plano personalizado...</p>

        <div className="mt-8 flex justify-center">
          <div className="h-6 w-6 border-2 border-gray-300 border-t-foreground rounded-full animate-spin" />
        </div>

        <p className="mt-8 text-sm text-muted-foreground animate-fade-in" key={currentTip}>
          {TIPS[currentTip]}
        </p>
      </div>
    </div>
  );
};

export default DiagnosticLoading;
