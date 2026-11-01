import { issueKey } from "../../src/domain/repos.js";
import type { ClosedIssue, IssueBoardState, IssueLabel, StagedIssue } from "./api.js";
import type { ColumnHead } from "./column.js";
import { stageMark } from "./issueMarks.js";

/** One column of the Issue dashboard's board: "Без етап" or a stage and the open issues in it, or "Затворени" and the closed ones. */
export type IssueColumn = ColumnHead & ({ closed: false; items: StagedIssue[] } | { closed: true; items: ClosedIssue[] });

/** The column of the issues without a stage. */
const NO_STAGE = "none";

/**
 * The board's columns: "Без етап" first, then one per stage label in the configured order, titled with the label's name,
 * and "Затворени" last, in the closed accent of the PR board. Each holds its issues in the order given (the most recently
 * updated first, the most recently closed for "Затворени"); counts are of what is given.
 */
export function issueColumns(state: Pick<IssueBoardState, "stages" | "issues" | "closed">): IssueColumn[] {
  const column = (id: string, title: string, accent: string, items: StagedIssue[]): IssueColumn => ({ id, title, accent, count: items.length, hot: false, closed: false, items });
  return [
    column(NO_STAGE, "Без етап", stageMark(null).accent, state.issues.filter((issue) => issue.stage === null)),
    ...state.stages.map((stage) => column(`stage:${stage}`, stage, stageMark(stage).accent, state.issues.filter((issue) => issue.stage === stage))),
    { id: "closed", title: "Затворени", accent: "var(--merged)", count: state.closed.length, hot: false, closed: true, items: state.closed },
  ];
}

/** The labels a card shows: all but its stage label, which the column already says. */
export function cardLabels(issue: StagedIssue): IssueLabel[] {
  const stage = issue.stage?.toLowerCase();
  return issue.labels.filter((label) => label.name.toLowerCase() !== stage);
}

/** The parent of a sub-issue, as an issue carries it. */
type Parent = NonNullable<StagedIssue["parent"]>;

/**
 * A run of a column's cards: an issue without a parent, or the sub-issues of one parent in that column under the parent's
 * head. `spread` says the parent's sub-issues are in more than one column, so its head is a quiet one; `led` that the
 * parent's own card is right above them, so the head need not name it.
 */
export type CardRun<T> = { kind: "issue"; issue: T } | { kind: "parent"; key: string; parent: Parent; items: T[]; spread: boolean; led: boolean };

/** The parents (by `issueKey`) whose sub-issues are in more than one of the columns given. */
export function spreadParents(columns: { items: { parent: Parent | null }[] }[]): Set<string> {
  const seen = new Map<string, number>();
  const spread = new Set<string>();
  columns.forEach((column, index) => {
    for (const { parent } of column.items) {
      if (!parent) continue;
      const key = issueKey(parent);
      const first = seen.get(key);
      if (first === undefined) seen.set(key, index);
      else if (first !== index) spread.add(key);
    }
  });
  return spread;
}

/**
 * A column's issues as runs: the sub-issues of one parent together under it, right after the parent's own card when the
 * column has it (and it is no one's sub-issue), else where the first of them is in the order given; an issue without a
 * parent where it is.
 */
export function parentRuns<T extends { repo: string; number: number; parent: Parent | null }>(items: T[], spread: ReadonlySet<string>): CardRun<T>[] {
  type Group = Extract<CardRun<T>, { kind: "parent" }>;
  const groups = new Map<string, Group>();
  for (const issue of items) {
    if (!issue.parent) continue;
    const key = issueKey(issue.parent);
    const group = groups.get(key);
    if (group) group.items.push(issue);
    else groups.set(key, { kind: "parent", key, parent: issue.parent, items: [issue], spread: spread.has(key), led: false });
  }
  const leads = new Set(items.filter((issue) => !issue.parent && groups.has(issueKey(issue))).map((issue) => issueKey(issue)));
  const runs: CardRun<T>[] = [];
  const placed = new Set<string>();
  const place = (key: string) => {
    if (placed.has(key)) return;
    placed.add(key);
    const group = groups.get(key)!;
    group.led = leads.has(key);
    runs.push(group);
  };
  for (const issue of items) {
    if (!issue.parent) {
      runs.push({ kind: "issue", issue });
      if (leads.has(issueKey(issue))) place(issueKey(issue));
      continue;
    }
    const key = issueKey(issue.parent);
    if (!leads.has(key)) place(key);
  }
  return runs;
}
