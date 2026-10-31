import type { StagedIssue } from "../api.js";
import { count } from "../badges.js";
import { age } from "../format.js";
import { cardLabels } from "../issueBoard.js";
import { labelChip } from "../labels.js";
import { Avatar } from "./Avatar.js";

type IssueCardProps = {
  issue: StagedIssue;
  /** The project hue: stripe and tint. */
  hue: number;
  /** The card's place in its column, which sets its turn in the entrance cascade. */
  index: number;
};

/** The FLIP key of an issue's card, so it glides to its new column when its stage changes. */
export function issueFlipKey(issue: { repo: string; number: number }): string {
  return `issue:${issue.repo}#${issue.number}`;
}

/**
 * An open issue on the Issue dashboard's board: number, age, title, its labels but the stage label, the author, the
 * comment count and the assignees. No repo tag: the tab says the repo, the stripe and tint its project colour.
 * The slot is what moves (entrance, FLIP), as on the PR board.
 */
export function IssueCard({ issue, hue, index }: IssueCardProps) {
  const labels = cardLabels(issue).map(labelChip);
  return (
    <div class="slot" data-flip={issueFlipKey(issue)} style={{ "--ti": index }}>
      <article class="card" style={{ "--rh": hue }}>
        <div class="card-top">
          <a class="num" href={issue.url} target="_blank" rel="noopener">{`#${issue.number}`}</a>
          <span class="age" title={`отворен ${new Date(issue.createdAt).toLocaleString()} · обновен преди ${age(issue.updatedAt)}`}>
            {age(issue.createdAt)}
          </span>
        </div>
        <a class="title" href={issue.url} target="_blank" rel="noopener">
          {issue.title}
        </a>
        {labels.length ? (
          <div class="labels">
            {labels.map(({ name, background, ink }) => (
              <span key={name} class={`lbl ${ink}`} style={{ "--lc": background }}>
                {name}
              </span>
            ))}
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
