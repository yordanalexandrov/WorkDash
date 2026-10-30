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
  /** Why the config.yaml on disk is not in effect; the last valid config still is. */
  configError: string | null;
  sections: SectionOfPullRequests[];
};

/** Marks a PR seen as of `fetchedAt`, the snapshot the page showed when I clicked "видях". */
export async function markSeen(pr: { repo: string; number: number }, fetchedAt: string | null): Promise<void> {
  const response = await fetch("/api/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: pr.repo, number: pr.number, ...(fetchedAt ? { at: fetchedAt } : {}) }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export async function fetchDashboard(): Promise<DashboardState> {
  const response = await fetch("/api/prs");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as DashboardState;
}
