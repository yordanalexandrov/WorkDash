import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type ClassifiedPullRequest, type DashboardState, fetchDashboard, markSeen } from "./api.js";

const FALLBACK_REFRESH_MS = 60_000;
const MAX_REFRESH_MS = 10_000;

export type DashboardView = {
  /** The last state the server returned; null until the first answer. */
  state: DashboardState | null;
  /** Why the last request to the server failed; null once it answers again. */
  connectionError: string | null;
};

export type Dashboard = DashboardView & {
  /** Marks a PR seen and reloads the state, so the PR leaves "Чака теб" right away. */
  seen(pr: ClassifiedPullRequest): Promise<void>;
};

/** Reads /api/prs right away and again after every answer, for as long as the component is mounted. */
export function useDashboard(): Dashboard {
  const [view, setView] = useState<DashboardView>({ state: null, connectionError: null });
  const refreshNow = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;

    async function refresh() {
      let delay = FALLBACK_REFRESH_MS;
      try {
        const state = await fetchDashboard();
        setView({ state, connectionError: null });
        // Reading the local API is cheap, so check more often than the server polls GitHub.
        if (state.pollIntervalMs > 0) delay = Math.min(state.pollIntervalMs, MAX_REFRESH_MS);
      } catch (error) {
        setView((view) => ({ ...view, connectionError: (error as Error).message }));
      }
      // A refresh after "видях" may overlap the scheduled one; keep a single timer either way.
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(refresh, delay);
    }

    refreshNow.current = refresh;
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  const fetchedAt = view.state?.fetchedAt ?? null;
  const seen = useCallback(
    async (pr: ClassifiedPullRequest) => {
      try {
        await markSeen(pr, fetchedAt);
      } catch (error) {
        setView((view) => ({ ...view, connectionError: (error as Error).message }));
        return;
      }
      await refreshNow.current();
    },
    [fetchedAt],
  );

  return { ...view, seen };
}
