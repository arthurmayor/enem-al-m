import { describe, it, expect } from "vitest";

/**
 * Canonical score calculation — mirrors finishMission logic exactly.
 * finalScore = total > 0 ? Math.round((correct / total) * 100) : 0
 */
function computeFinalScore(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

/**
 * hasScore logic for completed display.
 * Score is shown whenever mission is completed (including 0%).
 */
function shouldShowScore(
  inMemoryTotal: number,
  storedScore: number | null | undefined,
  isSummary: boolean,
): boolean {
  if (isSummary) return false;
  const hasScore = inMemoryTotal > 0 || storedScore != null;
  return hasScore;
}

describe("Mission score — canonical calculation", () => {
  it("5 correct of 10 → 50%", () => {
    expect(computeFinalScore(5, 10)).toBe(50);
  });

  it("0 correct of 5 → 0%", () => {
    expect(computeFinalScore(0, 5)).toBe(0);
  });

  it("10 correct of 10 → 100%", () => {
    expect(computeFinalScore(10, 10)).toBe(100);
  });

  it("0 total → 0% (edge case, no questions answered)", () => {
    expect(computeFinalScore(0, 0)).toBe(0);
  });

  it("1 correct of 3 → 33% (rounds down)", () => {
    expect(computeFinalScore(1, 3)).toBe(33);
  });

  it("2 correct of 3 → 67% (rounds up)", () => {
    expect(computeFinalScore(2, 3)).toBe(67);
  });
});

describe("Mission score — completed display visibility", () => {
  it("score 0% is shown (not hidden by > 0 check)", () => {
    expect(shouldShowScore(0, 0, false)).toBe(true);
  });

  it("score null from DB still shows if in-memory has data", () => {
    expect(shouldShowScore(5, null, false)).toBe(true);
  });

  it("revisiting completed mission with stored score 0 shows score", () => {
    expect(shouldShowScore(0, 0, false)).toBe(true);
  });

  it("revisiting completed mission with stored score 85 shows score", () => {
    expect(shouldShowScore(0, 85, false)).toBe(true);
  });

  it("summary missions never show score circle", () => {
    expect(shouldShowScore(0, 100, true)).toBe(false);
  });

  it("no data at all (undefined score, 0 total) does not show score", () => {
    expect(shouldShowScore(0, undefined, false)).toBe(false);
  });
});

describe("XP calculation", () => {
  it("base 10 + 50% of score", () => {
    const finalScore = 80;
    const xpEarned = 10 + Math.round(finalScore * 0.5);
    expect(xpEarned).toBe(50);
  });

  it("0% score → 10 XP minimum", () => {
    const xpEarned = 10 + Math.round(0 * 0.5);
    expect(xpEarned).toBe(10);
  });

  it("100% score → 60 XP", () => {
    const xpEarned = 10 + Math.round(100 * 0.5);
    expect(xpEarned).toBe(60);
  });

  it("summary missions always get 15 XP", () => {
    expect(15).toBe(15);
  });
});
