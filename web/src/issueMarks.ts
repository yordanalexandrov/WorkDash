// The marks of an issue that the card, the table row and the detail sheet all show.

import { sameLogin } from "../../src/domain/activity.js";
import type { Issue, LinkedPullRequest, LinkedPullRequestStatus, Milestone } from "../../src/domain/issues.js";
import { shortRepo } from "./format.js";

/** A Linked PR as a small chip: its number (with the repo when it is another), its status colour, a link to GitHub. */
export type LinkedPrMark = { text: string; kind: "ok" | "muted" | "merged" | "bad"; title: string; url: string };

// Status colours, as GitHub draws a PR: open green, draft grey, merged violet, closed red.
const KINDS: Record<LinkedPullRequestStatus, LinkedPrMark["kind"]> = { open: "ok", draft: "muted", merged: "merged", closed: "bad" };
const WORDS: Record<LinkedPullRequestStatus, string> = { open: "отворен", draft: "draft", merged: "merged", closed: "затворен" };

/** The mark of a Linked PR on an issue of `issueRepo`. */
export function linkedPrMark(pr: LinkedPullRequest, issueRepo: string): LinkedPrMark {
  const own = pr.repo.toLowerCase() === issueRepo.toLowerCase();
  return {
    text: own ? `#${pr.number}` : `${shortRepo(pr.repo)}#${pr.number}`,
    kind: KINDS[pr.status],
    title: `PR ${own ? "" : pr.repo}#${pr.number} · ${WORDS[pr.status]}`,
    url: pr.url,
  };
}

/** Whether the issue is assigned to the viewer, which the card marks "теб"; never before the viewer is known. */
export function assignedToMe(issue: Pick<Issue, "assignees">, viewer: string | null): boolean {
  return viewer !== null && issue.assignees.some((login) => sameLogin(login, viewer));
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
