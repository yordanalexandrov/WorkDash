// What the toolbar filter looks at in an issue (see filter.ts), and the Issue dashboard's columns narrowed by it.

import { sameLogin } from "../../src/domain/activity.js";
import type { StagedIssue } from "./api.js";
import type { ColumnHead } from "./column.js";
import { type Filter, matchesQuery } from "./filter.js";

/**
 * What of an issue the filter looks at. Every column's items have the number and title; the rest counts when the item
 * has it (a milestone only once it is set), so the same filter serves every column the board shows.
 */
type Filterable = Pick<StagedIssue, "number" | "title"> & Partial<Pick<StagedIssue, "labels" | "assignees">> & { milestone?: { title: string } | null };

/** What the text filter searches in an issue: its number (with or without #), title, labels, assignees and milestone. */
export function issueTexts(issue: Filterable): string[] {
  const texts = [String(issue.number), `#${issue.number}`, issue.title, ...(issue.labels ?? []).map((label) => label.name), ...(issue.assignees ?? [])];
  return issue.milestone ? [...texts, issue.milestone.title] : texts;
}

/** Whether the filter keeps an issue: "само моите" keeps the ones assigned to me (none before it is known who I am), and the text has to match too. */
function keeps(issue: Filterable, filter: Filter, viewer: string | null): boolean {
  const mine = !filter.mine || (viewer !== null && (issue.assignees ?? []).some((login) => sameLogin(login, viewer)));
  return mine && matchesQuery(issueTexts(issue), filter.query);
}

/** The issues the filter keeps, in their order. */
export function filterIssues<T extends Filterable>(issues: T[], filter: Filter, viewer: string | null): T[] {
  return issues.filter((issue) => keeps(issue, filter, viewer));
}

/** Every column of the board with only the issues the filter keeps, counted anew, so a column the filter empties folds. */
export function filterIssueColumns<T extends Filterable, C extends ColumnHead & { items: T[] }>(columns: C[], filter: Filter, viewer: string | null): C[] {
  return columns.map((column) => {
    const items = filterIssues(column.items, filter, viewer);
    return { ...column, items, count: items.length };
  });
}
