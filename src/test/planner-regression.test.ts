import { describe, it, expect } from "vitest";
import {
  buildPlannerInput,
  calculateBand,
  deduplicateProficiencies,
  diagnosticToProfArray,
} from "@/lib/plannerInput";

function makeProfArray(entries: [string, number][]) {
  return entries.map(([subject, score]) => ({ subject, score, confidence: 0.7 }));
}

describe("buildPlannerInput — band calculation", () => {
  it("Cenário 1: Mat alta (0.7) e Quim baixa (0.3) → intermediario, Quim is bottleneck", () => {
    const profArray = makeProfArray([
      ["Matemática", 0.7],
      ["Química", 0.3],
      ["Português", 0.5],
      ["História", 0.45],
      ["Biologia", 0.55],
    ]);
    const result = buildPlannerInput(profArray, 50);
    expect(result.band).toBe("intermediario");
    expect(result.bottlenecks).toContain("Química");
    expect(result.bottlenecks).not.toContain("Matemática");
    expect(result.strengths).toContain("Matemática");
  });

  it("Cenário 2: todas > 0.75 → forte", () => {
    const profArray = makeProfArray([
      ["Matemática", 0.8],
      ["Português", 0.9],
      ["História", 0.85],
      ["Física", 0.76],
    ]);
    const result = buildPlannerInput(profArray, 40);
    expect(result.band).toBe("forte");
  });

  it("Cenário 3: todas < 0.35 → base", () => {
    const profArray = makeProfArray([
      ["Matemática", 0.2],
      ["Português", 0.1],
      ["História", 0.3],
      ["Química", 0.15],
    ]);
    const result = buildPlannerInput(profArray, 35);
    expect(result.band).toBe("base");
  });

  it("Cenário 4: profArray vazio → fallback para originalBand", () => {
    const result = buildPlannerInput([], 0, "competitivo");
    expect(result.band).toBe("competitivo");
    expect(result.profArray).toEqual([]);
    expect(result.bottlenecks).toEqual([]);
    expect(result.strengths).toEqual([]);
  });

  it("Cenário 5: totalAnswered < 30 → band NÃO é recalculado (usa original)", () => {
    const profArray = makeProfArray([
      ["Matemática", 0.9],
      ["Português", 0.85],
      ["História", 0.8],
      ["Física", 0.95],
    ]);
    // With >= 30 answers this would be "forte", but with < 30 it uses originalBand
    const result = buildPlannerInput(profArray, 25, "base");
    expect(result.band).toBe("base");
  });

  it("Cenário 6: totalAnswered >= 30 com 4+ matérias → band recalculado", () => {
    const profArray = makeProfArray([
      ["Matemática", 0.9],
      ["Português", 0.85],
      ["História", 0.8],
      ["Física", 0.95],
    ]);
    const result = buildPlannerInput(profArray, 30, "base");
    // originalBand is "base" but recalculation gives "forte" (avg = 0.875)
    expect(result.band).toBe("forte");
  });

  it("Cenário 7: bottlenecks/strengths change with different proficiencies", () => {
    // Week 1: Química weak, Matemática strong
    const week1 = makeProfArray([
      ["Matemática", 0.8],
      ["Química", 0.2],
      ["Português", 0.5],
      ["História", 0.5],
    ]);
    const r1 = buildPlannerInput(week1, 40);
    expect(r1.bottlenecks[0]).toBe("Química");
    expect(r1.strengths).toContain("Matemática");

    // Week 2: Química improved, Matemática dropped
    const week2 = makeProfArray([
      ["Matemática", 0.4],
      ["Química", 0.7],
      ["Português", 0.5],
      ["História", 0.5],
    ]);
    const r2 = buildPlannerInput(week2, 60);
    expect(r2.bottlenecks[0]).toBe("Matemática");
    expect(r2.strengths).toContain("Química");
  });

  it("Cenário 8: avgScore exatamente nos limites (0.35, 0.55, 0.75)", () => {
    // Exactly 0.35 → intermediario (>= 0.35)
    expect(calculateBand(0.35)).toBe("intermediario");
    // Exactly 0.55 → competitivo (>= 0.55)
    expect(calculateBand(0.55)).toBe("competitivo");
    // Exactly 0.75 → forte (>= 0.75)
    expect(calculateBand(0.75)).toBe("forte");
    // Just below boundaries
    expect(calculateBand(0.3499)).toBe("base");
    expect(calculateBand(0.5499)).toBe("intermediario");
    expect(calculateBand(0.7499)).toBe("competitivo");
  });
});

describe("deduplicateProficiencies", () => {
  it("keeps only first (most recent) entry per subject", () => {
    const rows = [
      { subject: "Matemática", score: 0.8 },
      { subject: "Português", score: 0.6 },
      { subject: "Matemática", score: 0.5 }, // older, should be ignored
    ];
    const map = deduplicateProficiencies(rows);
    expect(map.get("Matemática")).toBe(0.8);
    expect(map.get("Português")).toBe(0.6);
    expect(map.size).toBe(2);
  });
});

describe("diagnosticToProfArray", () => {
  it("converts elo-based proficiencies", () => {
    const result = diagnosticToProfArray({
      Matemática: { elo: 1200 },
      Português: { elo: 900 },
    });
    expect(result).toHaveLength(2);
    const mat = result.find((p) => p.subject === "Matemática")!;
    expect(mat.score).toBe(0.5); // (1200-600)/1200
    expect(mat.confidence).toBe(0.5);
  });

  it("converts score-based proficiencies", () => {
    const result = diagnosticToProfArray({
      Química: { score: 0.7 },
    });
    expect(result[0].score).toBe(0.7);
  });

  it("defaults to 0.5 when no elo or score", () => {
    const result = diagnosticToProfArray({
      Física: {},
    });
    expect(result[0].score).toBe(0.5);
  });
});

describe("buildPlannerInput — edge cases", () => {
  it("< 4 subjects with >= 30 answers still uses originalBand", () => {
    const profArray = makeProfArray([
      ["Matemática", 0.9],
      ["Português", 0.85],
      ["História", 0.8],
    ]);
    const result = buildPlannerInput(profArray, 50, "base");
    // Only 3 subjects, so originalBand is used even with >= 30 answers
    expect(result.band).toBe("base");
  });

  it("no originalBand and < 30 answers → calculates from data", () => {
    const profArray = makeProfArray([
      ["Matemática", 0.9],
      ["Português", 0.85],
    ]);
    // No originalBand provided, < 30 answers, < 4 subjects → fallback calculates
    const result = buildPlannerInput(profArray, 10);
    expect(result.band).toBe("forte"); // avg = 0.875
  });
});
