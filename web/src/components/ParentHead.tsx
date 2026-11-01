import { sameRepo } from "../../../src/domain/repos.js";
import { shortRepo } from "../format.js";
import type { CardRun } from "../issueBoard.js";

/** How a card sits under its parent's head: in a plain group, in a quiet one, or on its own. */
export type CardNest = "group" | "quiet" | null;

/** The class of a card's slot: hidden while its sheet is open, indented under its parent's head. */
export function slotClass(ghost: boolean, nest: CardNest): string {
  return `slot${ghost ? " ghost" : ""}${nest ? ` nested ${nest}` : ""}`;
}

type ParentHeadProps = {
  run: Extract<CardRun<unknown>, { kind: "parent" }>;
  /** The open repo, so a parent of another repo says its repo. */
  repo: string;
  /** Unique on the board: the column's id and the parent's key. */
  id: string;
  shut: boolean;
  /** Its place in the column, which sets its turn in the entrance cascade. */
  index: number;
  onToggle(): void;
};

/**
 * The head of a parent's sub-issues in a column: ▾, `#n` and the parent's title, the count; a click folds or unfolds them.
 * Right under the parent's own card it says only "sub-issues". When the parent's sub-issues are in several columns it is
 * a quiet one, small and faint, in each of them.
 */
export function ParentHead({ run, repo, id, shut, index, onToggle }: ParentHeadProps) {
  const { parent, items, spread, led } = run;
  const number = `${sameRepo(parent.repo, repo) ? "" : shortRepo(parent.repo)}#${parent.number}`;
  return (
    <div
      class={`phead${spread ? " quiet" : ""}${shut ? " shut" : ""}`}
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
        <>
          <span class="pnum">{number}</span>
          <span class="ptitle">{parent.title}</span>
        </>
      )}
      <span class="pcount">{items.length}</span>
    </div>
  );
}
