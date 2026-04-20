import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MISSION_STATUSES } from "@/lib/constants";

export interface TodayMission {
  id: string;
  subject: string;
  subtopic: string | null;
  mission_type: string;
  status: string;
  score: number | null;
  mission_order: number | null;
  question_ids: string[] | null;
}

export function useTodayMissions() {
  return useQuery<TodayMission[]>({
    queryKey: ["dashboard-today-missions"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("daily_missions")
        .select(
          "id, subject, subtopic, mission_type, status, score, mission_order, question_ids",
        )
        .eq("date", today)
        .not("status", "eq", MISSION_STATUSES.SUPERSEDED)
        .order("mission_order", { ascending: true });

      if (error) throw error;
      return (data ?? []) as TodayMission[];
    },
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}
