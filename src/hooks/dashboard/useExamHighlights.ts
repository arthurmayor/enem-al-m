import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ExamHighlight {
  exam_name: string;
  score_percent: number;
  created_at: string;
}

export interface ExamHighlights {
  best: ExamHighlight | null;
  latest: ExamHighlight | null;
}

/**
 * Returns the single best-scoring and most-recent exam for the current
 * user, including the exam name and timestamp — used to label the
 * "Melhor nota" tile ("Mini 02 · 14 abr").
 */
export function useExamHighlights() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<ExamHighlights>({
    queryKey: ["dashboard-exam-highlights", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return { best: null, latest: null };
      const [bestRes, latestRes] = await Promise.all([
        supabase
          .from("exam_results")
          .select("exam_name, score_percent, created_at")
          .eq("user_id", userId)
          // Tiebreaker: when two exams share the best score, we credit the
          // one the user achieved FIRST — not the most recent repeat.
          .order("score_percent", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("exam_results")
          .select("exam_name, score_percent, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (bestRes.error) throw bestRes.error;
      if (latestRes.error) throw latestRes.error;
      return {
        best: bestRes.data as ExamHighlight | null,
        latest: latestRes.data as ExamHighlight | null,
      };
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
