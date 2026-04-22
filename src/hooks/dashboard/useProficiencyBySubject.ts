import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { summarizeMissionActivityBySubject } from "@/lib/dashboardActivity";

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
      const daysBack = period === "all" ? null : DAYS_BACK[period];

      const { data: answers, error: answersError } = await supabase
        .from("answer_history")
        .select("is_correct, created_at, questions!inner(subject)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (answersError) throw answersError;

      const answerRows = (answers ?? []) as Array<{
        is_correct: boolean;
        created_at: string | null;
        questions: { subject: string | null } | null;
      }>;

      if (answerRows.length > 0) {
        const currentCutoff =
          daysBack == null ? null : new Date(Date.now() - daysBack * 86400000).toISOString();
        const previousCutoff =
          daysBack == null ? null : new Date(Date.now() - daysBack * 2 * 86400000).toISOString();

        const aggregate = (
          rows: Array<{ is_correct: boolean; created_at: string | null; questions: { subject: string | null } | null }>,
        ) => {
          const acc = new Map<string, { total: number; correct: number }>();
          for (const row of rows) {
            const subject = row.questions?.subject;
            if (!subject) continue;
            const current = acc.get(subject) ?? { total: 0, correct: 0 };
            current.total += 1;
            if (row.is_correct) current.correct += 1;
            acc.set(subject, current);
          }
          return acc;
        };

        const currentRows = currentCutoff
          ? answerRows.filter((row) => row.created_at && row.created_at >= currentCutoff)
          : answerRows;
        const current = aggregate(currentRows);

        const previous =
          currentCutoff && previousCutoff
            ? aggregate(
                answerRows.filter(
                  (row) =>
                    row.created_at != null &&
                    row.created_at >= previousCutoff &&
                    row.created_at < currentCutoff,
                ),
              )
            : new Map<string, { total: number; correct: number }>();

        return Array.from(current.entries())
          .map(([subject, value]) => {
            const score = Math.round((value.correct / value.total) * 100);
            const prev = previous.get(subject);
            const prevScore = prev && prev.total > 0 ? Math.round((prev.correct / prev.total) * 100) : null;
            return {
              subject,
              score,
              delta: prevScore == null ? null : score - prevScore,
            };
          })
          .sort((a, b) => a.score - b.score);
      }

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

      if (rows && rows.length <= 10) {
        const { data: missionRows, error: missionError } = await supabase
          .from("daily_missions")
          .select("date, mission_type, status, score, question_ids, subject, subtopic")
          .eq("user_id", userId);

        if (missionError) throw missionError;

        return summarizeMissionActivityBySubject(missionRows ?? [])
          .map((summary) => ({
            subject: summary.subject,
            score: summary.accuracyPct ?? 0,
            delta: null,
          }))
          .sort((a, b) => a.score - b.score);
      }

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

      if (results.length > 0) {
        return results.sort((a, b) => a.score - b.score);
      }

      return [];
    },
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 30_000,
  });
}
