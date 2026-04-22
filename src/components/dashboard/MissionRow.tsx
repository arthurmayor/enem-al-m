import { useNavigate } from "react-router-dom";
import { MISSION_STATUSES } from "@/lib/constants";

export interface DashboardMission {
  id: string;
  subject: string;
  subtopic: string | null;
  status: string;
  score: number | null;
  mission_type: string;
  question_ids: string[] | null;
  estimated_minutes?: number | null;
}

interface MissionRowProps {
  mission: DashboardMission;
  isNext: boolean;
  isOverdue?: boolean;
}

/** Treats literal placeholder subtopics ("geral", "") as absent. */
function displaySubtopic(subtopic: string | null | undefined): string | null {
  if (!subtopic) return null;
  const trimmed = subtopic.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "geral") return null;
  return trimmed;
}

export default function MissionRow({
  mission,
  isNext,
  isOverdue = false,
}: MissionRowProps) {
  const navigate = useNavigate();
  const isDone = mission.status === MISSION_STATUSES.COMPLETED;
  const isPending =
    mission.status === MISSION_STATUSES.PENDING ||
    mission.status === MISSION_STATUSES.IN_PROGRESS;

  const dotColor = isNext
    ? "#D85A30"
    : isDone
      ? "#1D9E75"
      : isOverdue
        ? "#B45309"
        : "#888780";

  // `question_ids` is populated lazily on first open of the mission, so
  // until then we don't know the actual count. Show "~N min" from
  // `estimated_minutes` as a fallback instead of an honest-but-ugly
  // "0 questões" / "? questões".
  const qCount = mission.question_ids?.length ?? null;
  const fallbackOrder = ((mission.id.charCodeAt(0) + mission.id.charCodeAt(1)) % 8) + 1;
  const subtopicText = displaySubtopic(mission.subtopic);
  const detailParts: string[] = [];
  if (subtopicText) detailParts.push(subtopicText);
  if (qCount != null && qCount > 0) {
    detailParts.push(`${qCount} questões`);
  } else if (mission.estimated_minutes && mission.estimated_minutes > 0) {
    detailParts.push(`~${mission.estimated_minutes} min`);
  }
  const detail = detailParts.join(" · ");
  const badgeLabel = isNext
    ? "Próxima"
    : isDone
      ? mission.score != null
        ? `${mission.score}% acerto`
        : "concluída"
      : isOverdue
        ? "atrasada"
        : "pendente";

  const containerClass = [
    "flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/85 px-4 py-3.5 shadow-[0_16px_34px_-30px_hsl(var(--foreground)/0.35)] transition-all",
    isNext
      ? "bg-transparent"
      : isOverdue
        ? "bg-transparent"
        : "bg-transparent",
    isDone ? "opacity-60" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl text-[11px] font-semibold shadow-[0_12px_24px_-18px_hsl(var(--foreground)/0.25)] ${
            isNext
              ? "bg-chart-violet text-primary-foreground"
              : isDone
                ? "bg-success/20 text-success"
                : isOverdue
                  ? "bg-warning/20 text-warning"
                  : "bg-muted text-muted-foreground"
          }`}
        >
          {isDone ? "✓" : isNext ? "▶" : fallbackOrder}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-semibold truncate ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {mission.subject}
            </span>
          </div>
          {detail && (
            <div className={`text-xs truncate ${isDone ? "text-muted-foreground" : "text-muted-foreground"}`}>{detail}</div>
          )}
        </div>
      </div>

      {isNext || isPending ? (
        <button
          type="button"
          onClick={() =>
            navigate(`/mission/${mission.mission_type}/${mission.id}`)
          }
          className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 transition-colors ${
            isNext
              ? "rounded-full bg-chart-violet/15 text-chart-violet"
              : isOverdue
                ? "rounded-full bg-warning/20 text-warning"
                : "rounded-full bg-signal-info/10 text-signal-info"
          }`}
        >
          {badgeLabel}
        </button>
      ) : isDone ? (
        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success shrink-0">
          {badgeLabel}
        </span>
      ) : null}
    </div>
  );
}
