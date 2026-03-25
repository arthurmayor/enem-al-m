import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, Clock, ChevronRight, ChevronDown, CheckCircle2, ArrowRight, Play, Trophy, RotateCcw, Target } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";

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

interface SubjectProficiency {
  subject: string;
  score: number; // 0–1
  pct: number;   // 0–100
}

interface ExamConfigInfo {
  course_name: string | null;
  phase2_subjects: string[];
  cutoff_mean: number;
}

interface SpacedReviewInfo {
  subject: string;
  subtopic: string;
  interval_days: number;
}

// ─── Label mapper (single source of truth) ──────────────────────

const MISSION_TYPE_LABELS: Record<string, string> = {
  questions: "Questões",
  error_review: "Revisão de erros",
  short_summary: "Resumo",
  spaced_review: "Revisão espaçada",
  mixed_block: "Bloco misto",
  reading_work: "Leitura",
  writing_outline: "Planejamento de redação",
  writing_partial: "Redação parcial",
  writing_full: "Redação completa",
  summary: "Resumo",
  flashcards: "Flashcards",
  review: "Revisão de erros",
};

// ─── Mission rationale (data-aware) ─────────────────────────────

function getMissionRationale(
  m: Mission,
  proficiencies: Record<string, SubjectProficiency>,
  phase2Subjects: string[],
  spacedReviews: SpacedReviewInfo[],
  courseName: string | null,
): string | null {
  const prof = proficiencies[m.subject];
  const isPhase2 = phase2Subjects.includes(m.subject);

  switch (m.mission_type) {
    case "questions":
    case "mixed_block": {
      if (prof && prof.pct < 40) return `Área fraca — ${prof.pct}% de proficiência`;
      if (isPhase2 && courseName) return `Essencial para 2ª fase de ${courseName}`;
      if (isPhase2) return "Essencial para 2ª fase";
      if (prof && prof.pct > 70) return "Manutenção — manter nível";
      if (prof) return `${prof.pct}% de proficiência`;
      return null;
    }
    case "spaced_review": {
      const sr = spacedReviews.find(r => r.subject === m.subject && (m.subtopic ? r.subtopic === m.subtopic : true));
      if (sr) return `Revisão programada — última vez há ${sr.interval_days} dia${sr.interval_days !== 1 ? "s" : ""}`;
      return "Revisão programada";
    }
    case "error_review":
    case "review":
      return "Corrigir erros recentes nesta matéria";
    case "short_summary":
    case "summary":
    case "reading_work":
      return "Reforço teórico — consolidar conceitos";
    case "writing_outline":
    case "writing_partial":
    case "writing_full":
      return "Prática de redação";
    default:
      return null;
  }
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
  if (dateStr === todayStr) return "Hoje";
  if (dateStr === tomorrowStr) return "Amanhã";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Subtopic helper ────────────────────────────────────────────

function showableSubtopic(subtopic: string | null | undefined): string | null {
  if (!subtopic) return null;
  const trimmed = subtopic.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "geral") return null;
  return trimmed;
}

// ─── CompactMissionRow (for weekly agenda) ──────────────────────

