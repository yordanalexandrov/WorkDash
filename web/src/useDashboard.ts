import { useEffect, useState } from "preact/hooks";
import { type DashboardState, fetchDashboard } from "./api.js";

const FALLBACK_REFRESH_MS = 60_000;
const MAX_REFRESH_MS = 10_000;

export type DashboardView = {
  /** The last state the server returned; null until the first answer. */
  state: DashboardState | null;
  /** Why the last request to the server failed; null once it answers again. */
  connectionError: string | null;
};

/** Reads /api/prs right away and again after every answer, for as long as the component is mounted. */
export function useDashboard(): DashboardView {
  const [view, setView] = useState<DashboardView>({ state: null, connectionError: null });

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
      if (!stopped) timer = setTimeout(refresh, delay);
    }

    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  return view;
}
