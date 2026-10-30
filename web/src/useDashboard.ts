import { useState } from "preact/hooks";
import type { DashboardState } from "./api.js";
import type { StreamStatus } from "./events.js";
import { useServerEvent, useStreamStatus } from "./useServerEvents.js";

export type DashboardView = {
  /** The last state the server pushed; null until the first one arrives. It stays while the stream reconnects. */
  state: DashboardState | null;
  stream: StreamStatus;
};

/** The dashboard as the server pushes it over SSE: on connect and after every poll. */
export function useDashboard(): DashboardView {
  const [state, setState] = useState<DashboardState | null>(null);
  useServerEvent("dashboard", setState);
  return { state, stream: useStreamStatus() };
}
