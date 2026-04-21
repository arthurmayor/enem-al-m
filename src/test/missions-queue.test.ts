import { describe, it, expect } from "vitest";
import { deriveMissionsQueue } from "@/hooks/dashboard/useMissionsQueue";
import { MISSION_STATUSES } from "@/lib/constants";

/**
 * Dashboard reactivity regression guard.
 *
 * These tests exercise the pure derivation behind `useMissionsQueue` —
 * the piece that decides:
 *   - which missions belong in "Suas Missões" (activeQueue),
 *   - how the hero ring renders "X / Y hoje",
 *   - whether the dashboard shows "Sessão do dia completa!".
 *
 * The bug we keep reintroducing is treating the queue like a generic
 * list; a completed mission has to (a) disappear from `activeQueue`,
 * (b) count towards `todayCompleted`, (c) still count towards
 * `todayTotal`, otherwise the hero stays stuck on the mission the
 * user just finished and the ring shows the wrong denominator.
 */

type RawMission = Parameters<typeof deriveMissionsQueue>[0][number];

function mission(overrides: Partial<RawMission>): RawMission {
  return {
    id: overrides.id ?? "m-1",
    subject: overrides.subject ?? "Matemática",
    subtopic: overrides.subtopic ?? null,
    mission_type: overrides.mission_type ?? "questions",
    status: overrides.status ?? MISSION_STATUSES.PENDING,
    score: overrides.score ?? null,
    mission_order: overrides.mission_order ?? 1,
    question_ids: overrides.question_ids ?? null,
    estimated_minutes: overrides.estimated_minutes ?? 25,
    date: overrides.date ?? "2026-04-21",
  };
}

describe("deriveMissionsQueue", () => {
  it("empty input → empty queue", () => {
    const q = deriveMissionsQueue([], []);
    expect(q.todayTotal).toBe(0);
    expect(q.todayCompleted).toBe(0);
    expect(q.activeQueue).toEqual([]);
    expect(q.overdueMissions).toEqual([]);
    expect(q.todayMissions).toEqual([]);
  });

  it("completed today mission is NOT in activeQueue but counts as todayCompleted", () => {
    const q = deriveMissionsQueue(
      [
        mission({ id: "t1", status: MISSION_STATUSES.COMPLETED }),
        mission({ id: "t2", status: MISSION_STATUSES.PENDING }),
      ],
      [],
    );
    expect(q.todayTotal).toBe(2);
    expect(q.todayCompleted).toBe(1);
    expect(q.activeQueue.map((m) => m.id)).toEqual(["t2"]);
  });

  it("all today missions completed → activeQueue empty, todayCompleted = todayTotal", () => {
    const q = deriveMissionsQueue(
      [
        mission({ id: "t1", status: MISSION_STATUSES.COMPLETED }),
        mission({ id: "t2", status: MISSION_STATUSES.COMPLETED }),
        mission({ id: "t3", status: MISSION_STATUSES.COMPLETED }),
      ],
      [],
    );
    expect(q.todayTotal).toBe(3);
    expect(q.todayCompleted).toBe(3);
    expect(q.activeQueue).toEqual([]);
  });

  it("overdue comes BEFORE today's pending in the active queue", () => {
    const q = deriveMissionsQueue(
      [mission({ id: "today1", status: MISSION_STATUSES.PENDING })],
      [mission({ id: "od1", date: "2026-04-19" })],
    );
    expect(q.activeQueue.map((m) => m.id)).toEqual(["od1", "today1"]);
    expect(q.activeQueue[0].isOverdue).toBe(true);
    expect(q.activeQueue[1].isOverdue).toBe(false);
  });

  it("today missions carry isToday flag and not isOverdue", () => {
    const q = deriveMissionsQueue([mission({ id: "t" })], []);
    expect(q.todayMissions[0].isToday).toBe(true);
    expect(q.todayMissions[0].isOverdue).toBe(false);
  });

  it("overdue missions carry isOverdue flag and not isToday", () => {
    const q = deriveMissionsQueue([], [mission({ id: "od" })]);
    expect(q.overdueMissions[0].isOverdue).toBe(true);
    expect(q.overdueMissions[0].isToday).toBe(false);
  });

  it("in_progress today mission stays in activeQueue", () => {
    const q = deriveMissionsQueue(
      [mission({ id: "t1", status: MISSION_STATUSES.IN_PROGRESS })],
      [],
    );
    expect(q.activeQueue.map((m) => m.id)).toEqual(["t1"]);
    expect(q.todayCompleted).toBe(0);
  });

  it("realistic: 4 today missions, 1 completed — hero sees mission #2 as next", () => {
    const q = deriveMissionsQueue(
      [
        mission({ id: "t1", mission_order: 1, status: MISSION_STATUSES.COMPLETED }),
        mission({ id: "t2", mission_order: 2, status: MISSION_STATUSES.PENDING }),
        mission({ id: "t3", mission_order: 3, status: MISSION_STATUSES.PENDING }),
        mission({ id: "t4", mission_order: 4, status: MISSION_STATUSES.PENDING }),
      ],
      [],
    );
    expect(q.todayTotal).toBe(4);
    expect(q.todayCompleted).toBe(1);
    expect(q.activeQueue[0].id).toBe("t2");
    expect(q.activeQueue.length).toBe(3);
  });

  it("preserves estimated_minutes so MissionRow can show ~N min fallback", () => {
    const q = deriveMissionsQueue(
      [mission({ id: "t1", estimated_minutes: 42, question_ids: null })],
      [],
    );
    expect(q.activeQueue[0].estimated_minutes).toBe(42);
    expect(q.activeQueue[0].question_ids).toBeNull();
  });

  it("preserves subtopic verbatim (filtering 'geral' happens in the view)", () => {
    const q = deriveMissionsQueue(
      [mission({ id: "t1", subtopic: "geral" })],
      [],
    );
    expect(q.activeQueue[0].subtopic).toBe("geral");
  });
});
