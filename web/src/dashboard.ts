// Which dashboard the page shows lives in the URL: `?dashboard=issues` (with `&repo=owner/name`, the tab open) for the
// Issue dashboard, no parameter for the PR dashboard. The view (`?view=table`) is apart and kept across a switch.

import { sameRepo } from "../../src/domain/repos.js";
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

/** The tab to open: the repo asked for if it has one (whatever the case of its name), else the first; none without tabs. */
export function pickRepo(tabs: string[], wanted: string | null): string | null {
  return (wanted !== null ? tabs.find((tab) => sameRepo(tab, wanted)) : undefined) ?? tabs[0] ?? null;
}

/**
 * Where the URL should say the page is, once the Issue dashboard has opened a tab other than the repo asked for (none, one
 * without a tab, or one in another case): there, by the tab's name. Null when the URL says it already, or nothing opened.
 */
export function settledPlace(place: DashboardPlace, tabs: string[]): DashboardPlace | null {
  if (place.dashboard !== "issues") return null;
  const open = pickRepo(tabs, place.repo);
  return open !== null && open !== place.repo ? { dashboard: "issues", repo: open } : null;
}
