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
