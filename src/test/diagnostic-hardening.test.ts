import { describe, it, expect } from "vitest";

/**
 * Diagnostic question threshold logic — mirrors DiagnosticTest.tsx.
 * Router mode needs >= 8 questions, deep mode needs >= 20.
 */
function diagnosticQuestionCheck(
  availableCount: number,
  mode: "router" | "deep",
): { ok: boolean; insufficientQuestions: boolean } {
  const minRequired = mode === "router" ? 8 : 20;
  if (availableCount >= minRequired) {
    return { ok: true, insufficientQuestions: false };
  }
  return { ok: false, insufficientQuestions: true };
}

/**
 * Subtopic resolution — mirrors MissionPage.tsx calibration collection.
 * Uses question subtopic first, then mission subtopic, then "geral" as last resort.
 */
function resolveSubtopic(
  questionSubtopic: string | null | undefined,
  missionSubtopic: string | null | undefined,
): string {
  return questionSubtopic || missionSubtopic || "geral";
}

/**
 * Coverage report thresholds — mirrors scripts/coverage-report.mjs
 */
function checkSubjectCoverage(
  total: number,
  byDifficulty: Record<number, number>,
  subtopicCount: number,
): { status: "OK" | "FALTA"; issues: string[] } {
  const issues: string[] = [];
  if (total < 20) issues.push(`total ${total} < 20`);
  for (let d = 1; d <= 5; d++) {
    if ((byDifficulty[d] || 0) < 3) issues.push(`diff${d}: ${byDifficulty[d] || 0} < 3`);
  }
  if (subtopicCount < 5) issues.push(`subtopics ${subtopicCount} < 5`);
  return { status: issues.length === 0 ? "OK" : "FALTA", issues };
}

describe("Diagnostic — insufficient questions handling", () => {
  it("0 questions → insufficient, no crash", () => {
    const result = diagnosticQuestionCheck(0, "router");
    expect(result.ok).toBe(false);
    expect(result.insufficientQuestions).toBe(true);
  });

  it("5 questions (< 8 for router) → insufficient", () => {
    const result = diagnosticQuestionCheck(5, "router");
    expect(result.ok).toBe(false);
    expect(result.insufficientQuestions).toBe(true);
  });

  it("10 questions (>= 8 for router) → ok", () => {
    const result = diagnosticQuestionCheck(10, "router");
    expect(result.ok).toBe(true);
    expect(result.insufficientQuestions).toBe(false);
  });

  it("exactly 8 questions (router boundary) → ok", () => {
    const result = diagnosticQuestionCheck(8, "router");
    expect(result.ok).toBe(true);
  });

  it("15 questions (< 20 for deep) → insufficient", () => {
    const result = diagnosticQuestionCheck(15, "deep");
    expect(result.ok).toBe(false);
    expect(result.insufficientQuestions).toBe(true);
  });

  it("25 questions (>= 20 for deep) → ok", () => {
    const result = diagnosticQuestionCheck(25, "deep");
    expect(result.ok).toBe(true);
  });
});

describe("Subtopic — real subtopic from question", () => {
  it("question subtopic is used when available", () => {
    expect(resolveSubtopic("Trigonometria", "Matemática Geral")).toBe("Trigonometria");
  });

  it("mission subtopic used as fallback when question subtopic is null", () => {
    expect(resolveSubtopic(null, "Álgebra")).toBe("Álgebra");
  });

  it("mission subtopic used as fallback when question subtopic is empty", () => {
    expect(resolveSubtopic("", "Geometria")).toBe("Geometria");
  });

  it("'geral' used as last resort when both are null", () => {
    expect(resolveSubtopic(null, null)).toBe("geral");
  });

  it("'geral' used as last resort when both are empty", () => {
    expect(resolveSubtopic("", "")).toBe("geral");
  });

  it("question subtopic preferred even if mission subtopic exists", () => {
    expect(resolveSubtopic("Funções", "Tópico da missão")).toBe("Funções");
  });
});

describe("Coverage report — threshold checks", () => {
  it("all criteria met → OK", () => {
    const result = checkSubjectCoverage(25, { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5 }, 6);
    expect(result.status).toBe("OK");
    expect(result.issues).toHaveLength(0);
  });

  it("total below 20 → FALTA", () => {
    const result = checkSubjectCoverage(15, { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 }, 5);
    expect(result.status).toBe("FALTA");
    expect(result.issues).toContain("total 15 < 20");
  });

  it("difficulty bucket below 3 → FALTA", () => {
    const result = checkSubjectCoverage(20, { 1: 5, 2: 2, 3: 5, 4: 5, 5: 3 }, 5);
    expect(result.status).toBe("FALTA");
    expect(result.issues).toContain("diff2: 2 < 3");
  });

  it("subtopics below 5 → FALTA", () => {
    const result = checkSubjectCoverage(20, { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 }, 3);
    expect(result.status).toBe("FALTA");
    expect(result.issues).toContain("subtopics 3 < 5");
  });

  it("multiple failures reported", () => {
    const result = checkSubjectCoverage(10, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, 2);
    expect(result.status).toBe("FALTA");
    expect(result.issues.length).toBeGreaterThan(1);
  });
});