const CompactMissionRow = ({ mission }: { mission: Mission }) => {
  const completed = mission.status === "completed";
  const minutes = mission.estimated_minutes ?? 15;
  const typeLabel = MISSION_TYPE_LABELS[mission.mission_type] || mission.mission_type;

  let scoreBadge: { bg: string; text: string } | null = null;
  if (completed && mission.score != null) {
    if (mission.score >= 70) scoreBadge = { bg: "bg-green-500/10", text: "text-green-600" };
    else if (mission.score >= 40) scoreBadge = { bg: "bg-amber-500/10", text: "text-amber-600" };
    else scoreBadge = { bg: "bg-gray-100", text: "text-muted-foreground" };
  }

  return (
    <Link
      to={`/mission/${mission.mission_type}/${mission.id}`}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
        completed ? "opacity-50" : "hover:bg-gray-50"
      }`}
    >
      {completed ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <div className="h-4 w-4 shrink-0 flex items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-gray-300" />
        </div>
      )}
      <span className={`text-sm flex-1 truncate ${completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
        {mission.subject}
      </span>
      <span className="text-[10px] text-muted-foreground shrink-0">{typeLabel}</span>
      {scoreBadge && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${scoreBadge.bg} ${scoreBadge.text}`}>
          {mission.score}%
        </span>
      )}
      <span className="text-[10px] text-muted-foreground shrink-0">{minutes}m</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
    </Link>
  );
};

// ─── PriorityMissionCard (for today's prioritized block) ────────

interface PriorityCardProps {
  mission: Mission;
  rationale: string | null;
  isPrimary: boolean;
  isNextRecommended: boolean;
}

const PriorityMissionCard = ({ mission, rationale, isPrimary, isNextRecommended }: PriorityCardProps) => {
  const completed = mission.status === "completed";
  const minutes = mission.estimated_minutes ?? 15;
  const typeLabel = MISSION_TYPE_LABELS[mission.mission_type] || mission.mission_type;
  const visibleSubtopic = showableSubtopic(mission.subtopic);

  let scoreBadge: { bg: string; text: string } | null = null;
  if (completed && mission.score != null) {
    if (mission.score >= 70) scoreBadge = { bg: "bg-green-500/10", text: "text-green-600" };
    else if (mission.score >= 40) scoreBadge = { bg: "bg-amber-500/10", text: "text-amber-600" };
    else scoreBadge = { bg: "bg-gray-100", text: "text-muted-foreground" };
  }

  if (completed) {
    return (
      <Link
        to={`/mission/${mission.mission_type}/${mission.id}`}
        className="group flex items-center gap-3 p-3 rounded-xl opacity-50"
      >
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        <span className="text-sm text-muted-foreground line-through truncate flex-1">{mission.subject}</span>
        <span className="text-[10px] text-muted-foreground">{typeLabel}</span>
        {scoreBadge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${scoreBadge.bg} ${scoreBadge.text}`}>
            {mission.score}%
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      to={`/mission/${mission.mission_type}/${mission.id}`}
      className={`group block rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 ${
        isPrimary
          ? "p-4 border-foreground/15 bg-foreground/[0.02] shadow-sm hover:shadow-md ring-1 ring-foreground/5"
          : isNextRecommended
            ? "p-3.5 border-foreground/10 bg-white hover:shadow-sm"
            : "p-3.5 border-gray-100 bg-white hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Rationale tag */}
          {rationale && (
            <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${
              isPrimary ? "text-foreground/50" : "text-muted-foreground/70"
            }`}>
              {rationale}
            </p>
          )}
          {/* Subject */}
          <p className={`font-semibold truncate ${isPrimary ? "text-base text-foreground" : "text-sm text-foreground"}`}>
            {mission.subject}
          </p>
          {/* Type + subtopic */}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-foreground/70 font-medium">
              {typeLabel}
            </span>
            {visibleSubtopic && (
              <span className="text-[11px] text-muted-foreground truncate">{visibleSubtopic}</span>
            )}
          </div>
        </div>

        {/* Right: time + arrow */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{minutes}m</span>
          </div>
          <ChevronRight className={`h-4 w-4 transition-colors ${
            isPrimary ? "text-foreground/40 group-hover:text-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground"
          }`} />
        </div>
      </div>
    </Link>
  );
};

// ─── Study Page ─────────────────────────────────────────────────

