import { useQueryClient } from "@tanstack/react-query";

/**
 * Returns a callable that marks every dashboard query as stale, so the
 * next time the dashboard mounts (or any mounted dashboard component
 * observes those keys) React Query refetches fresh data.
 *
 * Call this immediately after a write that changes anything the
 * dashboard reads — completing a mission, submitting a simulado,
 * generating a new study plan, etc. Without it, navigating back to
 * `/dashboard` via react-router shows stale data until either
 * `staleTime` elapses or the browser window loses+regains focus
 * (SPA navigation alone doesn't fire focus events).
 *
 * The helper matches any queryKey whose first element starts with
 * "dashboard-" (our convention across all dashboard hooks), so adding
 * a new dashboard hook requires no changes here.
 */
export function useInvalidateDashboard() {
  const queryClient = useQueryClient();

  return () =>
    queryClient.invalidateQueries({
      predicate: (query) => {
        const first = query.queryKey[0];
        return typeof first === "string" && first.startsWith("dashboard-");
      },
    });
}
