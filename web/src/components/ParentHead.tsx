import { sameRepo } from "../../../src/domain/repos.js";
import type { IssueLabel } from "../api.js";
import { shortRepo } from "../format.js";
import type { CardRun } from "../issueBoard.js";
import { LabelChips } from "./IssueMarks.js";

/** The class of a card's slot: hidden while its sheet is open, indented on a dashed rail under its parent's head. */
export function slotClass(ghost: boolean, nested: boolean): string {
  return `slot${ghost ? " ghost" : ""}${nested ? " nested" : ""}`;
}

type ParentHeadProps = {
  run: Extract<CardRun<unknown>, { kind: "parent" }>;
  /** The open repo, so a parent of another repo says its repo. */
  repo: string;
  /** The parent's labels, when the board has the parent; none else. */
  labels: IssueLabel[];
  /** Unique on the board: the column's id and the parent's key. */
  id: string;
  shut: boolean;
  /** Its place in the column, which sets its turn in the entrance cascade. */
  index: number;
  onToggle(): void;
};

/**
 * The quiet head of a parent's sub-issues in a column: ▾, what it says, the count; a click folds or unfolds them. Right
 * under the parent's own card it says only "sub-issues"; in a column without the parent it says the parent's `#n` and
 * labels (its title on hover) on a faint fill, which tells that the parent is elsewhere.
 */
export function ParentHead({ run, repo, labels, id, shut, index, onToggle }: ParentHeadProps) {
  const { parent, items, led } = run;
  const number = `${sameRepo(parent.repo, repo) ? "" : shortRepo(parent.repo)}#${parent.number}`;
  return (
    <div
      class={`phead${led ? "" : " away"}${shut ? " shut" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={!shut}
      data-flip={`pg:${id}`}
      style={{ "--ti": index }}
      title={`${shut ? "Разгъни" : "Сгъни"} sub-issues на ${number} ${parent.title}`}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onToggle();
      }}
    >
      <span class="caret" aria-hidden="true">
        ▾
      </span>
      {led ? (
        <span class="ptitle">sub-issues</span>
      ) : (
        <span class="ptitle">
          <span class="pnum">{number}</span>
          <LabelChips labels={labels} />
        </span>
      )}
      <span class="pcount">{items.length}</span>
    </div>
  );
}
