import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AccuracyPeriod = "week" | "month" | "year" | "all";

function daysForPeriod(period: AccuracyPeriod): number {
  switch (period) {
    case "week":
      return 7;
    case "month":
      return 30;
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
  return useQuery<AccuracyResult>({
    queryKey: ["dashboard-accuracy", period],
    queryFn: async () => {
      const days = daysForPeriod(period);
      const now = Date.now();

      const currentCutoff = period === "all"
        ? "1970-01-01T00:00:00Z"
        : new Date(now - days * 86400000).toISOString();

      const { data: current, error: currentErr } = await supabase
        .from("answer_history")
        .select("is_correct")
        .gte("created_at", currentCutoff);

      if (currentErr) throw currentErr;

      const cTotal = current?.length ?? 0;
      const cCorrect = current?.filter((a) => a.is_correct).length ?? 0;
      const currentPct = cTotal > 0 ? Math.round((cCorrect / cTotal) * 100) : null;

      if (period === "all" || cTotal === 0) {
        return { current: currentPct, delta: null };
      }

      const prevStart = new Date(now - days * 2 * 86400000).toISOString();
      const prevEnd = currentCutoff;

      const { data: prev } = await supabase
        .from("answer_history")
        .select("is_correct")
        .gte("created_at", prevStart)
        .lt("created_at", prevEnd);

      const pTotal = prev?.length ?? 0;
      const pCorrect = prev?.filter((a) => a.is_correct).length ?? 0;
      const prevPct = pTotal > 0 ? Math.round((pCorrect / pTotal) * 100) : null;

      const delta =
        currentPct != null && prevPct != null ? currentPct - prevPct : null;

      return { current: currentPct, delta };
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
