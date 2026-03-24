// ─── Scoring & Probability Model ─────────────────────────────────────────────
//
// Pure math functions for diagnostic score estimation and pass probability.
// Used by DiagnosticTest.tsx (production) and tested in scoring.test.ts.
//
// DESIGN DECISIONS (2026-03-24):
//
// 1. BLEND WEIGHT = 0.95 para diagnóstico (totalSimulados === 0)
//    Com ~3 questões por matéria, o Elo não consegue se afastar significativamente
//    de 1200 (K=48, ganho máx ≈72 pontos). O score direto (acerto% × 90) é a
//    melhor estimativa com poucos dados. O Elo contribui apenas 5% (~4.5 pontos).
//
// 2. SIGMA = max(7, 16/√infoScore) — incerteza do aluno
//    30 questões em 9 matérias não permitem estimar habilidade com precisão.
//    sigma=7.3 → intervalo de ±7.6 pontos (68% confiança) na escala 0-90.
//    Comparação: sigma anterior era 5.5, confiança excessiva para poucos dados.
//
// 3. QUANDO REVISAR:
//    - Quando houver alunos com 3+ simulados, considerar floor diferenciado:
//      const floor = simulados >= 3 ? 4 : 7;
//    - Se dados históricos de FUVEST mudarem cutoff_sd, recalibrar.
//    - Rodar scripts/simulate-diagnostics-v2.mjs para validar mudanças.
//
// VALIDAÇÃO: 14/14 critérios PASS, 0 violações monotonicidade (195 simulações).
// ─────────────────────────────────────────────────────────────────────────────

export interface Proficiency {
  elo: number;
  correct: number;
  total: number;
}

export interface SubjectDistEntry {
  questions: number;
  meanDiff: number;
  sdDiff: number;
}

// ─── Elo Functions ──────────────────────────────────────────────────────────

export function eloExpected(studentElo: number, questionElo: number): number {
  return 1 / (1 + Math.pow(10, (questionElo - studentElo) / 400));
}

export function eloUpdate(rating: number, expected: number, actual: number, k: number): number {
  return rating + k * (actual - expected);
}

export function getKFactor(numAttempts: number, totalQuestionsForSubject: number): number {
  const baseK = numAttempts < 10 ? 32 : numAttempts < 30 ? 16 : 8;
  if (totalQuestionsForSubject <= 3) return Math.round(baseK * 1.5);
  return baseK;
}

export function expectedAccuracy(studentElo: number, meanDiff: number, sdDiff: number): number {
  const grid = [-2.0, -1.5, -1.0, -0.5, -0.25, 0, 0.25, 0.5, 1.0, 1.5, 2.0];
  const weights = [0.02, 0.05, 0.10, 0.15, 0.18, 0.18, 0.15, 0.10, 0.05, 0.02, 0.00];
  let totalP = 0;
  for (let i = 0; i < grid.length; i++) {
    const qDiff = meanDiff + grid[i] * sdDiff;
    totalP += (1 / (1 + Math.pow(10, (qDiff - studentElo) / 400))) * weights[i];
  }
  return totalP;
}

// ─── Score Estimation ───────────────────────────────────────────────────────

export function estimateScore(
  proficiencies: Record<string, Proficiency>,
  subjectDist: Record<string, SubjectDistEntry>,
  totalDiagnosticQuestions: number,
  totalDiagnosticCorrect: number,
  totalSimulados: number = 0,
  totalQuestionsEver: number = 0,
): number {
  const rawAccuracyRate = totalDiagnosticQuestions > 0
    ? totalDiagnosticCorrect / totalDiagnosticQuestions
    : 0;
  const directScore = rawAccuracyRate * 90;

  let eloScore = 0;
  let totalQInDist = 0;
  for (const [subject, dist] of Object.entries(subjectDist)) {
    const elo = proficiencies[subject]?.elo || 1200;
    eloScore += expectedAccuracy(elo, dist.meanDiff, dist.sdDiff) * dist.questions;
    totalQInDist += dist.questions;
  }
  if (totalQInDist !== 90 && totalQInDist > 0) {
    eloScore = (eloScore / totalQInDist) * 90;
  }

  const dataVolume = (totalQuestionsEver || totalDiagnosticQuestions) + (totalSimulados * 90);
  let directWeight: number;
  if (totalSimulados === 0 && dataVolume <= 50) directWeight = 0.95;
  else if (dataVolume <= 50) directWeight = 0.70;
  else if (dataVolume <= 200) directWeight = 0.50;
  else if (dataVolume <= 500) directWeight = 0.25;
  else directWeight = 0.10;

  const eloWeight = 1 - directWeight;
  let score = directScore * directWeight + eloScore * eloWeight;

  if (score > 90) score = 90;
  if (score < 0) score = 0;
  const maxReasonableScore = rawAccuracyRate * 90 * 1.2;
  if (score > maxReasonableScore && rawAccuracyRate > 0) score = maxReasonableScore;

  return Math.round(score * 10) / 10;
}

// ─── Probability ────────────────────────────────────────────────────────────

export function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1.0 + sign * y);
}

export function calculatePassProbability(
  score: number,
  cutoffMean: number,
  cutoffSd: number,
  questionsAnswered: number,
  simulados: number,
  subjectsCovered: number
): number {
  const safeCutoffSd = Math.min(cutoffSd, 5);
  const infoScore = (questionsAnswered / 100) + (simulados * 3) + (subjectsCovered * 0.5);
  const sigmaStudent = Math.max(7, 16 / Math.sqrt(Math.max(0.1, infoScore)));
  const muDiff = score - cutoffMean;
  const sigmaDiff = Math.sqrt(sigmaStudent ** 2 + safeCutoffSd ** 2);
  const raw = normalCDF(muDiff / sigmaDiff);
  return Math.max(0.01, Math.min(0.98, raw));
}

export function getProbabilityBand(prob: number) {
  if (prob < 0.03) return { band: "< 3%", label: "Início da jornada", color: "#991b1b", bgColor: "#fef2f2", borderColor: "#fecaca" };
  if (prob < 0.10) return { band: "3–10%", label: "Distante da meta", color: "#9a3412", bgColor: "#fff7ed", borderColor: "#fed7aa" };
  if (prob < 0.25) return { band: "10–25%", label: "Em construção", color: "#854d0e", bgColor: "#fefce8", borderColor: "#fef08a" };
  if (prob < 0.40) return { band: "25–40%", label: "Potencial", color: "#a16207", bgColor: "#fefce8", borderColor: "#fef08a" };
  if (prob < 0.55) return { band: "40–55%", label: "Competitivo", color: "#15803d", bgColor: "#f0fdf4", borderColor: "#bbf7d0" };
  if (prob < 0.70) return { band: "55–70%", label: "Forte candidato", color: "#166534", bgColor: "#f0fdf4", borderColor: "#86efac" };
  return { band: "> 70%", label: "Excelente posição", color: "#14532d", bgColor: "#ecfdf5", borderColor: "#6ee7b7" };
}

export function getLevel(elo: number) {
  if (elo >= 1500) return { label: "Avançado", color: "#14532d" };
  if (elo >= 1350) return { label: "Bom", color: "#059669" };
  if (elo >= 1200) return { label: "Intermediário", color: "#d97706" };
  if (elo >= 1050) return { label: "Baixo", color: "#dc2626" };
  return { label: "Muito baixo", color: "#991b1b" };
}
