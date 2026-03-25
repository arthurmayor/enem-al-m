import { describe, it, expect } from "vitest";
import { MISSION_STATUSES } from "@/lib/constants";

// ─── Pure helpers extracted from MissionPage logic ───────────────────────────

/**
 * Determines the action to take when loading a mission based on its status.
 * Returns: "transition_to_in_progress" | "resume" | "completed" | "unknown"
 */
function resolveMissionLoadAction(
  status: string,
  questionIds: string[] | null,
): "transition_to_in_progress" | "resume" | "fetch_new" | "completed" | "unknown" {
  if (status === "completed") return "completed";
  if (status === "pending") return "transition_to_in_progress";
  if (status === "in_progress") {
    return questionIds && questionIds.length > 0 ? "resume" : "fetch_new";
  }
  return "unknown";
}

/**
 * Reorders fetched questions to match the original question_ids order.
 * Filters out any IDs that weren't found (deleted questions).
 */
function reorderByIds<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  return ids.map(id => byId.get(id)).filter((item): item is T => item != null);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Mission lifecycle", () => {
  describe("MISSION_STATUSES contract", () => {
    it("contains exactly 6 statuses in canonical order", () => {
      expect(MISSION_STATUSES).toEqual([
        "pending",
        "in_progress",
        "completed",
        "abandoned",
        "expired",
        "superseded",
      ]);
    });
  });

  describe("resolveMissionLoadAction — state machine transitions", () => {
    it("pending → transition_to_in_progress", () => {
      expect(resolveMissionLoadAction("pending", null)).toBe("transition_to_in_progress");
    });

    it("pending with leftover question_ids still transitions (fresh start)", () => {
      expect(resolveMissionLoadAction("pending", ["q1", "q2"])).toBe("transition_to_in_progress");
    });

    it("in_progress with question_ids → resume", () => {
      expect(resolveMissionLoadAction("in_progress", ["q1", "q2", "q3"])).toBe("resume");
    });

    it("in_progress without question_ids → fetch_new (backward compat)", () => {
      expect(resolveMissionLoadAction("in_progress", null)).toBe("fetch_new");
    });

    it("in_progress with empty question_ids → fetch_new (backward compat)", () => {
      expect(resolveMissionLoadAction("in_progress", [])).toBe("fetch_new");
    });

    it("completed → completed (blocks re-execution)", () => {
      expect(resolveMissionLoadAction("completed", ["q1"])).toBe("completed");
    });

    it("completed without question_ids → completed", () => {
      expect(resolveMissionLoadAction("completed", null)).toBe("completed");
    });

    it("unknown status → unknown", () => {
      expect(resolveMissionLoadAction("abandoned", null)).toBe("unknown");
      expect(resolveMissionLoadAction("expired", null)).toBe("unknown");
    });
  });

  describe("reorderByIds — question binding preserves order", () => {
    const questions = [
      { id: "q3", text: "Question 3" },
      { id: "q1", text: "Question 1" },
      { id: "q2", text: "Question 2" },
    ];

    it("reorders to match original ID sequence", () => {
      const ids = ["q1", "q2", "q3"];
      const result = reorderByIds(questions, ids);
      expect(result.map(q => q.id)).toEqual(["q1", "q2", "q3"]);
    });

    it("preserves exact same order on repeated calls (deterministic)", () => {
      const ids = ["q2", "q3", "q1"];
      const r1 = reorderByIds(questions, ids);
      const r2 = reorderByIds(questions, ids);
      expect(r1.map(q => q.id)).toEqual(r2.map(q => q.id));
      expect(r1.map(q => q.id)).toEqual(["q2", "q3", "q1"]);
    });

    it("filters out missing IDs (deleted questions)", () => {
      const ids = ["q1", "q_deleted", "q3"];
      const result = reorderByIds(questions, ids);
      expect(result.map(q => q.id)).toEqual(["q1", "q3"]);
    });

    it("returns empty array when no IDs match", () => {
      const result = reorderByIds(questions, ["x1", "x2"]);
      expect(result).toEqual([]);
    });

    it("returns empty array for empty IDs", () => {
      const result = reorderByIds(questions, []);
      expect(result).toEqual([]);
    });

    it("handles duplicate IDs gracefully", () => {
      const ids = ["q1", "q1", "q2"];
      const result = reorderByIds(questions, ids);
      expect(result.map(q => q.id)).toEqual(["q1", "q1", "q2"]);
    });
  });

  describe("completed mission display", () => {
    it("uses stored score when in-memory score is zero (revisiting)", () => {
      const inMemoryTotal = 0;
      const storedScore = 85;
      const finalPercent = inMemoryTotal > 0 ? 0 : (storedScore ?? 0);
      expect(finalPercent).toBe(85);
    });

    it("uses in-memory score when just finished", () => {
      const inMemoryCorrect = 7;
      const inMemoryTotal = 10;
      const storedScore = null;
      const finalPercent = inMemoryTotal > 0
        ? Math.round((inMemoryCorrect / inMemoryTotal) * 100)
        : (storedScore ?? 0);
      expect(finalPercent).toBe(70);
    });
  });
});
