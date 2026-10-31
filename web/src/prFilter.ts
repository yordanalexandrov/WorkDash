// What the toolbar filter looks at in a PR (see filter.ts).

import type { ClosedPullRequest, DashboardPullRequest, DashboardState } from "./api.js";
import { type Filter, type FilterFields, filterItems } from "./filter.js";

/** An open PR is found by title, author, repo, number (with or without #), branch and Jira keys. */
export function prFields(pr: DashboardPullRequest): FilterFields {
  return { repo: pr.repo, author: pr.author, texts: [...closedFields(pr).texts, pr.headRefName, ...pr.jira.map((link) => link.key)] };
}

/** A closed PR is found by title, author, repo and number (with or without #). */
export function closedFields(pr: Pick<ClosedPullRequest, "repo" | "number" | "title" | "author">): FilterFields {
  return { repo: pr.repo, author: pr.author, texts: [pr.title, pr.author, pr.repo, String(pr.number), `#${pr.number}`] };
}

type Shown = Pick<DashboardState, "sections" | "recentlyClosed">;

/** The sections and closed PRs the filter keeps; every section stays, empty or not. */
export function filterDashboard(state: Shown & Pick<DashboardState, "viewer">, filter: Filter): Shown {
  return {
    sections: state.sections.map(({ section, pullRequests }) => ({ section, pullRequests: filterItems(pullRequests, filter, prFields, state.viewer) })),
    recentlyClosed: filterItems(state.recentlyClosed, filter, closedFields, state.viewer),
  };
}
