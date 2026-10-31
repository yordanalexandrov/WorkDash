import type { ClosedIssue, IssueLabel, StagedIssue } from "../api.js";
import { count } from "../badges.js";
import { age } from "../format.js";
import { cardLabels } from "../issueBoard.js";
import { labelChip } from "../labels.js";
import { issueFlipKey } from "../motion.js";
import { Avatar } from "./Avatar.js";
import { LinkedPrs, MilestoneChip } from "./IssueMarks.js";
import { SectionPill } from "./SectionPill.js";

const none = <span class="dim">·</span>;

/** The label chips in their GitHub colours, as on the card; more than fit wrap onto another line. */
function Labels({ labels }: { labels: IssueLabel[] }) {
  return (
    <span class="tc lbls">
      {labels.length
        ? labels.map(labelChip).map(({ name, background, ink }) => (
            <span key={name} class={`lbl ${ink}`} style={{ "--lc": background }}>
              {name}
            </span>
          ))
        : none}
    </span>
  );
}

type IssueRowProps = {
  issue: StagedIssue;
  /** Its FLIP key in the table: its card's, or that with its group's id when it is in more than one group (`issueRows`). */
  flip: string;
  /** The project hue: stripe and tint. */
  hue: number;
  /** The row's place in the table, which sets its turn in the entrance cascade. */
  index: number;
  /** Whether it is assigned to me, which a quiet "теб" before the title says. */
  mine: boolean;
};

/** An open issue in the table: the facts of its card, one per column ("Anatomy" → Row in docs/design.md), with the same stripe and tint. */
export function IssueRow({ issue, flip, hue, index, mine }: IssueRowProps) {
  return (
    <div role="row" class="trow" data-flip={flip} style={{ "--rh": hue, "--ti": index }}>
      <span class="tc r">
        <a class="num" href={issue.url} target="_blank" rel="noopener">{`#${issue.number}`}</a>
      </span>
      <span class="tc tt">
        {mine ? (
          <span class="me" title="назначен на теб">
            теб
          </span>
        ) : null}
        <a href={issue.url} target="_blank" rel="noopener" title={issue.title}>
          {issue.title}
        </a>
      </span>
      <span class="tc">
        {issue.stage === null ? <SectionPill accent="var(--faint)" label="без етап" /> : <SectionPill accent="var(--blue)" label={issue.stage} title={`етап ${issue.stage}`} />}
      </span>
      <Labels labels={cardLabels(issue)} />
      <span class="tc people" title="назначени">
        {issue.assignees.length ? issue.assignees.map((login) => <Avatar key={login} login={login} title={`назначен: ${login}`} />) : none}
      </span>
      <span class="tc who">
        <Avatar login={issue.author} title={`автор: ${issue.author}`} />
        <span>{issue.author}</span>
      </span>
      <span class="tc c">
        {issue.comments ? (
          <span class="ic muted" title={count(issue.comments, "коментар", "коментара")}>
            {`💬${issue.comments}`}
          </span>
        ) : (
          none
        )}
      </span>
      <span class="tc">{issue.milestone ? <MilestoneChip issue={issue} /> : none}</span>
      <span class="tc">{issue.linkedPullRequests.length ? <LinkedPrs issue={issue} /> : none}</span>
      <span class="tc r">
        <span class="age" title={`отворен ${new Date(issue.createdAt).toLocaleString()}`}>
          {age(issue.createdAt)}
        </span>
      </span>
      <span class="tc r">
        <span class="age" title={`обновен ${new Date(issue.updatedAt).toLocaleString()}`}>
          {age(issue.updatedAt)}
        </span>
      </span>
    </div>
  );
}

/**
 * An issue closed within the configured window, as a row: lighter and dashed like a closed PR's, with all its labels, and how
 * it was closed where the people and marks would be, completed in `--merged` and not planned in `--muted`.
 */
export function ClosedIssueRow({ issue, hue, index }: { issue: ClosedIssue; hue: number; index: number }) {
  const completed = issue.closedAs === "completed";
  return (
    <div role="row" class="trow closedrow" data-flip={issueFlipKey(issue)} style={{ "--rh": hue, "--ti": index }}>
      <span class="tc r">
        <a class="num" href={issue.url} target="_blank" rel="noopener">{`#${issue.number}`}</a>
      </span>
      <span class="tc tt">
        <a href={issue.url} target="_blank" rel="noopener" title={issue.title}>
          {issue.title}
        </a>
      </span>
      <span class="tc">
        <SectionPill accent={completed ? "var(--merged)" : "var(--muted)"} label={completed ? "завършен" : "не е планиран"} />
      </span>
      <Labels labels={issue.labels} />
      <span class="tc" />
      <span class="tc who">
        <Avatar login={issue.author} title={`автор: ${issue.author}`} />
        <span>{issue.author}</span>
      </span>
      <span class="tc span3">
        <span class={`closed-st ${completed ? "merged" : "muted"}`}>{completed ? "🎉 завършен" : "не е планиран"}</span>
      </span>
      <span class="tc r span2">
        <span class="age" title={`затворен ${new Date(issue.closedAt).toLocaleString()}`}>{`преди ${age(issue.closedAt)}`}</span>
      </span>
    </div>
  );
}
