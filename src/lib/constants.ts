/**
 * Constantes compartilhadas do Cátedra.
 * Fonte única de verdade — ver docs/core-contract.md
 */

export const MISSION_TYPE_LABELS: Record<string, string> = {
  questions: "Questões",
  error_review: "Revisão de erros",
  short_summary: "Resumo",
  spaced_review: "Revisão espaçada",
  mixed_block: "Bloco misto",
  reading_work: "Leitura",
  writing_outline: "Planejamento de redação",
  writing_partial: "Redação parcial",
  writing_full: "Redação completa",
  // Legacy
  summary: "Resumo",
  flashcards: "Flashcards",
  review: "Revisão de erros",
};

export const ALL_SUBJECTS = [
  "Português",
  "Matemática",
  "História",
  "Geografia",
  "Biologia",
  "Física",
  "Química",
  "Inglês",
  "Filosofia",
] as const;

export const MISSION_STATUSES = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  ABANDONED: "abandoned",
  EXPIRED: "expired",
  SUPERSEDED: "superseded",
} as const;

export type MissionStatus = (typeof MISSION_STATUSES)[keyof typeof MISSION_STATUSES];

export const PLAN_STATUSES = {
  ACTIVE: "active",
  SUPERSEDED: "superseded",
} as const;

export type PlanStatus = (typeof PLAN_STATUSES)[keyof typeof PLAN_STATUSES];
