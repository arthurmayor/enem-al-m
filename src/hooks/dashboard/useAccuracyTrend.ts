import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns one accuracy percentage per day for the last N days (oldest
 * first). Days with no answers produce a null, which the sparkline
 * consumer can drop.
 */
export function useAccuracyTrend(days = 7) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<number[]>({
    queryKey: ["dashboard-accuracy-trend", userId, days],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase
        .from("answer_history")
        .select("is_correct, created_at")
        .eq("user_id", userId)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const buckets = new Map<string, { total: number; correct: number }>();
      for (const r of data) {
        if (!r.created_at) continue;
        const key = r.created_at.split("T")[0];
        const cur = buckets.get(key) ?? { total: 0, correct: 0 };
        cur.total += 1;
        if (r.is_correct) cur.correct += 1;
        buckets.set(key, cur);
      }

      return Array.from(buckets.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([, v]) => Math.round((v.correct / Math.max(1, v.total)) * 100));
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
