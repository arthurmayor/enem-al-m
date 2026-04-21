import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ExamsPeriod = "week" | "month" | "6m" | "all";
export type ExamsType = "all" | "mock" | "fuvest";

export interface ExamPoint {
  date: string;
  pctAcerto: number;
}

const DAYS: Record<ExamsPeriod, number> = {
  week: 7,
  month: 30,
  "6m": 180,
  all: 99999,
};

export function useExamsEvolution(period: ExamsPeriod, type: ExamsType) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<ExamPoint[]>({
    queryKey: ["dashboard-exams", userId, period, type],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const days = DAYS[period];
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();

      let query = supabase
        .from("exam_results")
        .select("created_at, score_percent, exam_type")
        .eq("user_id", userId)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true });

      // `exam_type` is a free-form text column; case variations ("Fuvest",
      // "FUVEST", "fuvest-2026") exist in practice. `.ilike` without
      // wildcards does a case-insensitive exact match so the filter
      // doesn't silently return zero rows.
      if (type === "mock") query = query.ilike("exam_type", "mock");
      if (type === "fuvest") query = query.ilike("exam_type", "fuvest");

      const { data, error } = await query;

      if (error || !data) return [];

      return data.map((r) => ({
        date: r.created_at
          ? new Date(r.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
            })
          : "",
        pctAcerto: Number(r.score_percent ?? 0),
      }));
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
