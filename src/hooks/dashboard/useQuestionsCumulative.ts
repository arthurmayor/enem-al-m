import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Cumulative count of questions answered per day for the last N days,
 * oldest first. Used as the "Questões Respondidas" sparkline.
 */
export function useQuestionsCumulative(days = 7) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<number[]>({
    queryKey: ["dashboard-questions-cumulative", userId, days],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase
        .from("answer_history")
        .select("created_at")
        .eq("user_id", userId)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const perDay = new Map<string, number>();
      for (const r of data) {
        if (!r.created_at) continue;
        const key = r.created_at.split("T")[0];
        perDay.set(key, (perDay.get(key) ?? 0) + 1);
      }

      const ordered = Array.from(perDay.entries()).sort(([a], [b]) =>
        a < b ? -1 : 1,
      );
      let acc = 0;
      return ordered.map(([, count]) => (acc += count));
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
