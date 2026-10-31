import type { Issue } from "../../../src/domain/issues.js";
import { linkedPrMark, milestoneMark } from "../issueMarks.js";

/** The issue's milestone as a quiet chip, its due date on hover; nothing when it has none. */
export function MilestoneChip({ issue }: { issue: Pick<Issue, "milestone"> }) {
  if (!issue.milestone) return null;
  const { text, title } = milestoneMark(issue.milestone);
  return (
    <span class="ms" title={title}>
      {text}
    </span>
  );
}

/** The issue's Linked PRs, each a link to GitHub in its status colour; nothing when it has none. */
export function LinkedPrs({ issue }: { issue: Pick<Issue, "repo" | "linkedPullRequests"> }) {
  if (!issue.linkedPullRequests.length) return null;
  return (
    <span class="linked">
      {issue.linkedPullRequests.map((pr) => {
        const { text, kind, title, url } = linkedPrMark(pr, issue.repo);
        return (
          <a key={url} class={`ic ${kind}`} href={url} target="_blank" rel="noopener" title={title}>
            {text}
          </a>
        );
      })}
    </span>
  );
}
