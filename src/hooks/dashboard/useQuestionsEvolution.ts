import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { buildMissionActivity } from "@/lib/dashboardActivity";
import { getSaoPauloDateRange } from "@/lib/date";

export type EvolutionPeriod = "week" | "month" | "6m" | "year" | "all";

export interface EvolutionPoint {
  label: string;
  count: number;
}

const DAYS: Record<EvolutionPeriod, number> = {
  week: 7,
  month: 30,
  "6m": 180,
  year: 365,
  all: 99999,
};

interface Row {
  created_at: string | null;
  questions: { subject: string | null } | null;
}

export function useQuestionsEvolution(
  period: EvolutionPeriod,
  subject: string | null,
) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<EvolutionPoint[]>({
    queryKey: ["dashboard-evolution", userId, period, subject ?? "all"],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const days = DAYS[period];
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const { startKey } = getSaoPauloDateRange(days);

      // Note: answer_history has no direct `subject` column. `subject` lives
      // on the joined questions table (same pattern used in Performance.tsx).
      const { data, error } = await supabase
        .from("answer_history")
        .select("created_at, questions!inner(subject)")
        .eq("user_id", userId)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if ((!data || data.length === 0)) {
        const { data: missionRows, error: missionError } = await supabase
          .from("daily_missions")
          .select("date, mission_type, status, score, question_ids, subject, subtopic")
          .eq("user_id", userId)
          .gte("date", startKey);

        if (missionError) throw missionError;
        const fallbackRows = buildMissionActivity(missionRows ?? []).filter(
          (row) => !subject || subject === "Geral" || row.subject === subject,
        );
        return fallbackRows.map((row) => ({
          label: new Date(`${row.date}T12:00:00`).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: period === "week" ? "2-digit" : "short",
          }).replace(".", ""),
          count: row.questionCount,
        }));
      }

      let rows = data as unknown as Row[];
      if (subject && subject !== "Geral") {
        rows = rows.filter((r) => r.questions?.subject === subject);
      }

      // Bucket granularity changes with the period and this is intentional:
      //   - "week"  → one bucket per DAY (7 points, labels like "14/04")
      //   - "month", "6m", "year", "all" → one bucket per ISO-WEEK
      //       (labels like "14 abr", one per Monday)
      // The Segmented Control labels ("Semana", "Mês", …) therefore imply
      // different X-axis granularity. If product wants identical step size
      // across periods, uniformize here.
      const useDayBucket = period === "week";
      const buckets = new Map<string, { key: string; count: number; sort: number }>();

      for (const r of rows) {
        if (!r.created_at) continue;
        const d = new Date(r.created_at);
        let key: string;
        let sortKey: number;
        if (useDayBucket) {
          key = d.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
          });
          sortKey = d.setHours(0, 0, 0, 0);
        } else {
          const monday = new Date(d);
          monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
          monday.setHours(0, 0, 0, 0);
          key = monday.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          });
          sortKey = monday.getTime();
        }
        const cur = buckets.get(key);
        if (cur) {
          cur.count += 1;
        } else {
          buckets.set(key, { key, count: 1, sort: sortKey });
        }
      }

      return Array.from(buckets.values())
        .sort((a, b) => a.sort - b.sort)
        .map((b) => ({ label: b.key, count: b.count }));
    },
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 30_000,
  });
}
