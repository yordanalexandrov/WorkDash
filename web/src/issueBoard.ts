import type { ClosedIssue, IssueBoardState, IssueLabel, StagedIssue } from "./api.js";
import type { ColumnHead } from "./column.js";

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
    column(NO_STAGE, "Без етап", "var(--faint)", state.issues.filter((issue) => issue.stage === null)),
    ...state.stages.map((stage) => column(`stage:${stage}`, stage, "var(--blue)", state.issues.filter((issue) => issue.stage === stage))),
    { id: "closed", title: "Затворени", accent: "var(--merged)", count: state.closed.length, hot: false, closed: true, items: state.closed },
  ];
}

/** The labels a card shows: all but its stage label, which the column already says. */
export function cardLabels(issue: StagedIssue): IssueLabel[] {
  const stage = issue.stage?.toLowerCase();
  return issue.labels.filter((label) => label.name.toLowerCase() !== stage);
}
