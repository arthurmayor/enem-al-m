import { MISSION_STATUSES } from "@/lib/constants";

export interface MissionActivityRow {
  date: string;
  mission_type: string | null;
  status: string | null;
  score: number | null;
  question_ids: string[] | null;
  subject: string;
  subtopic: string | null;
}

export interface MissionActivitySummary {
  date: string;
  subject: string;
  subtopic: string | null;
  questionCount: number;
  correctCount: number;
  accuracyPct: number | null;
}

const QUESTION_MISSION_TYPES = ["questions", "error_review", "spaced_review"];

export function isQuestionMissionType(type: string | null | undefined) {
  return !!type && QUESTION_MISSION_TYPES.includes(type);
}

export function buildMissionActivity(rows: MissionActivityRow[]): MissionActivitySummary[] {
  return rows
    .filter(
      (row) =>
        row.status === MISSION_STATUSES.COMPLETED &&
        isQuestionMissionType(row.mission_type) &&
        (row.question_ids?.length ?? 0) > 0,
    )
    .map((row) => {
      const questionCount = row.question_ids?.length ?? 0;
      const normalizedScore = Math.max(0, Math.min(100, row.score ?? 0));
      const correctCount = Math.round((normalizedScore / 100) * questionCount);

      return {
        date: row.date,
        subject: row.subject,
        subtopic: row.subtopic,
        questionCount,
        correctCount,
        accuracyPct: questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : null,
      };
    });
}