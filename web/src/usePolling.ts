import { useEffect, useRef, useState } from "preact/hooks";
import { type DashboardState, type Demand, type PollMode, requestPoll, setPollMode } from "./api.js";
import type { StreamStatus } from "./events.js";

/** How often the header's "преди N мин" and the rate-limited "Обнови" are looked at again. */
const TICK_MS = 30_000;
/** Focus and visibilitychange come together when I come back; within this long, the second one is not asked for. */
const SAME_MOMENT_MS = 1_000;

/** What the page needs to show and drive the poll mode. */
export type PollingView = {
  /** The time the header and "Обнови" are read at; it moves on every TICK_MS. */
  now: Date;
  /** "Обнови": a poll now, in either mode. */
  pollNow(): void;
  setMode(mode: PollMode): void;
};

function ask(demand: Demand): void {
  requestPoll(demand).catch((error: Error) => console.error(`poll request failed: ${error.message}`));
}

/**
 * The poll mode as the page drives it. In On-demand it asks for a poll whenever the dashboard comes into view: on load,
 * when the stream (re)connects, on window focus and when the tab is shown again. The server decides whether one is due.
 * Switching to On-demand is not such a moment: it only stops the polling.
 */
export function usePolling(state: DashboardState | null, stream: StreamStatus): PollingView {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const lastAsked = useRef(0);
  const askOnShow = () => {
    if (Date.now() - lastAsked.current < SAME_MOMENT_MS) return;
    lastAsked.current = Date.now();
    ask("focus");
  };

  // Once per connection, as soon as its first dashboard says the mode: a load or a reconnect is the dashboard coming into view.
  const connectionSeen = useRef(false);
  const mode = state?.pollMode;
  useEffect(() => {
    if (stream !== "open") {
      connectionSeen.current = false;
      return;
    }
    if (!mode || connectionSeen.current) return;
    connectionSeen.current = true;
    if (mode === "on_demand") askOnShow();
  }, [stream, mode]);

  const onDemand = mode === "on_demand";
  useEffect(() => {
    if (!onDemand) return;
    const onShow = () => document.visibilityState === "visible" && askOnShow();
    addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [onDemand]);

  return {
    now,
    pollNow: () => ask("button"),
    setMode: (next) => {
      setPollMode(next).catch((error: Error) => console.error(`poll mode change failed: ${error.message}`));
    },
  };
}
