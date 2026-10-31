import type { ClosedAs, Issue, IssueLabel } from "../../../src/domain/issues.js";
import { closedAsMark, linkedPrMark, milestoneMark, stageMark } from "../issueMarks.js";
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
