import { useNavigate } from "react-router-dom";
import { MISSION_STATUSES, MISSION_TYPE_LABELS } from "@/lib/constants";
import SubjectBadge from "@/components/ui/SubjectBadge";
import { getSubjectColor } from "@/lib/subjectColors";

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

const MissionCard = ({ mission }: { mission: Mission }) => {
  const navigate = useNavigate();
  const typeLabel = MISSION_TYPE_LABELS[mission.mission_type] || mission.mission_type;

  return (
    <div
      onClick={() => navigate(`/mission/${mission.mission_type}/${mission.id}`)}
      className="bg-bg-card rounded-card p-4 border border-line-light shadow-card hover:shadow-card-hover cursor-pointer transition-shadow"
      style={{ borderTopWidth: "3px", borderTopColor: getSubjectColor(mission.subject) }}
    >
      <SubjectBadge subject={mission.subject} />
      <p className="text-sm text-ink-soft mt-2">{typeLabel}</p>

      <div className="mt-3 text-sm">
        {mission.status === MISSION_STATUSES.COMPLETED ? (
          <span className="font-medium text-signal-ok">
            ✅ {mission.score != null ? `${Math.round(mission.score)}%` : "Concluída"}
          </span>
        ) : mission.status === MISSION_STATUSES.IN_PROGRESS ? (
          <span className="font-medium text-brand-500">🔄 Em andamento</span>
        ) : (
          <span className="text-ink-muted">⏳ {mission.estimated_minutes ?? 15}m</span>
        )}
      </div>
    </div>
  );
};

export default MissionCard;
