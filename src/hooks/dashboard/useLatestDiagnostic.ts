import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface LatestDiagnostic {
  probability: number;
  probability_band: string;
  probability_label: string;
  estimated_score: number;
  total_questions: number;
  created_at: string;
}

/**
 * Latest `diagnostic_results` row for the current user. Used as the
 * initial approval probability until enough practice data accumulates.
 */
export function useLatestDiagnostic() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<LatestDiagnostic | null>({
    queryKey: ["dashboard-latest-diagnostic", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("diagnostic_results")
        .select(
          "probability, probability_band, probability_label, estimated_score, total_questions, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as LatestDiagnostic | null) ?? null;
    },
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
}
