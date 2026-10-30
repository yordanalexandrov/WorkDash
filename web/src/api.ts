import type { ClassifiedPullRequest, Section } from "../../src/domain/classify.js";

export type { ClassifiedPullRequest, Section };

export type SectionOfPullRequests = { section: Section; pullRequests: ClassifiedPullRequest[] };

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
