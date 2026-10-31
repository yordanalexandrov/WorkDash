// Which dashboard the page shows lives in the URL: `?dashboard=issues` (with `&repo=owner/name`, the tab open) for the
// Issue dashboard, no parameter for the PR dashboard. The view (`?view=table`) is apart and kept across a switch.

import { shortRepo } from "./format.js";

export type Dashboard = "prs" | "issues";

/** The dashboard shown and, on the Issue dashboard, the repo of the tab asked for (it may have no tab). */
export type DashboardPlace = { dashboard: Dashboard; repo: string | null };

/** The dashboard and repo a URL's query asks for; anything but `dashboard=issues` is the PR dashboard, which has no repo. */
export function readDashboard(search: string): DashboardPlace {
  const params = new URLSearchParams(search);
  if (params.get("dashboard") !== "issues") return { dashboard: "prs", repo: null };
  return { dashboard: "issues", repo: params.get("repo") || null };
}

/** The URL with the dashboard and repo in it; the PR dashboard drops both parameters, every other one stays. */
export function writeDashboard(url: string, place: DashboardPlace): string {
  const next = new URL(url);
  next.searchParams.delete("dashboard");
  next.searchParams.delete("repo");
  if (place.dashboard === "issues") {
    next.searchParams.set("dashboard", "issues");
    if (place.repo) next.searchParams.set("repo", place.repo);
  }
  return next.href;
}

/** The Issue dashboard's tabs: the repos whose issues are on, by the name a tab shows, then by owner. */
export function issueTabs(issueRepos: string[]): string[] {
  return [...issueRepos].sort((a, b) => shortRepo(a).localeCompare(shortRepo(b)) || a.localeCompare(b));
}

/** The tab to open: the repo asked for if it has one, else the first; none without tabs. */
export function pickRepo(tabs: string[], wanted: string | null): string | null {
  return wanted !== null && tabs.includes(wanted) ? wanted : (tabs[0] ?? null);
}
