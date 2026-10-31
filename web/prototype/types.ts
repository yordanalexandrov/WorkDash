// PROTOTYPE: throwaway layout exploration for the dashboard, see README.md. Not shipped.
import type { JSX } from "preact";
import type { DashboardPullRequest, DashboardState } from "../src/api.js";

export type VariantProps = {
  /** The real /api/prs body, frozen in snapshot.json. */
  state: DashboardState;
  /** Stub: drops the PR from "Чака теб" in memory, no request to the server. */
  onSeen(pr: DashboardPullRequest): void;
};

export type Variant = { key: string; name: string; View: (props: VariantProps) => JSX.Element };
