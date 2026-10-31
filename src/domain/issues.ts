// The Issue dashboard's domain: the issues of one repo as a poll fetches them, and the stage each one is in.

import type { PollError } from "./poll-error.js";

/** The stage labels from config.yaml: the common list, and the repos that have a list of their own. */
export type IssuesConfig = {
  columns: string[];
  repos: Record<string, { columns: string[] }>;
};

/** A GitHub label: its name and its colour as GitHub gives it, six hex digits without "#". */
export type IssueLabel = { name: string; color: string };

/** An open issue of a followed repo. */
export type Issue = {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  labels: IssueLabel[];
  assignees: string[];
  /** How many comments it has. */
  comments: number;
  createdAt: string;
  updatedAt: string;
};

/** The issues of one repo as one poll fetched them: the most recently updated open ones, and how many are open in all. */
export type IssueSnapshot = {
  repo: string;
  issues: Issue[];
  /** Every open issue of the repo, of which `issues` holds at most the 100 most recently updated. */
  totalCount: number;
};

/** An issue with the stage it is in: one of the repo's stage labels, or null for "Без етап". */
export type StagedIssue = Issue & { stage: string | null };

/** What GET /api/issues returns and the `issues` event carries: the open repo's issues, by stage, and how its poll goes. */
export type IssueBoardState = {
  repo: string;
  /** When the last successful poll of the repo fetched its issues; null before the first. */
  fetchedAt: string | null;
  /** The repo's stage labels in the order of the columns, after "Без етап". */
  stages: string[];
  issues: StagedIssue[];
  /** How many issues are open in all; more than `issues.length` when the repo has more than one page. */
  totalCount: number;
  /** Whether a poll of the repo is under way. */
  polling: boolean;
  /** Why the last poll of the repo failed; null when it succeeded or none has run. */
  error: PollError | null;
};

/** The stage labels of `repo`: its own list when config.yaml gives it one, else the common list. */
export function stagesFor(config: IssuesConfig, repo: string): string[] {
  const wanted = repo.toLowerCase();
  const own = Object.entries(config.repos).find(([name]) => name.toLowerCase() === wanted);
  return own ? own[1].columns : config.columns;
}

/**
 * The stage an issue is in: of its labels that are stages, the last by the order of `stages`; null when it has none.
 * GitHub treats label names without regard to case, and so does this.
 */
export function stageOf(issue: Pick<Issue, "labels">, stages: string[]): string | null {
  const names = new Set(issue.labels.map((label) => label.name.toLowerCase()));
  return stages.findLast((stage) => names.has(stage.toLowerCase())) ?? null;
}
