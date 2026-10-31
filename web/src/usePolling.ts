import { useEffect, useState } from "preact/hooks";
import { type DashboardState, type Demand, type PollMode, requestPoll, setPollMode } from "./api.js";
import type { StreamStatus } from "./events.js";

/** How often the header's "преди N мин" and the rate-limited "Обнови" are looked at again. */
const TICK_MS = 30_000;

export type PollingView = {
  /** The time the header and "Обнови" are read at; it moves on every TICK_MS. */
  now: Date;
  /** "Обнови": a poll now, in either mode. */
  refresh(): void;
  setMode(mode: PollMode): void;
};

function demand(kind: Demand): void {
  requestPoll(kind).catch((error: Error) => console.error(`poll request failed: ${error.message}`));
}

/**
 * The poll mode as the page drives it. In On-demand it asks for a poll whenever the dashboard comes into view: on load,
 * when the stream (re)connects, on window focus and when the tab is shown again. The server decides whether one is due.
 */
export function usePolling(state: DashboardState | null, stream: StreamStatus): PollingView {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const onDemand = state?.pollMode === "on_demand";
  useEffect(() => {
    if (!onDemand || stream !== "open") return;
    demand("focus");
    const onShow = () => document.visibilityState === "visible" && demand("focus");
    addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [onDemand, stream]);

  return {
    now,
    refresh: () => demand("button"),
    setMode: (mode) => {
      setPollMode(mode).catch((error: Error) => console.error(`poll mode change failed: ${error.message}`));
    },
  };
}
