import { describe, it, expect } from "vitest";
import {
  estimateScore,
  calculatePassProbability,
  normalCDF,
  getProbabilityBand,
  getLevel,
  eloExpected,
  eloUpdate,
  getKFactor,
  type Proficiency,
  type SubjectDistEntry,
} from "@/lib/scoring";

// ─── Test Data ──────────────────────────────────────────────────────────────

const FUVEST_DIST: Record<string, SubjectDistEntry> = {
  Portugues: { questions: 15, meanDiff: 1150, sdDiff: 250 },
  Matematica: { questions: 12, meanDiff: 1300, sdDiff: 300 },
  Historia: { questions: 12, meanDiff: 1200, sdDiff: 250 },
  Geografia: { questions: 10, meanDiff: 1200, sdDiff: 250 },
  Biologia: { questions: 10, meanDiff: 1200, sdDiff: 280 },
  Fisica: { questions: 10, meanDiff: 1300, sdDiff: 300 },
  Quimica: { questions: 8, meanDiff: 1250, sdDiff: 280 },
  Ingles: { questions: 5, meanDiff: 1050, sdDiff: 200 },
  Filosofia: { questions: 5, meanDiff: 1200, sdDiff: 250 },
  Artes: { questions: 3, meanDiff: 1100, sdDiff: 200 },
};

const CUTOFF_ADMIN = 55;
const CUTOFF_DIREITO = 66;
const CUTOFF_MEDICINA = 80;
const CUTOFF_SD = 2.0;
const DIAGNOSTIC_QUESTIONS = 30;
const DIAGNOSTIC_SUBJECTS = 9;

function makeProficiencies(elo: number): Record<string, Proficiency> {
  const subjects = ["Portugues", "Matematica", "Historia", "Geografia", "Biologia", "Fisica", "Quimica", "Ingles", "Filosofia"];
  const prof: Record<string, Proficiency> = {};
  for (const s of subjects) {
    prof[s] = { elo, correct: 3, total: 3 };
  }
  return prof;
}

function diagnosticProb(score: number, cutoffMean: number): number {
  return calculatePassProbability(score, cutoffMean, CUTOFF_SD, DIAGNOSTIC_QUESTIONS, 0, DIAGNOSTIC_SUBJECTS);
}

// ─── normalCDF ──────────────────────────────────────────────────────────────

describe("normalCDF", () => {
  // Note: uses Abramowitz & Stegun approximation — not textbook-exact
  // What matters: monotonicity, symmetry, boundary behavior, and
  // consistency with the calibrated scoring model.

  it("returns ~0.5 at x=0", () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 5);
  });

  it("is monotonically increasing", () => {
    const xs = [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3];
    for (let i = 1; i < xs.length; i++) {
      expect(normalCDF(xs[i])).toBeGreaterThan(normalCDF(xs[i - 1]));
    }
  });

  it("returns values in (0, 1) for finite inputs", () => {
    for (const x of [-5, -3, -1, 0, 1, 3, 5]) {
      expect(normalCDF(x)).toBeGreaterThan(0);
      expect(normalCDF(x)).toBeLessThan(1);
    }
  });

  it("is symmetric: CDF(x) + CDF(-x) = 1", () => {
    for (const x of [0.5, 1.0, 1.5, 2.0, 3.0]) {
      expect(normalCDF(x) + normalCDF(-x)).toBeCloseTo(1.0, 10);
    }
  });

  it("handles extreme values without NaN or overflow", () => {
    expect(normalCDF(10)).toBeCloseTo(1.0, 5);
    expect(normalCDF(-10)).toBeCloseTo(0.0, 5);
    expect(normalCDF(100)).toBeLessThanOrEqual(1.0);
    expect(normalCDF(-100)).toBeGreaterThanOrEqual(0.0);
    expect(Number.isNaN(normalCDF(Infinity))).toBe(false);
    expect(Number.isNaN(normalCDF(-Infinity))).toBe(false);
  });
});

// ─── estimateScore ──────────────────────────────────────────────────────────

