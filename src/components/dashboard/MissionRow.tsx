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
}

interface MissionRowProps {
  mission: DashboardMission;
  isNext: boolean;
}

export default function MissionRow({ mission, isNext }: MissionRowProps) {
  const navigate = useNavigate();
  const isDone = mission.status === MISSION_STATUSES.COMPLETED;
  const isPending =
    mission.status === MISSION_STATUSES.PENDING ||
    mission.status === MISSION_STATUSES.IN_PROGRESS;

  const dotColor = isNext
    ? "#D85A30"
    : isDone
      ? "#1D9E75"
      : "#888780";

  const qCount = mission.question_ids?.length ?? null;
  const detailParts: string[] = [];
  if (mission.subtopic) detailParts.push(mission.subtopic);
  detailParts.push(`${qCount ?? "?"} questões`);
  const detail = detailParts.join(" · ");

  const containerClass = [
    "flex items-center justify-between gap-2.5 p-3 rounded-[10px] mb-1.5 last:mb-0 transition-all",
    isNext
      ? "border-2 border-coral bg-coral-light"
      : "border border-[#E8E6E1] bg-white",
    isDone ? "opacity-55" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#2C2C2A] truncate">
            {mission.subject}
          </div>
          <div className="text-xs text-[#888780] truncate">{detail}</div>
        </div>
      </div>

      {isNext ? (
        <button
          type="button"
          onClick={() =>
            navigate(`/mission/${mission.mission_type}/${mission.id}`)
          }
          className="bg-coral text-white border-none px-5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer shrink-0 hover:brightness-110 transition-all"
        >
          Iniciar
        </button>
      ) : isDone ? (
        <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#E1F5EE] text-[#1D9E75] whitespace-nowrap shrink-0">
          concluída
        </span>
      ) : isPending ? (
        <button
          type="button"
          onClick={() =>
            navigate(`/mission/${mission.mission_type}/${mission.id}`)
          }
          className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#E6F1FB] text-[#185FA5] whitespace-nowrap shrink-0 hover:brightness-95 transition-all"
        >
          pendente
        </button>
      ) : null}
    </div>
  );
}
