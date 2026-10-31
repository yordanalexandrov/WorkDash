import type { IssueBoardState, IssueLabel, StagedIssue } from "./api.js";
import type { ColumnHead } from "./column.js";

/** One column of the Issue dashboard's board: "Без етап" or a stage, and the issues in it. */
export type IssueColumn = ColumnHead & { items: StagedIssue[] };

/** The column of the issues without a stage. */
const NO_STAGE = "none";

/**
 * The board's columns: "Без етап" first, then one per stage label in the configured order, titled with the label's name.
 * Each holds its issues in the order given (the most recently updated first); counts are of what is given.
 */
export function issueColumns(state: Pick<IssueBoardState, "stages" | "issues">): IssueColumn[] {
  const column = (id: string, title: string, accent: string, items: StagedIssue[]): IssueColumn => ({ id, title, accent, count: items.length, hot: false, items });
  return [
    column(NO_STAGE, "Без етап", "var(--faint)", state.issues.filter((issue) => issue.stage === null)),
    ...state.stages.map((stage) => column(`stage:${stage}`, stage, "var(--blue)", state.issues.filter((issue) => issue.stage === stage))),
  ];
}

/** The labels a card shows: all but its stage label, which the column already says. */
export function cardLabels(issue: StagedIssue): IssueLabel[] {
  const stage = issue.stage?.toLowerCase();
  return issue.labels.filter((label) => label.name.toLowerCase() !== stage);
}
