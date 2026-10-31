// What the issue's detail sheet shows besides its card: when it was opened, updated and closed, and the issue itself by key.

import type { IssueBoardState, StagedIssue } from "./api.js";
import { prKey } from "./detail.js";
import { age } from "./format.js";

/** "отворен преди 2д · обновен преди 3ч", and "· затворен преди …" once it is closed. */
export function issueDates(issue: Pick<StagedIssue, "createdAt" | "updatedAt" | "closedAt">, now: Date = new Date()): string {
  const dates = [`отворен преди ${age(issue.createdAt, now)}`, `обновен преди ${age(issue.updatedAt, now)}`];
  if (issue.closedAt) dates.push(`затворен преди ${age(issue.closedAt, now)}`);
  return dates.join(" · ");
}

/** The issue under `key` (`<repo>#<number>`, as `prKey` makes it) as the state has it now; undefined when it is not there. */
export function findIssue(state: IssueBoardState | null, key: string): StagedIssue | undefined {
  return state?.issues.find((issue) => prKey(issue) === key);
}
