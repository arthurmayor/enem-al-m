import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { summarizeMissionActivityBySubtopic } from "@/lib/dashboardActivity";

export interface Subtopic {
  subtopic: string;
  score: number;
}

export function useProficiencySubtopics(subject: string | null) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<Subtopic[]>({
    queryKey: ["dashboard-subtopics", userId, subject],
    enabled: !!subject && !!userId,
    queryFn: async () => {
      if (!subject || !userId) return [];

      const { data: answers, error: answersError } = await supabase
        .from("answer_history")
        .select("is_correct, question_id, questions!inner(subject, subtopic)")
        .eq("user_id", userId);

      if (answersError) throw answersError;

      const answerRows = (answers ?? []) as Array<{
        is_correct: boolean;
        questions: { subject: string | null; subtopic: string | null } | null;
      }>;

      if (answerRows.length > 0) {
        const grouped = new Map<string, { total: number; correct: number }>();

        for (const row of answerRows) {
          if (row.questions?.subject !== subject) continue;
          const subtopic = row.questions?.subtopic?.trim() || subject;
          const current = grouped.get(subtopic) ?? { total: 0, correct: 0 };
          current.total += 1;
          if (row.is_correct) current.correct += 1;
          grouped.set(subtopic, current);
        }

        return Array.from(grouped.entries())
          .map(([subtopic, value]) => ({
            subtopic,
            score: Math.round((value.correct / value.total) * 100),
          }))
          .sort((a, b) => a.score - b.score);
      }

      const { data, error } = await supabase
        .from("proficiency_scores")
        .select("subtopic, score, measured_at")
        .eq("user_id", userId)
        .eq("subject", subject)
        .order("measured_at", { ascending: false });

      if (error) throw error;

      if ((data ?? []).length <= 2) {
        const { data: missionRows, error: missionError } = await supabase
          .from("daily_missions")
          .select("date, mission_type, status, score, question_ids, subject, subtopic")
          .eq("user_id", userId)
          .eq("subject", subject);

        if (missionError) throw missionError;

        return summarizeMissionActivityBySubtopic(missionRows ?? [], subject)
          .map((item) => ({
            subtopic: item.subtopic ?? subject,
            score: item.accuracyPct ?? 0,
          }))
          .sort((a, b) => a.score - b.score);
      }

      const seen = new Set<string>();
      const result: Subtopic[] = [];
      for (const r of data ?? []) {
        if (r.score == null || seen.has(r.subtopic)) continue;
        seen.add(r.subtopic);
        result.push({
          subtopic: r.subtopic,
          score: Math.round(Number(r.score) * 100),
        });
      }

      return result.sort((a, b) => a.score - b.score);
    },
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 30_000,
  });
}
