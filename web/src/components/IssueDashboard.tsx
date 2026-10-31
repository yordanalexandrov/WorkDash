import type { RefObject } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useMemo, useRef } from "preact/hooks";
import type { IssueBoardState } from "../api.js";
import { issueTabs, pickRepo } from "../dashboard.js";
import { confetti, middleOf, newlyCompleted } from "../effects.js";
import type { Filter } from "../filter.js";
import { shortRepo } from "../format.js";
import { issueColumns } from "../issueBoard.js";
import { filterIssueColumns, filterIssues } from "../issueFilter.js";
import { assignedToMe } from "../issueMarks.js";
import { BOUNCE, visibleIn } from "../motion.js";
import { PALETTE, repoHue } from "../palette.js";
import { ESCAPE, SLASH, useShortcuts } from "../useShortcuts.js";
import { Board } from "./Board.js";
import { ClosedIssueCard } from "./ClosedIssueCard.js";
import { IssueCard } from "./IssueCard.js";
import { IssueTabs } from "./IssueTabs.js";
import { Toolbar } from "./Toolbar.js";

type IssueDashboardProps = {
  /** The followed repos whose issues are on, as the last poll read them. */
  issueRepos: string[];
  /** Whether a poll has fetched them, so no tabs means no repo has issues rather than not known yet. */
  fetched: boolean;
  /** The open repo's issues (`useIssues`); null until the server answers for it. */
  issues: IssueBoardState | null;
  /** The project colours, shared with the PR dashboard so a repo has one colour on both. */
  hues: Map<string, number>;
  /** The repo the URL asks for; the first tab opens when it has none. */
  repo: string | null;
  onRepo(repo: string): void;
  /** The toolbar's filter, its own and not the PR dashboard's; the app keeps it, so it outlasts a trip to the PRs or Settings and a change of tab. */
  filter: Filter;
  onFilter(filter: Filter): void;
  /** Who I am, for "само моите" and the "теб" on the issues assigned to me; null until the first poll says. */
  viewer: string | null;
  /** Where in the top bar the tabs go, below the toggles. */
  topSlot: HTMLElement | null;
  /** The effects layer, for the confetti of an issue completed while the board shows. */
  fx: RefObject<HTMLDivElement>;
  booted: boolean;
};

/** Confetti from an issue completed while the board shows: as many pieces as from a merged PR's card. */
const COMPLETED_BURST = 30;

/** Confetti in `layer` from the card of the issue `key` (`repo#number`), if it shows in the viewport. */
function burstFrom(layer: HTMLElement | null, key: string): void {
  const el = document.querySelector(`[data-flip="${CSS.escape(`issue:${key}`)}"]`);
  if (!layer || !el) return;
  const rect = el.getBoundingClientRect();
  if (!visibleIn(rect, innerWidth, innerHeight)) return;
  const { x, y } = middleOf(rect);
  confetti(layer, x, y, COMPLETED_BURST, PALETTE);
}

/** "100 от 240" on the open tab when the repo has more open issues than one poll fetches; nothing otherwise. */
function shownOfTotal(issues: IssueBoardState | null): string | null {
  return issues && issues.totalCount > issues.issues.length ? `${issues.issues.length} от ${issues.totalCount}` : null;
}

/** What the board says in its middle: why there is nothing to show yet, or nothing at all when there is. */
function boardMessage(open: string | null, fetched: boolean, issues: IssueBoardState | null): string | null {
  if (!open) return fetched ? "Нито едно repo няма включени issues." : null;
  if (!issues) return null;
  if (issues.fetchedAt === null) return issues.error ? `Issues на ${shortRepo(open)} не се взеха: ${issues.error.message}` : `Взимам issues на ${shortRepo(open)}…`;
  return issues.issues.length === 0 && issues.closed.length === 0 ? `${shortRepo(open)} няма отворени issues.` : null;
}

/**
 * The Issue dashboard: a tab per repo and the toolbar in the top bar, and the open repo's issues on a board by stage.
 * Its own keys (`/` and Esc for the filter) come before the app's.
 */
export function IssueDashboard({ issueRepos, fetched, issues, hues, repo, onRepo, filter, onFilter, viewer, topSlot, fx, booted }: IssueDashboardProps) {
  const tabs = useMemo(() => issueTabs(issueRepos), [issueRepos]);
  const open = pickRepo(tabs, repo);
  // Only the open repo's issues: the state of the repo left behind shows until the new one comes.
  const shown = issues && open && issues.repo.toLowerCase() === open.toLowerCase() ? issues : null;
  // Every column the board has goes through the filter; the toolbar's "N от M" counts the open issues.
  const columns = useMemo(() => (shown ? filterIssueColumns(issueColumns(shown), filter, viewer) : []), [shown, filter, viewer]);
  const kept = useMemo(() => (shown ? filterIssues(shown.issues, filter, viewer).length : 0), [shown, filter, viewer]);
  const filterInput = useRef<HTMLInputElement>(null);
  useShortcuts(
    [
      { matches: SLASH, run: () => filterInput.current?.focus() },
      { matches: ESCAPE, run: () => onFilter({ ...filter, query: "" }) },
    ],
    { first: true },
  );
  const hue = open ? repoHue(hues, open) : 0;
  const note = shownOfTotal(shown);

  // An issue completed between two answers for the open repo bursts confetti from its card once it has landed in "Затворени";
  // not on first load, not on opening a tab (`newlyCompleted`). `confetti` holds back under reduced motion and on a hidden page.
  const lastShown = useRef<IssueBoardState | null>(null);
  useEffect(() => {
    const completed = shown ? newlyCompleted(lastShown.current, shown) : [];
    lastShown.current = shown;
    if (!completed.length) return;
    setTimeout(() => {
      for (const key of completed) burstFrom(fx.current, key);
    }, BOUNCE.duration);
  }, [shown]);
  return (
    <>
      {topSlot && tabs.length
        ? createPortal(
            <>
              <IssueTabs
                tabs={tabs.map((r) => ({ repo: r, name: shortRepo(r), hue: repoHue(hues, r), note: r === open ? note : null }))}
                open={open}
                onOpen={onRepo}
              />
              <Toolbar
                placeholder="Филтър: #, заглавие, етикет, assignee, milestone…"
                filter={filter}
                onChange={onFilter}
                canFilterMine={viewer !== null}
                shown={kept}
                total={shown?.issues.length ?? 0}
                inputRef={filterInput}
              />
            </>,
            topSlot,
          )
        : null}
      <Board columns={columns} booted={booted} message={boardMessage(open, fetched, shown)}>
        {(column) =>
          column.closed
            ? column.items.map((issue, index) => <ClosedIssueCard key={`${issue.repo}#${issue.number}`} issue={issue} hue={hue} index={index} />)
            : column.items.map((issue, index) => (
                <IssueCard key={`${issue.repo}#${issue.number}`} issue={issue} hue={hue} index={index} mine={assignedToMe(issue, viewer)} />
              ))
        }
      </Board>
    </>
  );
}
