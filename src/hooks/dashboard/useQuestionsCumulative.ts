import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        gridKeys.push(d.toISOString().split("T")[0]);
      }

      const cutoffIso = new Date(
        today.getTime() - (days - 1) * 86400000,
      ).toISOString();

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
        const key = r.created_at.split("T")[0];
        perDay.set(key, (perDay.get(key) ?? 0) + 1);
      }

      let acc = 0;
      return gridKeys.map((k) => {
        acc += perDay.get(k) ?? 0;
        return acc;
      });
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
