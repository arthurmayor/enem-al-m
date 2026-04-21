import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ProficiencyPeriod = "all" | "week" | "month" | "6m";

export interface SubjectProficiency {
  subject: string;
  score: number;
  delta: number | null;
}

const DAYS_BACK: Record<Exclude<ProficiencyPeriod, "all">, number> = {
  week: 7,
  month: 30,
  "6m": 180,
};

export function useProficiencyBySubject(period: ProficiencyPeriod) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<SubjectProficiency[]>({
    queryKey: ["dashboard-proficiency", userId, period],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data: rows, error } = await supabase
        .from("proficiency_scores")
        .select("subject, subtopic, score, measured_at")
        .eq("user_id", userId)
        .order("measured_at", { ascending: false });

      if (error) throw error;
      if (!rows || rows.length === 0) return [];

      // Mais recente por (subject, subtopic) para o score atual
      const latestBySubtopic = new Map<
        string,
        { subject: string; score: number; date: string | null }
      >();
      for (const r of rows) {
        if (r.score == null || !r.measured_at) continue;
        const key = `${r.subject}::${r.subtopic}`;
        if (!latestBySubtopic.has(key)) {
          latestBySubtopic.set(key, {
            subject: r.subject,
            score: Number(r.score),
            date: r.measured_at,
          });
        }
      }

      const bySubject = new Map<string, number[]>();
      for (const v of latestBySubtopic.values()) {
        if (!bySubject.has(v.subject)) bySubject.set(v.subject, []);
        bySubject.get(v.subject)!.push(v.score);
      }

      const currentAvg = new Map<string, number>();
      for (const [subj, scores] of bySubject) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        currentAvg.set(subj, avg);
      }

      const daysBack = period === "all" ? null : DAYS_BACK[period];

      const results: SubjectProficiency[] = Array.from(currentAvg.entries()).map(
        ([subject, score]) => {
          let delta: number | null = null;

          if (daysBack) {
            const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();
            const oldRows = rows.filter(
              (r) =>
                r.subject === subject &&
                r.score != null &&
                r.measured_at != null &&
                r.measured_at < cutoff,
            );
            if (oldRows.length > 0) {
              const oldBySubtopic = new Map<string, number>();
              for (const r of oldRows) {
                if (!oldBySubtopic.has(r.subtopic)) {
                  oldBySubtopic.set(r.subtopic, Number(r.score));
                }
              }
              const oldAvg =
                Array.from(oldBySubtopic.values()).reduce((a, b) => a + b, 0) /
                oldBySubtopic.size;
              delta = Math.round((score - oldAvg) * 100);
            }
          }

          return {
            subject,
            score: Math.round(score * 100),
            delta,
          };
        },
      );

      return results.sort((a, b) => a.score - b.score);
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
