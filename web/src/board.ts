import type { ClosedPullRequest, DashboardPullRequest, DashboardState, Section } from "./api.js";
import type { ColumnHead } from "./column.js";
import { sectionTitle } from "./format.js";

export type ColumnId = Section | "closed";

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

/** The board's columns: the sections in workflow order, then the recently closed PRs; counts are of what is given, so of what the filter kept. */
export function boardColumns(state: Pick<DashboardState, "sections" | "recentlyClosed">): BoardColumn[] {
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
