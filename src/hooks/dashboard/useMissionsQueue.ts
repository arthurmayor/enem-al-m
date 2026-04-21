import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MISSION_STATUSES } from "@/lib/constants";

export interface QueuedMission {
  id: string;
  subject: string;
  subtopic: string | null;
  mission_type: string;
  status: string;
  score: number | null;
  mission_order: number | null;
  question_ids: string[] | null;
  date: string;
  isOverdue: boolean;
  isToday: boolean;
}

/**
 * "Suas Missões" queue: all pending / in_progress missions whose date is
 * today or earlier, ordered by date ascending (oldest first). Missions
 * before today are flagged as overdue so the UI can badge them.
 */
export function useMissionsQueue() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<QueuedMission[]>({
    queryKey: ["dashboard-missions-queue", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("daily_missions")
        .select(
          "id, subject, subtopic, mission_type, status, score, mission_order, question_ids, date",
        )
        .eq("user_id", userId)
        .lte("date", today)
        .in("status", [MISSION_STATUSES.PENDING, MISSION_STATUSES.IN_PROGRESS])
        .order("date", { ascending: true })
        .order("mission_order", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((m) => ({
        ...m,
        date: m.date,
        isOverdue: m.date < today,
        isToday: m.date === today,
      })) as QueuedMission[];
    },
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}
