// What the issue's detail sheet shows besides its card: when it was opened, updated and closed, and the issue itself by key.

import { issueKey } from "../../src/domain/repos.js";
import type { ClosedIssue, IssueBoardState, StagedIssue } from "./api.js";
import { age } from "./format.js";

/** "отворен преди 2д · обновен преди 3ч", and "· затворен преди …" once it is closed. */
export function issueDates(issue: Pick<StagedIssue, "createdAt" | "updatedAt" | "closedAt">, now: Date = new Date()): string {
  const dates = [`отворен преди ${age(issue.createdAt, now)}`, `обновен преди ${age(issue.updatedAt, now)}`];
  if (issue.closedAt) dates.push(`затворен преди ${age(issue.closedAt, now)}`);
  return dates.join(" · ");
}

/** An issue the dashboard shows: open in its stage, or closed within the window. */
export type ShownIssue = StagedIssue | ClosedIssue;

/** Whether the issue shows among the closed ones. */
export const isClosed = (issue: ShownIssue): issue is ClosedIssue => "closedAs" in issue;

/**
 * The issue under `key` (`issueKey`) as the state has it now, open or closed, so an issue that closes while its sheet is
 * open shows closed; undefined when it is in neither.
 */
export function findIssue(state: IssueBoardState | null, key: string): ShownIssue | undefined {
  const byKey = (issue: ShownIssue) => issueKey(issue) === key;
  return state?.issues.find(byKey) ?? state?.closed.find(byKey);
}
