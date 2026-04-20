import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  return useQuery<DashboardMetrics | null>({
    queryKey: ["dashboard-metrics"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_dashboard_metrics");
      if (error) throw error;
      return (data ?? null) as DashboardMetrics | null;
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
