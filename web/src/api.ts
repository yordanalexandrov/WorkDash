import type { ClassifiedPullRequest, Section } from "../../src/domain/classify.js";
import type { ClosedPullRequest } from "../../src/domain/types.js";

export type { ClassifiedPullRequest, ClosedPullRequest, Section };

export type SectionOfPullRequests = { section: Section; pullRequests: ClassifiedPullRequest[] };

/** The body of GET /api/prs. */
export type DashboardState = {
  viewer: string | null;
  fetchedAt: string | null;
  pollIntervalMs: number;
  error: string | null;
  sections: SectionOfPullRequests[];
  /** Merged or closed PRs within the configured window, most recently closed first; never part of `sections`. */
  recentlyClosed: ClosedPullRequest[];
};

export async function fetchDashboard(): Promise<DashboardState> {
  const response = await fetch("/api/prs");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as DashboardState;
}
