import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { buildMissionActivity, isQuestionMissionType } from "@/lib/dashboardActivity";

export interface DashboardMetrics {
  user_id: string | null;
  name: string | null;
  current_streak: number;
  total_xp: number;
  exam_name: string | null;
  course_name: string | null;
  exam_date: string | null;
  days_until_exam: number | null;
  missions_today_total: number;
  missions_today_completed: number;
  total_missions_generated: number;
  total_missions_completed: number;
  total_questions: number;
  total_correct: number;
  total_exams: number;
  best_exam_score: number | null;
  last_exam_score: number | null;
}

export function useDashboardMetrics() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<DashboardMetrics | null>({
    // userId must be in the key — the RPC uses auth.uid() so the cached
    // payload is user-specific. Without this, a second account on the
    // same tab would serve stale data from the first account.
    queryKey: ["dashboard-metrics", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;

      const [
        profileRes,
        answersRes,
        missionsRes,
        examsRes,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, current_streak, total_xp, exam_config_id, exam_date")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("answer_history")
          .select("is_correct")
          .eq("user_id", userId),
        supabase
          .from("daily_missions")
          .select("date, mission_type, status, score, question_ids, subject, subtopic")
          .eq("user_id", userId)
          .neq("status", "superseded"),
        supabase
          .from("exam_results")
          .select("exam_name, score_percent, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (answersRes.error) throw answersRes.error;
      if (missionsRes.error) throw missionsRes.error;
      if (examsRes.error) throw examsRes.error;

      const profile = profileRes.data;
      if (!profile) return null;

      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      const missionRows = missionsRes.data ?? [];
      const missionActivity = buildMissionActivity(missionRows);
      const answerRows = answersRes.data ?? [];

      const totalQuestionsFromAnswers = answerRows.length;
      const totalCorrectFromAnswers = answerRows.filter((row) => row.is_correct).length;
      const totalQuestionsFromMissions = missionActivity.reduce(
        (sum, row) => sum + row.questionCount,
        0,
      );
      const totalCorrectFromMissions = missionActivity.reduce(
        (sum, row) => sum + row.correctCount,
        0,
      );

      const totalQuestions =
        totalQuestionsFromAnswers > 0 ? totalQuestionsFromAnswers : totalQuestionsFromMissions;
      const totalCorrect =
        totalQuestionsFromAnswers > 0 ? totalCorrectFromAnswers : totalCorrectFromMissions;

      const exams = examsRes.data ?? [];
      const examConfigId = profile.exam_config_id;

      let exam_name: string | null = null;
      let course_name: string | null = null;
      if (examConfigId) {
        const { data: examConfig, error: examConfigError } = await supabase
          .from("exam_configs")
          .select("exam_name, course_name")
          .eq("id", examConfigId)
          .maybeSingle();

        if (examConfigError) throw examConfigError;
        exam_name = examConfig?.exam_name ?? null;
        course_name = examConfig?.course_name ?? null;
      }

      const examDate = profile.exam_date ?? null;
      const days_until_exam = examDate
        ? Math.max(
            0,
            Math.ceil(
              (new Date(`${examDate}T12:00:00`).getTime() -
                new Date(`${today}T12:00:00`).getTime()) /
                86400000,
            ),
          )
        : null;

      const todayMissions = missionRows.filter((row) => row.date === today && row.status !== "superseded");
      const missionsTodayTotal = todayMissions.length;
      const missionsTodayCompleted = todayMissions.filter(
        (row) => row.status === "completed",
      ).length;

      const completedMissions = missionRows.filter((row) => row.status === "completed");
      const totalMissionsCompleted = completedMissions.length;
      const totalMissionsGenerated = missionRows.length;
      const practiceMissionsCompleted = completedMissions.filter((row) =>
        isQuestionMissionType(row.mission_type),
      ).length;

      const bestExamScore = exams.length
        ? Math.max(...exams.map((exam) => Number(exam.score_percent ?? 0)))
        : null;
      const lastExamScore = exams.length ? Number(exams[0].score_percent ?? 0) : null;

      return {
        user_id: profile.id,
        name: profile.name,
        current_streak: profile.current_streak ?? 0,
        total_xp: profile.total_xp ?? 0,
        exam_name,
        course_name,
        exam_date: examDate,
        days_until_exam,
        missions_today_total: missionsTodayTotal,
        missions_today_completed: missionsTodayCompleted,
        total_missions_generated: totalMissionsGenerated,
        total_missions_completed: totalMissionsCompleted,
        total_questions: totalQuestions,
        total_correct: totalCorrect,
        total_exams: exams.length,
        best_exam_score: bestExamScore,
        last_exam_score: lastExamScore,
      } as DashboardMetrics & { total_practice_missions_completed?: number };
    },
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 30_000,
  });
}
