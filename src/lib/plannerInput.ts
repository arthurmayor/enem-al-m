/**
 * Pure functions for building planner input from proficiency data.
 * Extracted for testability — no Supabase dependency.
 */

export interface ProficiencyRow {
  subject: string;
  score: number;
}

export interface DiagnosticProficiencies {
  [subject: string]: { elo?: number; score?: number };
}

export interface PlannerInput {
  profArray: { subject: string; score: number; confidence: number }[];
  band: string;
  bottlenecks: string[];
  strengths: string[];
}

/**
 * Deduplicate proficiency rows: keep only the first (most recent) per subject.
 */
export function deduplicateProficiencies(
  rows: ProficiencyRow[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!map.has(row.subject)) {
      map.set(row.subject, row.score);
    }
  }
  return map;
}

/**
 * Convert diagnostic_estimates proficiencies to profArray format.
 */
export function diagnosticToProfArray(
  proficiencies: DiagnosticProficiencies,
): { subject: string; score: number; confidence: number }[] {
  return Object.entries(proficiencies).map(([subject, v]) => ({
    subject,
    score: v.score ?? (v.elo ? (v.elo - 600) / 1200 : 0.5),
    confidence: 0.5,
  }));
}

/**
 * Calculate placement band from average score.
 */
export function calculateBand(avgScore: number): string {
  if (avgScore >= 0.75) return "forte";
  if (avgScore >= 0.55) return "competitivo";
  if (avgScore >= 0.35) return "intermediario";
  return "base";
}

/**
 * Build complete planner input from proficiency data.
 *
 * @param profArray - Array of proficiency scores per subject
 * @param totalAnswered - Total questions answered by user (for band recalculation threshold)
 * @param originalBand - Band from diagnostic (used if totalAnswered < 30 or < 4 subjects)
 */
export function buildPlannerInput(
  profArray: { subject: string; score: number; confidence: number }[],
  totalAnswered: number,
  originalBand?: string,
): PlannerInput {
  const sorted = [...profArray].sort((a, b) => a.score - b.score);
  const bottlenecks = sorted.slice(0, 3).map((p) => p.subject);
  const strengths = sorted.slice(-2).map((p) => p.subject);

  const avgScore =
    profArray.length > 0
      ? profArray.reduce((s, p) => s + p.score, 0) / profArray.length
      : 0.5;

  // Recalculate band only if sufficient data (>= 30 answers AND >= 4 subjects)
  let band: string;
  if (totalAnswered >= 30 && profArray.length >= 4) {
    band = calculateBand(avgScore);
  } else {
    band = originalBand ?? calculateBand(avgScore);
  }

  return { profArray, band, bottlenecks, strengths };
}
