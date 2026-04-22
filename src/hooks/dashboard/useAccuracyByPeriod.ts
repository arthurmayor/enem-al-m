import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { buildMissionActivity } from "@/lib/dashboardActivity";
import { getSaoPauloDateRange } from "@/lib/date";

export type AccuracyPeriod = "week" | "month" | "6m" | "year" | "all";

function daysForPeriod(period: AccuracyPeriod): number {
  switch (period) {
    case "week":
      return 7;
    case "month":
      return 30;
    case "6m":
      return 180;
    case "year":
      return 365;
    default:
      return 99999;
  }
}

export interface AccuracyResult {
  current: number | null;
  delta: number | null;
}

export function useAccuracyByPeriod(period: AccuracyPeriod) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<AccuracyResult>({
    queryKey: ["dashboard-accuracy", userId, period],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return { current: null, delta: null };
      const days = daysForPeriod(period);
      const now = Date.now();
      const { startKey: missionCurrentCutoff } = getSaoPauloDateRange(days);

      const currentCutoff = period === "all"
        ? "1970-01-01T00:00:00Z"
        : new Date(now - days * 86400000).toISOString();

      const { data: current, error: currentErr } = await supabase
        .from("answer_history")
        .select("is_correct")
        .eq("user_id", userId)
        .gte("created_at", currentCutoff);

      if (currentErr) throw currentErr;

      const cTotal = current?.length ?? 0;
      const cCorrect = current?.filter((a) => a.is_correct).length ?? 0;
      let currentPct = cTotal > 0 ? Math.round((cCorrect / cTotal) * 100) : null;

      if (currentPct == null) {
        const { data: missionRows, error: missionError } = await supabase
          .from("daily_missions")
          .select("date, mission_type, status, score, question_ids, subject, subtopic")
          .eq("user_id", userId)
          .gte("date", period === "all" ? "1970-01-01" : missionCurrentCutoff);

        if (missionError) throw missionError;
        const activity = buildMissionActivity(missionRows ?? []);
        const total = activity.reduce((sum, row) => sum + row.questionCount, 0);
        const correct = activity.reduce((sum, row) => sum + row.correctCount, 0);
        currentPct = total > 0 ? Math.round((correct / total) * 100) : null;
      }

      if (period === "all" || cTotal === 0) {
        return { current: currentPct, delta: null };
      }

      const prevStart = new Date(now - days * 2 * 86400000).toISOString();
      const prevEnd = currentCutoff;

      const { data: prev } = await supabase
        .from("answer_history")
        .select("is_correct")
        .eq("user_id", userId)
        .gte("created_at", prevStart)
        .lt("created_at", prevEnd);

      const pTotal = prev?.length ?? 0;
      const pCorrect = prev?.filter((a) => a.is_correct).length ?? 0;
      let prevPct = pTotal > 0 ? Math.round((pCorrect / pTotal) * 100) : null;

      if (prevPct == null) {
        const prevMissionStart = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(now - days * 2 * 86400000));

        const { data: prevMissionRows, error: prevMissionError } = await supabase
          .from("daily_missions")
          .select("date, mission_type, status, score, question_ids, subject, subtopic")
          .eq("user_id", userId)
          .gte("date", prevMissionStart)
          .lt("date", missionCurrentCutoff);

        if (prevMissionError) throw prevMissionError;
        const prevActivity = buildMissionActivity(prevMissionRows ?? []);
        const total = prevActivity.reduce((sum, row) => sum + row.questionCount, 0);
        const correct = prevActivity.reduce((sum, row) => sum + row.correctCount, 0);
        prevPct = total > 0 ? Math.round((correct / total) * 100) : null;
      }

      const delta =
        currentPct != null && prevPct != null ? currentPct - prevPct : null;

      return { current: currentPct, delta };
    },
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 30_000,
  });
}
