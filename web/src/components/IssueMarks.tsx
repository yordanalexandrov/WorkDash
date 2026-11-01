import type { ClosedAs, Issue, IssueLabel } from "../../../src/domain/issues.js";
import { blockedCountMark, blockedMark, closedAsMark, linkedPrMark, milestoneMark, stageMark, subIssuesMark } from "../issueMarks.js";
import { labelChip } from "../labels.js";
import { SectionPill } from "./SectionPill.js";

/** The labels as chips in their GitHub colours, the text black or white for contrast (`labelChip`). */
export function LabelChips({ labels }: { labels: IssueLabel[] }) {
  return (
    <>
      {labels.map(labelChip).map(({ name, background, ink }) => (
        <span key={name} class={`lbl ${ink}`} style={{ "--lc": background }}>
          {name}
        </span>
      ))}
    </>
  );
}

/** The quiet outlined "теб" of an issue assigned to me: no colour, no pulse. */
export function MeChip() {
  return (
    <span class="me" title="назначен на теб">
      теб
    </span>
  );
}

/** The issue's stage as a pill (`stageMark`). */
export function StagePill({ stage }: { stage: string | null }) {
  const { accent, label, title } = stageMark(stage);
  return <SectionPill accent={accent} label={label} title={title} />;
}

/** How a closed issue was closed (`closedAsMark`). */
export function ClosedAsMark({ closedAs }: { closedAs: ClosedAs }) {
  const { kind, text } = closedAsMark(closedAs);
  return <span class={`closed-st ${kind}`}>{text}</span>;
}

/** How far the issue's sub-issues are, "☑ 3/9" (the ☑ from `.subs::before`), in `--merged` once all are done (`subIssuesMark`); nothing without sub-issues. */
export function SubIssuesChip({ issue }: { issue: Pick<Issue, "subIssues"> }) {
  const mark = subIssuesMark(issue.subIssues);
  if (!mark) return null;
  return (
    <span class={mark.done ? "subs done" : "subs"} title={mark.title}>
      {mark.text}
    </span>
  );
}

/** The quiet "блокиран" of an issue with an open blocker, in `--pending` and never pulsing (`blockedMark`); nothing without one. */
export function BlockedChip({ issue }: { issue: Pick<Issue, "dependencies"> }) {
  const mark = blockedMark(issue.dependencies);
  if (!mark) return null;
  return (
    <span class="blocked" title={mark.title}>
      {mark.text}
    </span>
  );
}

/** How many open blockers the issue has, the table's "блокиран от", in `--pending` (`blockedCountMark`); nothing without one. */
export function BlockedCount({ issue }: { issue: Pick<Issue, "dependencies"> }) {
  const mark = blockedCountMark(issue.dependencies);
  if (!mark) return null;
  return (
    <span class="blocked-n" title={mark.title}>
      {mark.text}
    </span>
  );
}

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

/** The issue's Linked PRs, each a link to GitHub in its status colour (an open one in whether it can merge); nothing when it has none. */
export function LinkedPrs({ issue }: { issue: Pick<Issue, "repo" | "linkedPullRequests"> }) {
  if (!issue.linkedPullRequests.length) return null;
  return (
    <span class="linked">
      {issue.linkedPullRequests.map((pr) => {
        const { text, kind, struck, title, url } = linkedPrMark(pr, issue.repo);
        return (
          <a key={url} class={`ic ${kind}${struck ? " struck" : ""}`} href={url} target="_blank" rel="noopener" title={title}>
            {text}
          </a>
        );
      })}
    </span>
  );
}
