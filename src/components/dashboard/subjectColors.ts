/**
 * Dashboard v4 subject palette. Distinct from `src/lib/subjectColors.ts`
 * (which is used by other screens) — these hues align with the Eduhive-
 * inspired coral theme of the dashboard mockup.
 */
export const SUBJECT_COLORS: Record<string, string> = {
  "Química": "#A32D2D",
  "Física": "#BA7517",
  "Matemática": "#D85A30",
  "Biologia": "#EF9F27",
  "Geografia": "#378ADD",
  "Filosofia": "#534AB7",
  "Português": "#1D9E75",
  "História": "#D4537E",
  "Inglês": "#888780",
};

export function getDashboardSubjectColor(subject: string): string {
  return SUBJECT_COLORS[subject] ?? "#888780";
}
