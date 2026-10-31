import type { ClosedIssue } from "../api.js";
import { age } from "../format.js";
import { labelChip } from "../labels.js";
import { issueFlipKey } from "../motion.js";
import { Avatar } from "./Avatar.js";

type ClosedIssueCardProps = {
  issue: ClosedIssue;
  /** The project hue: stripe and tint. */
  hue: number;
  /** The card's place in its column, which sets its turn in the entrance cascade. */
  index: number;
};

/**
 * An issue closed within the configured window, in "Затворени": lighter and dashed like a closed PR, with all its labels and
 * how it was closed, completed in `--merged` and not planned in `--muted`. It keeps the FLIP key of its open card, so an
 * issue closed while the board shows glides here from its stage.
 */
export function ClosedIssueCard({ issue, hue, index }: ClosedIssueCardProps) {
  const completed = issue.closedAs === "completed";
  const labels = issue.labels.map(labelChip);
  return (
    <div class="slot" data-flip={issueFlipKey(issue)} style={{ "--ti": index }}>
      <article class="card closed" style={{ "--rh": hue }}>
        <div class="card-top">
          <a class="num" href={issue.url} target="_blank" rel="noopener">{`#${issue.number}`}</a>
          <span class="age" title={`затворен ${new Date(issue.closedAt).toLocaleString()}`}>{`преди ${age(issue.closedAt)}`}</span>
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
          <span class={`closed-st ${completed ? "merged" : "muted"}`}>{completed ? "🎉 завършен" : "не е планиран"}</span>
        </div>
      </article>
    </div>
  );
}
