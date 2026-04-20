import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Subtopic {
  subtopic: string;
  score: number;
}

export function useProficiencySubtopics(subject: string | null) {
  return useQuery<Subtopic[]>({
    queryKey: ["dashboard-subtopics", subject],
    enabled: !!subject,
    queryFn: async () => {
      if (!subject) return [];

      const { data, error } = await supabase
        .from("proficiency_scores")
        .select("subtopic, score, measured_at")
        .eq("subject", subject)
        .order("measured_at", { ascending: false });

      if (error) throw error;

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
    staleTime: 30_000,
  });
}
