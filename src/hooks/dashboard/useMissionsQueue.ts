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

export interface MissionsQueue {
  /** All of today's missions (any status except superseded), ordered. */
  todayMissions: QueuedMission[];
  /** Past-date missions still pending/in_progress, ordered oldest first. */
  overdueMissions: QueuedMission[];
  /** Overdue + today's not-completed, in the order they should be attempted. */
  activeQueue: QueuedMission[];
  todayTotal: number;
  todayCompleted: number;
}

const EMPTY: MissionsQueue = {
  todayMissions: [],
  overdueMissions: [],
  activeQueue: [],
  todayTotal: 0,
  todayCompleted: 0,
};

const COLS =
  "id, subject, subtopic, mission_type, status, score, mission_order, question_ids, date";

/**
 * Single source of truth for the dashboard's mission data. Returns today's
 * missions (including completed ones, so the hero ring can render a real
 * progress fraction) plus any overdue non-completed missions, and the
 * combined active queue in attack order.
 */
export function useMissionsQueue() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<MissionsQueue>({
    queryKey: ["dashboard-missions-queue", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return EMPTY;
      const today = new Date().toISOString().split("T")[0];

      const [todayRes, overdueRes] = await Promise.all([
        supabase
          .from("daily_missions")
          .select(COLS)
          .eq("user_id", userId)
          .eq("date", today)
          .not("status", "eq", MISSION_STATUSES.SUPERSEDED)
          .order("mission_order", { ascending: true }),
        supabase
          .from("daily_missions")
          .select(COLS)
          .eq("user_id", userId)
          .lt("date", today)
          .in("status", [
            MISSION_STATUSES.PENDING,
            MISSION_STATUSES.IN_PROGRESS,
          ])
          .order("date", { ascending: true })
          .order("mission_order", { ascending: true }),
      ]);

      if (todayRes.error) throw todayRes.error;
      if (overdueRes.error) throw overdueRes.error;

      const todayMissions: QueuedMission[] = (todayRes.data ?? []).map(
        (m) => ({ ...m, isOverdue: false, isToday: true }),
      );
      const overdueMissions: QueuedMission[] = (overdueRes.data ?? []).map(
        (m) => ({ ...m, isOverdue: true, isToday: false }),
      );

      const todayActive = todayMissions.filter(
        (m) => m.status !== MISSION_STATUSES.COMPLETED,
      );
      const activeQueue = [...overdueMissions, ...todayActive];
      const todayCompleted = todayMissions.filter(
        (m) => m.status === MISSION_STATUSES.COMPLETED,
      ).length;

      return {
        todayMissions,
        overdueMissions,
        activeQueue,
        todayTotal: todayMissions.length,
        todayCompleted,
      };
    },
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}
