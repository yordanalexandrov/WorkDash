import type { ClassifiedPullRequest, Section } from "../../src/domain/classify.js";
import type { JiraLink } from "../../src/domain/jira.js";
import type { ClosedPullRequest } from "../../src/domain/types.js";

export type { ClassifiedPullRequest, ClosedPullRequest, JiraLink, Section };

/** A PR as /api/prs serves it: classified, with links to the Jira tickets it names. */
export type DashboardPullRequest = ClassifiedPullRequest & { jira: JiraLink[] };

export type SectionOfPullRequests = { section: Section; pullRequests: DashboardPullRequest[] };

/** The body of GET /api/prs. */
export type DashboardState = {
  viewer: string | null;
  fetchedAt: string | null;
  pollIntervalMs: number;
  error: string | null;
  /** Why the config.yaml on disk is not in effect; the last valid config still is. */
  configError: string | null;
  sections: SectionOfPullRequests[];
  /** Merged or closed PRs within the configured window, most recently closed first; never part of `sections`. */
  recentlyClosed: ClosedPullRequest[];
};

export async function fetchDashboard(): Promise<DashboardState> {
  const response = await fetch("/api/prs");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as DashboardState;
}