const Study = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const focusParam = searchParams.get("focus"); // e.g. ?focus=Matemática

  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const [agendaOpen, setAgendaOpen] = useState(false);

  // Real data for intelligence
  const [proficiencies, setProficiencies] = useState<Record<string, SubjectProficiency>>({});
  const [examConfig, setExamConfig] = useState<ExamConfigInfo | null>(null);
  const [spacedReviews, setSpacedReviews] = useState<SpacedReviewInfo[]>([]);

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

      // 2. Parallel fetches: missions + proficiency + profile + spaced reviews
      const [missionRes, profRes, profileRes, spacedRes] = await Promise.all([
        supabase
          .from("daily_missions")
          .select("id, subject, subtopic, mission_type, status, date, estimated_minutes, score")
          .eq("user_id", user.id)
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date", { ascending: true }),
        supabase
          .from("proficiency_scores")
          .select("subject, score")
          .eq("user_id", user.id)
          .order("measured_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("exam_config_id")
          .eq("id", user.id)
          .single(),
        supabase
          .from("spaced_review_queue")
          .select("subject, subtopic, interval_days")
          .eq("user_id", user.id),
      ]);

      if (missionRes.data) setMissions(missionRes.data as Mission[]);

      // Build per-subject proficiency map (latest score per subject)
      if (profRes.data) {
        const map: Record<string, SubjectProficiency> = {};
        for (const row of profRes.data) {
          if (!map[row.subject]) {
            const score = row.score ?? 0;
            map[row.subject] = { subject: row.subject, score, pct: Math.round(score * 100) };
          }
        }
        setProficiencies(map);
      }

      // Spaced reviews
      if (spacedRes.data) {
        setSpacedReviews(spacedRes.data as SpacedReviewInfo[]);
      }

      // Exam config (course name, phase2_subjects, cutoff)
      const examConfigId = (profileRes.data as any)?.exam_config_id;
      if (examConfigId) {
        const { data: ec } = await supabase
          .from("exam_configs")
          .select("course_name, phase2_subjects, cutoff_mean")
          .eq("id", examConfigId)
          .single();
        if (ec) {
          setExamConfig({
            course_name: (ec as any).course_name || null,
            phase2_subjects: (ec as any).phase2_subjects || [],
            cutoff_mean: (ec as any).cutoff_mean ?? 55,
          });
        }
      }

      setLoading(false);
    };
    fetchAll();
  }, [user]);

  const todayStr = getSaoPauloTodayStr();

  // ─── Determine focus subject (from param, or weakest phase2, or weakest overall) ───
  const focusSubject = useMemo(() => {
    // 1. Query param always wins
    if (focusParam) return focusParam;

    // 2. Weakest subject among phase2_subjects that has a pending mission today
    const todayPendingSubjects = new Set(
      missions.filter(m => (m.date === todayStr || (m.date < todayStr && m.status === "pending")) && m.status !== "completed").map(m => m.subject)
    );
    if (todayPendingSubjects.size === 0) return null;

    const phase2 = examConfig?.phase2_subjects || [];
    if (phase2.length > 0) {
      const phase2Pending = phase2
        .filter(s => todayPendingSubjects.has(s))
        .map(s => ({ subject: s, pct: proficiencies[s]?.pct ?? 50 }))
        .sort((a, b) => a.pct - b.pct);
      if (phase2Pending.length > 0) return phase2Pending[0].subject;
    }

    // 3. Weakest subject overall that has a pending mission today
    const allPending = [...todayPendingSubjects]
      .map(s => ({ subject: s, pct: proficiencies[s]?.pct ?? 50 }))
      .sort((a, b) => a.pct - b.pct);
    return allPending[0]?.subject || null;
  }, [missions, todayStr, focusParam, examConfig, proficiencies]);

  // Does the focus subject have a pending mission today?
  const focusHasMission = useMemo(() => {
    if (!focusSubject) return false;
    return missions.some(m => m.subject === focusSubject && (m.date === todayStr || (m.date < todayStr && m.status === "pending")) && m.status !== "completed");
  }, [missions, todayStr, focusSubject]);

  // ─── Focus reason (real data) ────────────────────────────
  const focusReason = useMemo(() => {
    if (!focusSubject) return "";
    if (focusParam) return "Priorizado pelo seu plano de ataque";
    const prof = proficiencies[focusSubject];
    const isPhase2 = examConfig?.phase2_subjects?.includes(focusSubject);
    if (isPhase2 && examConfig?.course_name) return `Essencial para 2ª fase de ${examConfig.course_name}`;
    if (isPhase2) return "Essencial para 2ª fase";
    if (prof && prof.pct < 40) return `Área mais fraca — ${prof.pct}% de proficiência`;
    if (prof) return `${prof.pct}% de proficiência — maior oportunidade de evolução`;
    return "Maior oportunidade de evolução";
  }, [focusSubject, focusParam, proficiencies, examConfig]);

  // ─── Filtering ────────────────────────────────────────────
  const filtered = useMemo(() => {
    return missions.filter((m) => {
      if (filter === "pending") return m.status !== "completed";
      if (filter === "completed") return m.status === "completed";
      return true;
    });
  }, [missions, filter]);

  const completedCount = filtered.filter((m) => m.status === "completed").length;
  const totalCount = filtered.length;

  // ─── Today's missions — prioritized ───────────────────────
  const todayMissions = useMemo(() => {
    const today = missions.filter(m => m.date === todayStr);
    const overdue = missions.filter(m => m.date < todayStr && m.status === "pending");
    const all = [...overdue, ...today];

    // Sort: focus subject pending first, then pending, then completed
    return [...all].sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (b.status === "completed" && a.status !== "completed") return -1;
      if (a.status !== "completed" && b.status !== "completed" && focusSubject) {
        const aFocus = a.subject === focusSubject ? 0 : 1;
        const bFocus = b.subject === focusSubject ? 0 : 1;
        if (aFocus !== bFocus) return aFocus - bFocus;
      }
      return 0;
    });
  }, [missions, todayStr, focusSubject]);

  const todayCompleted = todayMissions.filter(m => m.status === "completed").length;
  const todayTotal = todayMissions.length;
  const todayPending = todayTotal - todayCompleted;
  const todayPct = todayTotal > 0 ? (todayCompleted / todayTotal) * 100 : 0;
  const todayTimeTotal = todayMissions.reduce((s, m) => s + (m.estimated_minutes ?? 15), 0);
  const todayTimeRemaining = todayMissions
    .filter(m => m.status !== "completed")
    .reduce((s, m) => s + (m.estimated_minutes ?? 15), 0);

  const nextMission = todayMissions.find(m => m.status !== "completed");

  // ─── Weekly agenda (future only, not today) ───────────────
  const weeklyAgenda = useMemo(() => {
    const future = filtered.filter(m => m.date > todayStr);
    const byDate: Record<string, Mission[]> = {};
    for (const m of future) {
      if (!byDate[m.date]) byDate[m.date] = [];
      byDate[m.date].push(m);
    }
    for (const date of Object.keys(byDate)) {
      const pending = byDate[date].filter(m => m.status !== "completed");
      const done = byDate[date].filter(m => m.status === "completed");
      byDate[date] = [...pending, ...done];
    }
    return Object.keys(byDate).sort().map(date => ({
      label: formatDateHeader(date),
      date,
      missions: byDate[date],
    }));
  }, [filtered, todayStr]);

  // ─── All-week completion check ────────────────────────────
  const allWeekDone = missions.length > 0 && missions.every(m => m.status === "completed");

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-[640px] mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-foreground" />
            <span className="text-base font-semibold text-foreground">Estudar</span>
          </div>
          {missions.length > 0 && (
            <span className="text-xs text-muted-foreground">{completedCount}/{totalCount} feitas</span>
          )}
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-5">
        {/* ─── Empty: no missions at all ─── */}
        {missions.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Seu plano ainda não foi gerado.</h2>
            <Link
              to="/diagnostic/intro"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-white text-sm font-semibold hover:bg-foreground/90 transition-colors"
            >
              Fazer diagnóstico
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : allWeekDone ? (
          /* ─── All-week completed ─── */
          <div className="text-center py-16 animate-fade-in">
            <h2 className="text-lg font-semibold text-foreground">Plano da semana concluído! 🎉</h2>
            <p className="text-sm text-muted-foreground mt-2">Bom trabalho. Descanse ou pratique por conta própria.</p>
            <Link
              to="/exams"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-white text-sm font-semibold hover:bg-foreground/90 transition-colors"
            >
              Explorar simulados
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">

            {/* ═══════════════════════════════════════════════════
                BLOCO 1 — HERO DA SESSÃO DE HOJE
                Show when: there are today missions, OR focusParam was passed
                ═══════════════════════════════════════════════════ */}
            {(todayTotal > 0 || focusParam) && (
              todayPending === 0 && todayTotal > 0 ? (
                /* ─── Completed session state ─── */
                <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-6 text-white">
                  <div className="flex items-center gap-3 mb-1">
                    <Trophy className="h-6 w-6 text-emerald-200" />
                    <h1 className="text-xl font-bold leading-tight">Sessão do dia concluída</h1>
                  </div>
                  <p className="text-sm text-white/70 mb-5">
                    {todayCompleted} {todayCompleted === 1 ? "missão concluída" : "missões concluídas"} — bom trabalho!
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {focusSubject && (
                      <Link
                        to={`/study?focus=${encodeURIComponent(focusSubject)}`}
                        className="flex items-center justify-center gap-2 py-2.5 bg-white/15 hover:bg-white/25 rounded-xl text-sm font-semibold transition-colors"
                      >
                        <Target className="h-4 w-4" />
                        Praticar {focusSubject.length > 10 ? focusSubject.slice(0, 10) + "…" : focusSubject}
                      </Link>
                    )}
                    <Link
                      to="/exams"
                      className="flex items-center justify-center gap-2 py-2.5 bg-white/15 hover:bg-white/25 rounded-xl text-sm font-semibold transition-colors"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Mini simulado
                    </Link>
                  </div>
                </div>
              ) : (
                /* ─── Active session hero ─── */
                <div className="bg-gradient-to-br from-foreground to-foreground/90 rounded-2xl p-5 text-white shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Sessão de hoje</p>
                      {focusSubject ? (
                        <>
                          <h1 className="text-xl font-bold mt-1 leading-tight">Foco: {focusSubject}</h1>
                          {proficiencies[focusSubject] && (
                            <p className="text-sm font-semibold text-white/80 mt-0.5">
                              {proficiencies[focusSubject].pct}% de proficiência
                            </p>
                          )}
                        </>
                      ) : (
                        <h1 className="text-xl font-bold mt-1 leading-tight">{todayPending} {todayPending === 1 ? "missão pendente" : "missões pendentes"}</h1>
                      )}
                      {focusReason && (
                        <p className="text-xs text-white/50 mt-0.5">{focusReason}</p>
                      )}
                    </div>
                    {todayTotal > 0 && (
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold leading-none">{todayTimeRemaining}<span className="text-sm font-medium text-white/50">min</span></p>
                        <p className="text-[10px] text-white/40 mt-0.5">{todayPending} restantes</p>
                      </div>
                    )}
                  </div>

                  {todayTotal > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] text-white/50">{todayCompleted}/{todayTotal} concluídas</span>
                        <span className="text-[11px] text-white/50">{Math.round(todayPct)}%</span>
                      </div>
                      <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full transition-all duration-500"
                          style={{ width: `${todayPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {nextMission && (
                    <Link
                      to={`/mission/${nextMission.mission_type}/${nextMission.id}`}
                      className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 bg-white text-foreground rounded-xl text-sm font-bold hover:bg-white/90 transition-colors"
                    >
                      <Play className="h-4 w-4" />
                      {todayCompleted === 0 ? "Começar sessão" : "Continuar sessão"}
                    </Link>
                  )}
                </div>
              )
            )}

            {/* ═══════════════════════════════════════════════════
                FALLBACK — Focus subject has no mission today
                Shows a practice card when user came from /desempenho
                but there's no matching mission for that subject.
                ═══════════════════════════════════════════════════ */}
            {focusParam && !focusHasMission && (() => {
              // Try to find any pending mission for this subject in the plan
              const anyPendingForSubject = missions.find(
                m => m.subject === focusParam && m.status !== "completed"
              );
              return (
                <div className="bg-white rounded-2xl border border-foreground/10 p-4">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Prática recomendada</p>
                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Praticar {focusParam}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {anyPendingForSubject
                          ? `${MISSION_TYPE_LABELS[anyPendingForSubject.mission_type] || anyPendingForSubject.mission_type} · ${anyPendingForSubject.estimated_minutes ?? 15} min`
                          : "Sem missões programadas para hoje nesta matéria"
                        }
                      </p>
                    </div>
                    {anyPendingForSubject ? (
                      <Link
                        to={`/mission/${anyPendingForSubject.mission_type}/${anyPendingForSubject.id}`}
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-foreground text-white rounded-xl text-xs font-semibold hover:bg-foreground/90 transition-colors"
                      >
                        Praticar
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <Link
                        to="/exams"
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-foreground rounded-xl text-xs font-semibold hover:bg-gray-200 transition-colors"
                      >
                        Simulado
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ═══════════════════════════════════════════════════
                BLOCO 2 — MISSÕES PRIORIZADAS DE HOJE
                ═══════════════════════════════════════════════════ */}
            {todayMissions.length > 0 && todayPending > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {todayMissions.some(m => m.date < todayStr) ? "Hoje + atrasadas" : "Hoje"}
                  </h2>
                  {todayMissions.some(m => m.estimated_minutes != null) && (
                    <span className="text-[10px] text-muted-foreground">
                      {todayMissions.filter(m => m.status === "completed").reduce((s, m) => s + (m.estimated_minutes ?? 15), 0)} de {todayTimeTotal} min
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {todayMissions.map((m, i) => {
                    const pendingIdx = todayMissions.filter((x, xi) => xi < i && x.status !== "completed").length;
                    return (
                      <PriorityMissionCard
                        key={m.id}
                        mission={m}
                        rationale={getMissionRationale(m, proficiencies, examConfig?.phase2_subjects || [], spacedReviews, examConfig?.course_name || null)}
                        isPrimary={pendingIdx === 0 && m.status !== "completed"}
                        isNextRecommended={m.id === nextMission?.id}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* No missions today but have future */}
            {todayTotal === 0 && weeklyAgenda.length > 0 && (
              <div className="bg-gray-50 rounded-2xl p-5 text-center">
                <p className="text-sm text-muted-foreground">Hoje — sem missões planejadas</p>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════
                FILTERS (between today and weekly)
                ═══════════════════════════════════════════════════ */}
            <div className="flex gap-2">
              {(["all", "pending", "completed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                    filter === f
                      ? "bg-foreground text-white"
                      : "bg-white border border-gray-200 text-foreground hover:border-gray-400"
                  }`}
                >
                  {f === "all" ? "Todas" : f === "pending" ? "Pendentes" : "Concluídas"}
                </button>
              ))}
            </div>

            {/* Filter empty states */}
            {filtered.length === 0 && filter === "pending" && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Tudo feito por hoje! 🎉</p>
              </div>
            )}
            {filtered.length === 0 && filter === "completed" && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Nenhuma missão concluída ainda. Que tal começar?</p>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════
                BLOCO 3 — AGENDA DA SEMANA (collapsible, collapsed by default)
                ═══════════════════════════════════════════════════ */}
            {weeklyAgenda.length > 0 && (() => {
              const weekTotal = weeklyAgenda.reduce((s, sec) => s + sec.missions.length, 0);
              const weekDone = weeklyAgenda.reduce((s, sec) => s + sec.missions.filter(m => m.status === "completed").length, 0);
              return (
                <div className="bg-gray-50/80 rounded-2xl border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => setAgendaOpen(prev => !prev)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Agenda da semana · {weekDone}/{weekTotal} feitas
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${agendaOpen ? "rotate-180" : ""}`} />
                  </button>
                  {agendaOpen && (
                    <div className="divide-y divide-gray-100 border-t border-gray-100">
                      {weeklyAgenda.map((section) => {
                        const sectionCompleted = section.missions.filter(m => m.status === "completed").length;
                        const sectionTime = section.missions.reduce((s, m) => s + (m.estimated_minutes ?? 15), 0);
                        return (
                          <div key={section.date} className="px-3 py-2.5">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-foreground">{section.label}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {sectionCompleted}/{section.missions.length}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{sectionTime}m</span>
                            </div>
                            <div className="-mx-1">
                              {section.missions.map(m => (
                                <CompactMissionRow key={m.id} mission={m} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default Study;
