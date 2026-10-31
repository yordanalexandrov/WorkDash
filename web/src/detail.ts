// What the detail sheet shows of a PR: its description without the template's comments, the latest comments and commits, and the PR itself by key.

import type { DashboardPullRequest, DashboardState, Section } from "./api.js";
import { withoutComments } from "./markdown.js";

/** The description without the HTML comments PR templates leave in it, trimmed; a long one stays whole and scrolls. */
export function cleanBody(body: string): string {
  return withoutComments(body).trim();
}

/** The `n` newest of `list` by the time `at` gives, newest first. */
export function latest<T>(list: readonly T[], n: number, at: (item: T) => string): T[] {
  return [...list].sort((a, b) => Date.parse(at(b)) - Date.parse(at(a))).slice(0, n);
}

/** The key the sheet remembers its PR by: `<repo>#<number>`. */
export function prKey(pr: { repo: string; number: number }): string {
  return `${pr.repo}#${pr.number}`;
}

/** The open PR under `key` and its section, as the state has it now; undefined when it is closed or not on the dashboard. */
export function findOpen(state: DashboardState | null, key: string): { pr: DashboardPullRequest; section: Section } | undefined {
  for (const { section, pullRequests } of state?.sections ?? []) {
    const pr = pullRequests.find((candidate) => prKey(candidate) === key);
    if (pr) return { pr, section };
  }
  return undefined;
}

/** The handlers that open a card's or row's sheet: a click not on a link, a button or the repo tag in it, or Enter on it. */
export function sheetOpeners(open: () => void) {
  return {
    onClick(event: MouseEvent) {
      if (!(event.target instanceof Element && event.target.closest("a, button, .tag"))) open();
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.target !== event.currentTarget) return;
      // Else the same Enter would press ✕, which has the focus by then.
      event.preventDefault();
      open();
    },
  };
}
