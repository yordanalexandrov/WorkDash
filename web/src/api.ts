import type { ClassifiedPullRequest, Section } from "../../src/domain/classify.js";
import type { JiraLink } from "../../src/domain/jira.js";
import type { PollError } from "../../src/domain/poll-error.js";
import type { ClosedPullRequest } from "../../src/domain/types.js";

export type { ClassifiedPullRequest, ClosedPullRequest, JiraLink, PollError, Section };

/** A PR as /api/prs serves it: classified, with links to the Jira tickets it names. */
export type DashboardPullRequest = ClassifiedPullRequest & { jira: JiraLink[] };

export type SectionOfPullRequests = { section: Section; pullRequests: DashboardPullRequest[] };

/** The body of GET /api/prs and of the `dashboard` server event. */
export type DashboardState = {
  viewer: string | null;
  /** When the last successful poll fetched the snapshot. */
  fetchedAt: string | null;
  pollIntervalMs: number;
  /** Why the last poll failed; the sections still hold the last good snapshot. */
  error: PollError | null;
  /** What the last successful poll could not fetch whole. */
  problems: string[];
  /** Why the config.yaml on disk is not in effect; the last valid config still is. */
  configError: string | null;
  sections: SectionOfPullRequests[];
  /** Merged or closed PRs within the configured window, most recently closed first; never part of `sections`. */
  recentlyClosed: ClosedPullRequest[];
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
