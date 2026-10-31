import type { ClosedPullRequest, DashboardPullRequest, DashboardState, Section } from "./api.js";
import { sectionTitle } from "./format.js";

export type ColumnId = Section | "closed";

/** What the head of a column shows; `hot` marks the column that needs me now. */
export type ColumnHead = { id: string; title: string; accent: string; count: number; hot: boolean };

/** One column of the board: its head, and the PRs it holds. */
export type BoardColumn = Omit<ColumnHead, "id"> & (
  | { id: Section; items: DashboardPullRequest[] }
  | { id: "closed"; items: ClosedPullRequest[] }
);

// The section accents from docs/design.md: the top border of the column.
const ACCENT: Record<ColumnId, string> = {
  waiting_on_me: "var(--bad)",
  free_for_review: "var(--blue)",
  ready_to_merge: "var(--ok)",
  waiting_on_others: "var(--pending)",
  team: "var(--faint)",
  closed: "var(--merged)",
};

/** The board's columns: the sections in workflow order, then the recently closed PRs. */
export function boardColumns(state: DashboardState): BoardColumn[] {
  return [
    ...state.sections.map(({ section, pullRequests }): BoardColumn => ({
      id: section,
      title: sectionTitle(section),
      accent: ACCENT[section],
      count: pullRequests.length,
      hot: section === "waiting_on_me" && pullRequests.length > 0,
      items: pullRequests,
    })),
    { id: "closed", title: "Затворени", accent: ACCENT.closed, count: state.recentlyClosed.length, hot: false, items: state.recentlyClosed },
  ];
}

/** Whether a column shows as a narrow strip: folded by hand, else when it is empty. */
export function isStrip(count: number, folded: boolean | undefined): boolean {
  return folded ?? count === 0;
}
