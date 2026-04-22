import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { buildMissionActivity } from "@/lib/dashboardActivity";
import { getSaoPauloDateRange } from "@/lib/date";

/**
 * Cumulative count of questions answered per day, oldest first, over
 * exactly `days` calendar days (D-(days-1)…D0). Days with no activity
 * repeat the previous day's total so the sparkline stays flat on idle
 * days instead of skipping them.
 */
export function useQuestionsCumulative(days = 7) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<number[]>({
    queryKey: ["dashboard-questions-cumulative", userId, days],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const gridKeys: string[] = [];
      const { todayKey, startKey } = getSaoPauloDateRange(days);
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        gridKeys.push(
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(d),
        );
      }

      const cutoffIso = new Date(`${startKey}T00:00:00-03:00`).toISOString();

      const { data, error } = await supabase
        .from("answer_history")
        .select("created_at")
        .eq("user_id", userId)
        .gte("created_at", cutoffIso)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const perDay = new Map<string, number>();
      for (const r of data ?? []) {
        if (!r.created_at) continue;
        const key = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(r.created_at));
        perDay.set(key, (perDay.get(key) ?? 0) + 1);
      }

      if ((data ?? []).length === 0) {
        const { data: missionRows, error: missionError } = await supabase
          .from("daily_missions")
          .select("date, mission_type, status, score, question_ids, subject, subtopic")
          .eq("user_id", userId)
          .gte("date", startKey)
          .lte("date", todayKey);
        if (missionError) throw missionError;

        for (const row of buildMissionActivity(missionRows ?? [])) {
          perDay.set(row.date, (perDay.get(row.date) ?? 0) + row.questionCount);
        }
      }

      let acc = 0;
      return gridKeys.map((k) => {
        acc += perDay.get(k) ?? 0;
        return acc;
      });
    },
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 30_000,
  });
}
