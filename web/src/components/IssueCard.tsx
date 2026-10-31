import { useRef } from "preact/hooks";
import type { StagedIssue } from "../api.js";
import { count } from "../badges.js";
import { sheetOpeners } from "../detail.js";
import { age } from "../format.js";
import { cardLabels } from "../issueBoard.js";
import { issueFlipKey } from "../motion.js";
import { Avatar } from "./Avatar.js";
import { LabelChips, LinkedPrs, MeChip, MilestoneChip } from "./IssueMarks.js";

type IssueCardProps = {
  issue: StagedIssue;
  /** The project hue: stripe and tint. */
  hue: number;
  /** The card's place in its column, which sets its turn in the entrance cascade. */
  index: number;
  /** Whether it is assigned to me, which a quiet "теб" says; it never pulses. */
  mine: boolean;
  /** Opens the detail sheet, growing out of `from`. */
  onOpen(issue: StagedIssue, from: HTMLElement): void;
  /** Hidden while its sheet is open, so the sheet looks like the card grown. */
  ghost: boolean;
};

/**
 * An open issue on the Issue dashboard's board: number, age, title, its labels but the stage label, the author, the
 * comment count and the assignees; its milestone and Linked PRs when it has them, and "теб" when it is mine. No repo tag: the tab says the repo, the stripe and tint its project colour.
 * The slot is what moves (entrance, FLIP), as on the PR board. A click or Enter on it opens its detail sheet.
 */
export function IssueCard({ issue, hue, index, mine, onOpen, ghost }: IssueCardProps) {
  const slot = useRef<HTMLDivElement>(null);
  const labels = cardLabels(issue);
  return (
    <div ref={slot} class={ghost ? "slot ghost" : "slot"} data-flip={issueFlipKey(issue)} style={{ "--ti": index }}>
      <article class="card opens" style={{ "--rh": hue }} tabIndex={0} {...sheetOpeners(() => onOpen(issue, slot.current!))}>
        <div class="card-top">
          <a class="num" href={issue.url} target="_blank" rel="noopener">{`#${issue.number}`}</a>
          {mine ? <MeChip /> : null}
          <span class="age" title={`отворен ${new Date(issue.createdAt).toLocaleString()} · обновен преди ${age(issue.updatedAt)}`}>
            {age(issue.createdAt)}
          </span>
        </div>
        <a class="title" href={issue.url} target="_blank" rel="noopener">
          {issue.title}
        </a>
        {labels.length ? (
          <div class="labels">
            <LabelChips labels={labels} />
          </div>
        ) : null}
        {issue.milestone || issue.linkedPullRequests.length ? (
          <div class="issue-meta">
            <MilestoneChip issue={issue} />
            <LinkedPrs issue={issue} />
          </div>
        ) : null}
        <div class="card-foot">
          <Avatar login={issue.author} title={`автор: ${issue.author}`} />
          {issue.comments ? (
            <span class="ic muted" title={count(issue.comments, "коментар", "коментара")}>
              {`💬 ${issue.comments}`}
            </span>
          ) : null}
          <div class="people" title="назначени">
            {issue.assignees.map((login) => (
              <Avatar key={login} login={login} title={`назначен: ${login}`} />
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}
