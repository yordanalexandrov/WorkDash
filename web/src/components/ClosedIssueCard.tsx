import { useRef } from "preact/hooks";
import type { ClosedIssue } from "../api.js";
import { sheetOpeners } from "../detail.js";
import { age } from "../format.js";
import { issueFlipKey } from "../motion.js";
import { type CardNest, slotClass } from "./ParentHead.js";
import { Avatar } from "./Avatar.js";
import { ClosedAsMark, LabelChips } from "./IssueMarks.js";

type ClosedIssueCardProps = {
  issue: ClosedIssue;
  /** The project hue: stripe and tint. */
  hue: number;
  /** The card's place in its column, which sets its turn in the entrance cascade. */
  index: number;
  /** Opens the detail sheet, growing out of `from`. */
  onOpen(issue: ClosedIssue, from: HTMLElement): void;
  /** Hidden while its sheet is open, so the sheet looks like the card grown. */
  ghost: boolean;
  /** Under its parent's head: a plain group's, or the quiet one of a parent whose sub-issues are in several columns. */
  nest?: CardNest;
};

/**
 * An issue closed within the configured window, in "Затворени": lighter and dashed like a closed PR, with all its labels and
 * how it was closed, completed in `--merged` and not planned in `--muted`. It keeps the FLIP key of its open card, so an
 * issue closed while the board shows glides here from its stage. A click or Enter on it opens its detail sheet.
 */
export function ClosedIssueCard({ issue, hue, index, onOpen, ghost, nest = null }: ClosedIssueCardProps) {
  const slot = useRef<HTMLDivElement>(null);
  return (
    <div ref={slot} class={slotClass(ghost, nest)} data-flip={issueFlipKey(issue)} style={{ "--ti": index }}>
      <article class="card closed opens" style={{ "--rh": hue }} tabIndex={0} {...sheetOpeners(() => onOpen(issue, slot.current!))}>
        <div class="card-top">
          <a class="num" href={issue.url} target="_blank" rel="noopener">{`#${issue.number}`}</a>
          <span class="age" title={`затворен ${new Date(issue.closedAt).toLocaleString()}`}>{`преди ${age(issue.closedAt)}`}</span>
        </div>
        <a class="title" href={issue.url} target="_blank" rel="noopener">
          {issue.title}
        </a>
        {issue.labels.length ? (
          <div class="labels">
            <LabelChips labels={issue.labels} />
          </div>
        ) : null}
        <div class="card-foot">
          <Avatar login={issue.author} title={`автор: ${issue.author}`} />
          <ClosedAsMark closedAs={issue.closedAs} />
        </div>
      </article>
    </div>
  );
}
