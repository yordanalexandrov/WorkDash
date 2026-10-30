import type { ClassifiedPullRequest, Section } from "../../src/domain/classify.js";
import type { PollError } from "../../src/domain/poll-error.js";

export type { ClassifiedPullRequest, PollError, Section };

export type SectionOfPullRequests = { section: Section; pullRequests: ClassifiedPullRequest[] };

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
  sections: SectionOfPullRequests[];
};
