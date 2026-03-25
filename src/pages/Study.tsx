import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { MISSION_STATUSES } from "@/lib/constants";
import MissionCard from "@/components/MissionCard";
import EmptyState from "@/components/ui/EmptyState";

// ─── Types ──────────────────────────────────────────────────────

interface Mission {
  id: string;
  subject: string;
  subtopic: string | null;
  mission_type: string;
  status: string;
  date: string;
  estimated_minutes: number | null;
  score: number | null;
}

// ─── Date helpers (America/Sao_Paulo) ───────────────────────────

function getSaoPauloTodayStr(): string {
  const now = new Date();
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function getSaoPauloTomorrowStr(): string {
  const today = new Date(getSaoPauloTodayStr() + "T12:00:00");
  today.setDate(today.getDate() + 1);
  return today.toISOString().split("T")[0];
}

function formatDateHeader(dateStr: string): string {
  const todayStr = getSaoPauloTodayStr();
  const tomorrowStr = getSaoPauloTomorrowStr();
  const d = new Date(dateStr + "T12:00:00");
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "short" });
  const dayMonth = d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  if (dateStr === todayStr) return `HOJE · ${weekday}, ${dayMonth}`;
  if (dateStr === tomorrowStr) return `AMANHÃ · ${weekday}, ${dayMonth}`;
  return `${weekday}, ${dayMonth}`;
}

// ─── Study Page ─────────────────────────────────────────────────

const Study = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusParam = searchParams.get("focus");

  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | typeof MISSION_STATUSES.PENDING | typeof MISSION_STATUSES.COMPLETED>("all");

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      // 1. Active plan for date range
      const { data: activePlan } = await supabase
        .from("study_plans")
        .select("id, start_date, end_date")
        .eq("user_id", user.id)
        .eq("is_current", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const startDate = (activePlan as any)?.start_date || new Date().toISOString().split("T")[0];
      const endDate = (activePlan as any)?.end_date || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

      // 2. Fetch missions
      const { data: missionRes } = await supabase
        .from("daily_missions")
        .select("id, subject, subtopic, mission_type, status, date, estimated_minutes, score")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (missionRes) setMissions(missionRes as Mission[]);
      setLoading(false);
    };
    fetchAll();
  }, [user]);

  const todayStr = getSaoPauloTodayStr();

  // ─── Filtering ────────────────────────────────────────────
  const filtered = useMemo(() => {
    return missions.filter((m) => {
      if (m.status === MISSION_STATUSES.SUPERSEDED) return false;
      if (filter === MISSION_STATUSES.PENDING) return m.status !== MISSION_STATUSES.COMPLETED;
      if (filter === MISSION_STATUSES.COMPLETED) return m.status === MISSION_STATUSES.COMPLETED;
      return true;
    });
  }, [missions, filter]);

  const totalAll = missions.filter(m => m.status !== MISSION_STATUSES.SUPERSEDED).length;
  const totalDone = missions.filter(m => m.status === MISSION_STATUSES.COMPLETED).length;

  // ─── Group by date ─────────────────────────────────────────
  const missionsByDate = useMemo(() => {
    const grouped: Record<string, Mission[]> = {};
    for (const m of filtered) {
      const key = m.date;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // ─── Today complete banner ─────────────────────────────────
  const todayMissions = missions.filter(
    m => m.date === todayStr && m.status !== MISSION_STATUSES.SUPERSEDED
  );
  const todayAllDone = todayMissions.length > 0 &&
    todayMissions.every(m => m.status === MISSION_STATUSES.COMPLETED);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-ink-strong border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-app pb-24 md:pb-0">
      {/* ─── Header ─── */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-ink-strong">Estudar</h1>
          {totalAll > 0 && (
            <p className="text-sm text-ink-soft">{totalDone}/{totalAll} feitas</p>
          )}
        </div>

        {/* Segmented filter */}
        <div className="bg-bg-app rounded-lg p-1 inline-flex gap-1 border border-line-light">
          {(["all", MISSION_STATUSES.PENDING, MISSION_STATUSES.COMPLETED] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                filter === f
                  ? "bg-white shadow-card text-ink-strong font-medium"
                  : "text-ink-soft hover:text-ink-strong"
              }`}
            >
              {f === "all" ? "Todas" : f === MISSION_STATUSES.PENDING ? "Pendentes" : "Concluídas"}
            </button>
          ))}
        </div>
      </header>

      {/* ─── Today complete banner ─── */}
      {todayAllDone && (
        <div className="bg-signal-ok/10 border border-signal-ok/20 rounded-card p-4 mb-6 animate-fade-in">
          <p className="text-sm font-medium text-signal-ok">✅ Sessão do dia concluída</p>
        </div>
      )}

      {/* ─── Empty state: no missions ─── */}
      {totalAll === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Seu plano ainda não foi gerado."
          description="Faça o diagnóstico para montar seu plano personalizado."
          actionLabel="Ir para Dashboard"
          onAction={() => navigate("/dashboard")}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nenhuma missão encontrada"
          description="Tente outro filtro."
        />
      ) : (
        /* ─── Sections by date ─── */
        <div className="space-y-8 animate-fade-in">
          {missionsByDate.map(([date, dayMissions]) => {
            const doneCount = dayMissions.filter(m => m.status === MISSION_STATUSES.COMPLETED).length;
            const allCompleted = doneCount === dayMissions.length;
            const anyInProgress = dayMissions.some(m => m.status === MISSION_STATUSES.IN_PROGRESS);

            return (
              <section key={date}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                    {formatDateHeader(date)}
                  </h2>
                  <span className="text-xs text-ink-muted">{doneCount}/{dayMissions.length}</span>
                  {allCompleted ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-signal-ok/10 text-signal-ok">
                      ✅ COMPLETO
                    </span>
                  ) : anyInProgress ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-100 text-brand-500">
                      🔄 EM ANDAMENTO
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-app text-ink-soft">
                      ⏳ PENDENTE
                    </span>
                  )}
                </div>

                {/* Mission grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {dayMissions.map((mission) => (
                    <MissionCard key={mission.id} mission={mission} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Study;
