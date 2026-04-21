import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("get_dashboard_metrics");
      if (error) throw error;
      return (data ?? null) as DashboardMetrics | null;
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