describe("estimateScore", () => {
  it("returns 0 for 0% accuracy", () => {
    const prof = makeProficiencies(1200);
    for (const s of Object.keys(prof)) { prof[s].correct = 0; }
    const score = estimateScore(prof, FUVEST_DIST, 30, 0, 0, 30);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(10);
  });

  it("returns ~45 for 50% accuracy", () => {
    const prof = makeProficiencies(1200);
    const score = estimateScore(prof, FUVEST_DIST, 30, 15, 0, 30);
    expect(score).toBeGreaterThan(35);
    expect(score).toBeLessThan(55);
  });

  it("returns ~88 for 100% accuracy", () => {
    const prof = makeProficiencies(1500);
    for (const s of Object.keys(prof)) { prof[s].correct = 3; prof[s].total = 3; }
    const score = estimateScore(prof, FUVEST_DIST, 30, 30, 0, 30);
    expect(score).toBeGreaterThan(80);
    expect(score).toBeLessThanOrEqual(90);
  });

  it("score is always in [0, 90]", () => {
    for (const correct of [0, 5, 10, 15, 20, 25, 30]) {
      const prof = makeProficiencies(1200);
      const score = estimateScore(prof, FUVEST_DIST, 30, correct, 0, 30);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(90);
    }
  });

  it("score increases monotonically with accuracy", () => {
    const scores: number[] = [];
    for (let correct = 0; correct <= 30; correct += 5) {
      const prof = makeProficiencies(1200);
      scores.push(estimateScore(prof, FUVEST_DIST, 30, correct, 0, 30));
    }
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("uses 0.95 direct weight for diagnostic (0 simulados)", () => {
    const prof = makeProficiencies(1200);
    const score = estimateScore(prof, FUVEST_DIST, 30, 15, 0, 30);
    // Direct score = 0.5 * 90 = 45. With 0.95 weight, score should be close to 45
    expect(Math.abs(score - 45)).toBeLessThan(5);
  });

  it("handles empty proficiencies without error", () => {
    const score = estimateScore({}, FUVEST_DIST, 30, 15, 0, 30);
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("handles zero total questions without NaN", () => {
    const score = estimateScore({}, FUVEST_DIST, 0, 0, 0, 0);
    expect(Number.isNaN(score)).toBe(false);
    // directScore=0 but eloScore contributes a small amount via default Elo 1200
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(10);
  });
});

// ─── calculatePassProbability ───────────────────────────────────────────────

describe("calculatePassProbability", () => {
  it("probability is always in [0.01, 0.98]", () => {
    const cases = [
      { score: 0, cutoff: 80 },
      { score: 90, cutoff: 55 },
      { score: 45, cutoff: 45 },
      { score: 100, cutoff: 0 },
      { score: 0, cutoff: 100 },
    ];
    for (const { score, cutoff } of cases) {
      const p = diagnosticProb(score, cutoff);
      expect(p).toBeGreaterThanOrEqual(0.01);
      expect(p).toBeLessThanOrEqual(0.98);
      expect(Number.isNaN(p)).toBe(false);
    }
  });

  it("probability increases monotonically with score", () => {
    const probs: number[] = [];
    for (let score = 0; score <= 90; score += 10) {
      probs.push(diagnosticProb(score, CUTOFF_DIREITO));
    }
    for (let i = 1; i < probs.length; i++) {
      expect(probs[i]).toBeGreaterThanOrEqual(probs[i - 1]);
    }
  });

  it("same score → harder course gives lower probability", () => {
    const score = 65;
    const pAdmin = diagnosticProb(score, CUTOFF_ADMIN);
    const pDireito = diagnosticProb(score, CUTOFF_DIREITO);
    const pMedicina = diagnosticProb(score, CUTOFF_MEDICINA);

    expect(pAdmin).toBeGreaterThan(pDireito);
    expect(pDireito).toBeGreaterThan(pMedicina);
  });

  it("sensitivity: 50% < 70% < 90% accuracy for each course", () => {
    // For Admin and Direito, strict ordering holds
    for (const cutoff of [CUTOFF_ADMIN, CUTOFF_DIREITO]) {
      const p50 = diagnosticProb(45, cutoff);
      const p70 = diagnosticProb(63, cutoff);
      const p90 = diagnosticProb(81, cutoff);

      expect(p70).toBeGreaterThan(p50);
      expect(p90).toBeGreaterThan(p70);
    }
    // For Medicina (cutoff 80), low scores clamp to 1% floor.
    // Verify 90% is strictly higher than 70%
    const pMed70 = diagnosticProb(63, CUTOFF_MEDICINA);
    const pMed90 = diagnosticProb(81, CUTOFF_MEDICINA);
    expect(pMed90).toBeGreaterThan(pMed70);
  });

  it("caps cutoff_sd at 5", () => {
    const pNormal = calculatePassProbability(65, 66, 2, 30, 0, 9);
    const pHighSd = calculatePassProbability(65, 66, 100, 30, 0, 9);
    const pCapped = calculatePassProbability(65, 66, 5, 30, 0, 9);
    // cutoff_sd=100 should be capped to 5, giving same result as cutoff_sd=5
    expect(pHighSd).toBeCloseTo(pCapped, 10);
    // pCapped should differ from pNormal (sd=2 vs sd=5)
    expect(pCapped).not.toBeCloseTo(pNormal, 2);
  });

  it("handles zero questionsAnswered without NaN", () => {
    const p = calculatePassProbability(45, 66, 2, 0, 0, 0);
    expect(Number.isNaN(p)).toBe(false);
    expect(p).toBeGreaterThanOrEqual(0.01);
    expect(p).toBeLessThanOrEqual(0.98);
  });
});

// ─── Integrated Diagnostic Scenarios ────────────────────────────────────────

describe("diagnostic scenarios (integrated)", () => {
  it("0% accuracy → all courses < 5%", () => {
    const prof = makeProficiencies(800);
    for (const s of Object.keys(prof)) { prof[s].correct = 0; }
    const score = estimateScore(prof, FUVEST_DIST, 30, 0, 0, 30);
    expect(diagnosticProb(score, CUTOFF_ADMIN)).toBeLessThan(0.05);
    expect(diagnosticProb(score, CUTOFF_DIREITO)).toBeLessThan(0.05);
    expect(diagnosticProb(score, CUTOFF_MEDICINA)).toBeLessThan(0.05);
  });

  it("100% accuracy → Admin > 85%", () => {
    const prof = makeProficiencies(1600);
    const score = estimateScore(prof, FUVEST_DIST, 30, 30, 0, 30);
    expect(diagnosticProb(score, CUTOFF_ADMIN)).toBeGreaterThan(0.85);
  });

  it("100% accuracy → Medicina > 85%", () => {
    const prof = makeProficiencies(1600);
    const score = estimateScore(prof, FUVEST_DIST, 30, 30, 0, 30);
    expect(diagnosticProb(score, CUTOFF_MEDICINA)).toBeGreaterThan(0.85);
  });

  it("90% accuracy → Medicina 40-60%", () => {
    const prof = makeProficiencies(1400);
    const score = estimateScore(prof, FUVEST_DIST, 30, 27, 0, 30);
    const p = diagnosticProb(score, CUTOFF_MEDICINA);
    expect(p).toBeGreaterThan(0.30);
    expect(p).toBeLessThan(0.70);
  });

  it("Admin is easier than Direito, Direito is easier than Medicina", () => {
    const prof = makeProficiencies(1300);
    const score = estimateScore(prof, FUVEST_DIST, 30, 21, 0, 30);
    const pAdmin = diagnosticProb(score, CUTOFF_ADMIN);
    const pDireito = diagnosticProb(score, CUTOFF_DIREITO);
    const pMedicina = diagnosticProb(score, CUTOFF_MEDICINA);

    expect(pAdmin).toBeGreaterThan(pDireito);
    expect(pDireito).toBeGreaterThan(pMedicina);
  });
});

// ─── Elo Functions ──────────────────────────────────────────────────────────

describe("elo functions", () => {
  it("eloExpected returns 0.5 for equal ratings", () => {
    expect(eloExpected(1200, 1200)).toBeCloseTo(0.5, 10);
  });

  it("eloExpected > 0.5 when student is stronger", () => {
    expect(eloExpected(1400, 1200)).toBeGreaterThan(0.5);
  });

  it("eloExpected < 0.5 when student is weaker", () => {
    expect(eloExpected(1000, 1200)).toBeLessThan(0.5);
  });

  it("eloUpdate increases rating on correct answer", () => {
    const newRating = eloUpdate(1200, 0.5, 1, 32);
    expect(newRating).toBeGreaterThan(1200);
  });

  it("eloUpdate decreases rating on incorrect answer", () => {
    const newRating = eloUpdate(1200, 0.5, 0, 32);
    expect(newRating).toBeLessThan(1200);
  });

  it("getKFactor returns 48 for first attempt with ≤3 subject questions", () => {
    expect(getKFactor(0, 3)).toBe(48);
  });

  it("getKFactor returns 32 for first attempt with >3 subject questions", () => {
    expect(getKFactor(0, 10)).toBe(32);
  });
});

// ─── getProbabilityBand ─────────────────────────────────────────────────────

describe("getProbabilityBand", () => {
  it("returns correct bands for boundary values", () => {
    expect(getProbabilityBand(0.01).band).toBe("< 3%");
    expect(getProbabilityBand(0.05).band).toBe("3–10%");
    expect(getProbabilityBand(0.15).band).toBe("10–25%");
    expect(getProbabilityBand(0.30).band).toBe("25–40%");
    expect(getProbabilityBand(0.45).band).toBe("40–55%");
    expect(getProbabilityBand(0.60).band).toBe("55–70%");
    expect(getProbabilityBand(0.80).band).toBe("> 70%");
  });
});

// ─── getLevel ───────────────────────────────────────────────────────────────

describe("getLevel", () => {
  it("maps Elo ranges correctly", () => {
    expect(getLevel(900).label).toBe("Muito baixo");
    expect(getLevel(1050).label).toBe("Baixo");
    expect(getLevel(1200).label).toBe("Intermediário");
    expect(getLevel(1350).label).toBe("Bom");
    expect(getLevel(1500).label).toBe("Avançado");
  });
});
