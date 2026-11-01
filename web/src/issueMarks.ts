// The marks of an issue that the card, the table row and the detail sheet all show.

import { sameLogin } from "../../src/domain/activity.js";
import type { ClosedAs, Issue, IssueDependencies, LinkedPullRequest, LinkedPullRequestStatus, Milestone, SubIssueProgress } from "../../src/domain/issues.js";
import { count } from "./badges.js";
import { shortRepo } from "./format.js";
import { sameRepo } from "../../src/domain/repos.js";

/** A Linked PR as a small chip: "PR" and its number (with the repo when it is another), its status colour, a link to GitHub. */
export type LinkedPrMark = { text: string; kind: "ok" | "muted" | "merged" | "bad"; title: string; url: string };

// Status colours, as GitHub draws a PR: open green, draft grey, merged violet, closed red.
const KINDS: Record<LinkedPullRequestStatus, LinkedPrMark["kind"]> = { open: "ok", draft: "muted", merged: "merged", closed: "bad" };
const WORDS: Record<LinkedPullRequestStatus, string> = { open: "отворен", draft: "draft", merged: "merged", closed: "затворен" };

/** The mark of a Linked PR on an issue of `issueRepo`. */
export function linkedPrMark(pr: LinkedPullRequest, issueRepo: string): LinkedPrMark {
  const own = sameRepo(pr.repo, issueRepo);
  return {
    text: own ? `PR #${pr.number}` : `PR ${shortRepo(pr.repo)}#${pr.number}`,
    kind: KINDS[pr.status],
    title: `PR ${own ? "" : pr.repo}#${pr.number} · ${WORDS[pr.status]}`,
    url: pr.url,
  };
}

/** Whether the issue is assigned to the viewer, which the card marks "теб"; never before the viewer is known. */
export function assignedToMe(issue: Pick<Issue, "assignees">, viewer: string | null): boolean {
  return viewer !== null && issue.assignees.some((login) => sameLogin(login, viewer));
}

/** An issue's stage as its pill draws it: a stage in `--blue` with the label's name, none in `--faint` as "без етап". */
export function stageMark(stage: string | null): { accent: string; label: string; title: string } {
  return stage === null ? { accent: "var(--faint)", label: "без етап", title: "без етап" } : { accent: "var(--blue)", label: stage, title: `етап ${stage}` };
}

/** How a closed issue was closed, as its card, row and sheet say it: completed in `--merged`, not planned in `--muted`. */
export function closedAsMark(closedAs: ClosedAs): { kind: "merged" | "muted"; text: string } {
  return closedAs === "completed" ? { kind: "merged", text: "🎉 завършен" } : { kind: "muted", text: "не е планиран" };
}

/**
 * How far the sub-issues are, "3/9" (completed of all), and whether all are done; nothing for an issue without sub-issues.
 * The chip puts its ☑ before it in CSS (`.subs::before`); a graph node shows it bare.
 */
export function subIssuesMark(progress: SubIssueProgress): { text: string; title: string; done: boolean } | null {
  if (!progress.total) return null;
  const { total, completed } = progress;
  return { text: `${completed}/${total}`, title: `sub-issues: ${completed} от ${total} завършени`, done: completed === total };
}

/** The quiet "блокиран" of an issue with an open blocker, saying by how many on hover; nothing when it has none open. */
export function blockedMark(dependencies: IssueDependencies): { text: string; title: string } | null {
  const mark = blockedCountMark(dependencies);
  return mark && { text: "блокиран", title: mark.title };
}

/** The table's "блокиран от": how many open blockers the issue has (what it sorts by), and so on hover; nothing for none. */
export function blockedCountMark(dependencies: IssueDependencies): { text: string; title: string } | null {
  if (!dependencies.blockedBy) return null;
  return { text: String(dependencies.blockedBy), title: `блокиран от ${count(dependencies.blockedBy, "отворен issue", "отворени issues")}` };
}

/** The milestone's chip: its name, with its due date (GitHub's day, in UTC) on hover. */
export function milestoneMark(milestone: Milestone): { text: string; title: string } {
  const due = milestone.dueOn ? `срок ${dueDay(milestone.dueOn)}` : "без срок";
  return { text: milestone.title, title: `milestone ${milestone.title} · ${due}` };
}

function dueDay(iso: string): string {
  const date = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(date.getUTCDate())}.${two(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}
