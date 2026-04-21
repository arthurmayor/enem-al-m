import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Per-day accuracy percentage over the last `days` calendar days (oldest
 * first). Always returns exactly `days` entries — one per day in the
 * D-(days-1)…D0 window — using `null` for days with no activity so the
 * sparkline reflects the real timeline with proper gaps instead of
 * collapsing distant days onto each other.
 */
export function useAccuracyTrend(days = 7) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<(number | null)[]>({
    queryKey: ["dashboard-accuracy-trend", userId, days],
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
        .select("is_correct, created_at")
        .eq("user_id", userId)
        .gte("created_at", cutoffIso)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const buckets = new Map<string, { total: number; correct: number }>();
      for (const r of data ?? []) {
        if (!r.created_at) continue;
        const key = r.created_at.split("T")[0];
        const cur = buckets.get(key) ?? { total: 0, correct: 0 };
        cur.total += 1;
        if (r.is_correct) cur.correct += 1;
        buckets.set(key, cur);
      }

      return gridKeys.map((k) => {
        const b = buckets.get(k);
        if (!b || b.total === 0) return null;
        return Math.round((b.correct / b.total) * 100);
      });
    },
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 30_000,
  });
}
