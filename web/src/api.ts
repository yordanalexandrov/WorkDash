import type { ClassifiedPullRequest, Section } from "../../src/domain/classify.js";
import type { JiraLink } from "../../src/domain/jira.js";

export type { ClassifiedPullRequest, JiraLink, Section };

/** A PR as /api/prs serves it: classified, with links to the Jira tickets it names. */
export type DashboardPullRequest = ClassifiedPullRequest & { jira: JiraLink[] };

export type SectionOfPullRequests = { section: Section; pullRequests: DashboardPullRequest[] };

/** The body of GET /api/prs. */
export type DashboardState = {
  viewer: string | null;
  fetchedAt: string | null;
  pollIntervalMs: number;
  error: string | null;
  sections: SectionOfPullRequests[];
};

export async function fetchDashboard(): Promise<DashboardState> {
  const response = await fetch("/api/prs");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as DashboardState;
}
