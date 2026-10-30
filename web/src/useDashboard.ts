import { useState } from "preact/hooks";
import { type DashboardState, markSeen } from "./api.js";
import type { StreamStatus } from "./events.js";
import { useServerEvent, useStreamStatus } from "./useServerEvents.js";

export type DashboardView = {
  /** The last state the server pushed; null until the first one arrives. It stays while the stream reconnects. */
  state: DashboardState | null;
  stream: StreamStatus;
  /** Marks a PR seen; the server then pushes the new state, so the PR leaves "Чака теб" right away. */
  seen(pr: { repo: string; number: number }): void;
};

/** The dashboard as the server pushes it over SSE: on connect and after every poll. */
export function useDashboard(): DashboardView {
  const [state, setState] = useState<DashboardState | null>(null);
  useServerEvent("dashboard", setState);
  const seen = (pr: { repo: string; number: number }) => {
    markSeen(pr, state?.fetchedAt ?? null).catch((error: Error) => console.error(`видях failed: ${error.message}`));
  };
  return { state, stream: useStreamStatus(), seen };
}
