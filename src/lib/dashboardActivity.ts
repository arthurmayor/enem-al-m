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

export interface MissionSubjectSummary {
  subject: string;
  questionCount: number;
  correctCount: number;
  accuracyPct: number | null;
}

export interface MissionSubtopicSummary {
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

export function summarizeMissionActivityBySubject(
  rows: MissionActivityRow[],
): MissionSubjectSummary[] {
  const bySubject = new Map<string, { questionCount: number; correctCount: number }>();

  for (const row of buildMissionActivity(rows)) {
    const current = bySubject.get(row.subject) ?? { questionCount: 0, correctCount: 0 };
    current.questionCount += row.questionCount;
    current.correctCount += row.correctCount;
    bySubject.set(row.subject, current);
  }

  return Array.from(bySubject.entries()).map(([subject, value]) => ({
    subject,
    questionCount: value.questionCount,
    correctCount: value.correctCount,
    accuracyPct:
      value.questionCount > 0
        ? Math.round((value.correctCount / value.questionCount) * 100)
        : null,
  }));
}

export function summarizeMissionActivityBySubtopic(
  rows: MissionActivityRow[],
  subject: string,
): MissionSubtopicSummary[] {
  const bySubtopic = new Map<string, { questionCount: number; correctCount: number }>();

  for (const row of buildMissionActivity(rows)) {
    if (row.subject !== subject) continue;
    const key = row.subtopic?.trim() || row.subject;
    const current = bySubtopic.get(key) ?? { questionCount: 0, correctCount: 0 };
    current.questionCount += row.questionCount;
    current.correctCount += row.correctCount;
    bySubtopic.set(key, current);
  }

  return Array.from(bySubtopic.entries()).map(([subtopic, value]) => ({
    subject,
    subtopic,
    questionCount: value.questionCount,
    correctCount: value.correctCount,
    accuracyPct:
      value.questionCount > 0
        ? Math.round((value.correctCount / value.questionCount) * 100)
        : null,
  }));
}