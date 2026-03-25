import { describe, it, expect } from "vitest";

/**
 * Weekly metrics calculation — mirrors Dashboard.tsx logic.
 * weeklySessionsTarget = total non-superseded missions in the week
 * weeklySessionsDone = completed missions in the week
 * weeklyPct = done / target * 100
 */

interface WeekMission {
  status: string;
}

function computeWeeklyMetrics(missions: WeekMission[]) {
  const target = missions.filter((m) => m.status !== "superseded").length;
  const done = missions.filter((m) => m.status === "completed").length;
  const pct = target > 0 ? Math.round((done / target) * 100) : 0;
  return { target, done, pct };
}

/**
 * Onboarding gate logic — mirrors ProtectedRoute.tsx
 */
function onboardingRedirect(
  onboardingComplete: boolean,
  currentPath: string,
): string | null {
  const isOnboardingRoute = currentPath === "/onboarding";
  const isDiagnosticRoute = currentPath.startsWith("/diagnostic");

  if (!onboardingComplete && !isOnboardingRoute && !isDiagnosticRoute) {
    return "/onboarding";
  }
  if (onboardingComplete && isOnboardingRoute) {
    return "/dashboard";
  }
  return null; // no redirect
}

describe("Dashboard weekly metrics — real data", () => {
  it("0 missions → target = 0, done = 0, pct = 0", () => {
    const result = computeWeeklyMetrics([]);
    expect(result.target).toBe(0);
    expect(result.done).toBe(0);
    expect(result.pct).toBe(0);
  });

  it("5 missions (3 completed, 1 pending, 1 superseded) → target = 4, done = 3", () => {
    const missions = [
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "pending" },
      { status: "superseded" },
    ];
    const result = computeWeeklyMetrics(missions);
    expect(result.target).toBe(4);
    expect(result.done).toBe(3);
    expect(result.pct).toBe(75);
  });

  it("weeklyPct calculation is correct (rounding)", () => {
    const missions = [
      { status: "completed" },
      { status: "pending" },
      { status: "pending" },
    ];
    const result = computeWeeklyMetrics(missions);
    expect(result.target).toBe(3);
    expect(result.done).toBe(1);
    expect(result.pct).toBe(33); // Math.round(1/3 * 100) = 33
  });

  it("all completed → 100%", () => {
    const missions = [
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
    ];
    const result = computeWeeklyMetrics(missions);
    expect(result.pct).toBe(100);
  });

  it("all superseded → target = 0, pct = 0 (no division by zero)", () => {
    const missions = [
      { status: "superseded" },
      { status: "superseded" },
    ];
    const result = computeWeeklyMetrics(missions);
    expect(result.target).toBe(0);
    expect(result.pct).toBe(0);
  });

  it("in_progress counts as non-completed target", () => {
    const missions = [
      { status: "completed" },
      { status: "in_progress" },
      { status: "pending" },
    ];
    const result = computeWeeklyMetrics(missions);
    expect(result.target).toBe(3);
    expect(result.done).toBe(1);
  });
});

describe("Onboarding gate — redirect logic", () => {
  it("onboarding_complete false → redirect to /onboarding", () => {
    expect(onboardingRedirect(false, "/dashboard")).toBe("/onboarding");
    expect(onboardingRedirect(false, "/study")).toBe("/onboarding");
    expect(onboardingRedirect(false, "/mission/questions/123")).toBe("/onboarding");
  });

  it("onboarding_complete false on /onboarding → no redirect", () => {
    expect(onboardingRedirect(false, "/onboarding")).toBeNull();
  });

  it("onboarding_complete false on /diagnostic/* → no redirect (allowed)", () => {
    expect(onboardingRedirect(false, "/diagnostic/intro")).toBeNull();
    expect(onboardingRedirect(false, "/diagnostic/results")).toBeNull();
  });

  it("onboarding_complete true on /onboarding → redirect to /dashboard", () => {
    expect(onboardingRedirect(true, "/onboarding")).toBe("/dashboard");
  });

  it("onboarding_complete true on other routes → no redirect", () => {
    expect(onboardingRedirect(true, "/dashboard")).toBeNull();
    expect(onboardingRedirect(true, "/study")).toBeNull();
    expect(onboardingRedirect(true, "/diagnostic/intro")).toBeNull();
  });
});
