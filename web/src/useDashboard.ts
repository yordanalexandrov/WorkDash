import { useState } from "preact/hooks";
import { type DashboardState, markSeen } from "./api.js";
import type { StreamStatus } from "./events.js";
import { afterMotion } from "./motion.js";
import { useServerEvent, useStreamStatus } from "./useServerEvents.js";

export type DashboardView = {
  /** The last state the server pushed; null until the first one arrives. It stays while the stream reconnects. */
  state: DashboardState | null;
  stream: StreamStatus;
  /** Marks a PR seen; the server then pushes the new state, so the PR leaves "Чака теб" right away. Rejects if the server refused. */
  seen(pr: { repo: string; number: number }): Promise<void>;
};

/** The dashboard as the server pushes it over SSE: on connect and after every poll, held back while a card animates out. */
export function useDashboard(): DashboardView {
  const [state, setState] = useState<DashboardState | null>(null);
  useServerEvent("dashboard", (next) => afterMotion(() => setState(next)));
  const seen = (pr: { repo: string; number: number }) =>
    markSeen(pr, state?.fetchedAt ?? null).catch((error: Error) => {
      console.error(`видях failed: ${error.message}`);
      throw error;
    });
  return { state, stream: useStreamStatus(), seen };
}
