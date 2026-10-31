import type { RefObject } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { IssueBoardState } from "../api.js";
import { issueTabs, pickRepo } from "../dashboard.js";
import { confetti, middleOf, NO_WATCH, watchCompleted } from "../effects.js";
import type { Filter } from "../filter.js";
import { shortRepo } from "../format.js";
import { issueColumns } from "../issueBoard.js";
import { filterIssueColumns, filterIssues } from "../issueFilter.js";
import { findIssue, issueKey, type ShownIssue } from "../issueDetail.js";
import { nodeInSnapshot } from "../issueGraph.js";
import { assignedToMe } from "../issueMarks.js";
import { BOUNCE, issueFlipKey, visibleIn } from "../motion.js";
import { PALETTE, repoHue } from "../palette.js";
import { type GroupBy, type Sort, toggleCollapsed } from "../table.js";
import { ESCAPE, F, I, R, SLASH, T, useShortcuts } from "../useShortcuts.js";
import type { View } from "../view.js";
import { Board } from "./Board.js";
import { ClosedIssueCard } from "./ClosedIssueCard.js";
import { IssueCard } from "./IssueCard.js";
import { IssueDetail } from "./IssueDetail.js";
import { CLOSED_ISSUES, ISSUE_DEFAULT_SORT, IssueTable } from "./IssueTable.js";
import { IssueTabs } from "./IssueTabs.js";
import { Sheet } from "./Sheet.js";
import { Toolbar } from "./Toolbar.js";
import type { GraphIssue } from "../../../src/domain/issue-graph.js";
import { sameRepo } from "../../../src/domain/repos.js";

/**
 * The issue whose detail sheet is open, the FLIP key of the card or row it opened from (a row of an issue in several groups
 * has its own), the rect it grew out of, and whether it is shrinking back.
 */
type OpenSheet = { issue: { repo: string; number: number }; flip: string; from: DOMRectReadOnly; closing: boolean };

/** The card or row the sheet opened from, if it still shows; else the issue's card or first row, if one does. */
function source(sheet: OpenSheet): HTMLElement | null {
  const find = (key: string) => document.querySelector<HTMLElement>(`[data-flip="${CSS.escape(key)}"]`);
  return find(sheet.flip) ?? find(issueFlipKey(sheet.issue));
}

/** Gives the focus back to the card or row the sheet opened from, once the render that shows it again has run. */
function refocus(sheet: OpenSheet): void {
  requestAnimationFrame(() => {
    const el = source(sheet);
    const target = el && el.tabIndex >= 0 ? el : el?.querySelector<HTMLElement>("[tabindex='0']");
    target?.focus({ preventScroll: true });
  });
}

/**
 * What of the dashboard outlasts it while it unmounts behind the PRs and Settings, until a reload: the table's sort, grouping
 * and folded groups, and the detail sheet's size, as the PR dashboard keeps its own.
 */
type IssueDashboardKept = { sort: Sort; groupBy: GroupBy; collapsed: ReadonlySet<string>; expanded: boolean };

/** How the dashboard first shows: the table sorted by stage, ungrouped, with "Наскоро затворени" folded; the sheet in its small size. */
export const ISSUE_DASHBOARD_KEPT: IssueDashboardKept = { sort: ISSUE_DEFAULT_SORT, groupBy: "none", collapsed: new Set([CLOSED_ISSUES]), expanded: false };

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
  /** What outlasts the dashboard (`ISSUE_DASHBOARD_KEPT`); the app keeps it. */
  kept: IssueDashboardKept;
  onKept(update: (kept: IssueDashboardKept) => IssueDashboardKept): void;
  /** Board or table, as the app's toggle says. */
  view: View;
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
  // Why a poll failed is in the banner above, with issues saved or not.
  if (issues.fetchedAt === null) return issues.error ? `Issues на ${shortRepo(open)} още не са взети.` : `Взимам issues на ${shortRepo(open)}…`;
  return issues.issues.length === 0 && issues.closed.length === 0 ? `${shortRepo(open)} няма отворени issues.` : null;
}

/**
 * The Issue dashboard: a tab per repo and the toolbar in the top bar, the open repo's issues on a board by stage or in a
 * table, and the detail sheet of one issue. Its own keys (`/` and Esc for the filter; Esc and `f` while the sheet is open,
 * which also takes `/`, `t`, `i` and `r`) come before the app's.
 */
export function IssueDashboard({ issueRepos, fetched, issues, hues, repo, onRepo, filter, onFilter, viewer, kept, onKept, view, topSlot, fx, booted }: IssueDashboardProps) {
  const tabs = useMemo(() => issueTabs(issueRepos), [issueRepos]);
  const open = pickRepo(tabs, repo);
  // Only the open repo's issues: the state of the repo left behind shows until the new one comes.
  const shown = issues && open && sameRepo(issues.repo, open) ? issues : null;
  // Every column the board has goes through the filter; the toolbar's "N от M" counts the open issues.
  const columns = useMemo(() => (shown ? filterIssueColumns(issueColumns(shown), filter, viewer) : []), [shown, filter, viewer]);
  const keptIssues = useMemo(() => (shown ? filterIssues(shown.issues, filter, viewer) : []), [shown, filter, viewer]);
  const keptClosed = useMemo(() => (shown ? filterIssues(shown.closed, filter, viewer) : []), [shown, filter, viewer]);
  // The table's sort, grouping and folded groups outlast a trip to the board, a change of tab and one to the PRs or Settings.
  const { sort, groupBy, collapsed, expanded } = kept;
  const setExpanded = (toggle: (current: boolean) => boolean) => onKept((current) => ({ ...current, expanded: toggle(current.expanded) }));
  const filterInput = useRef<HTMLInputElement>(null);

  // The detail sheet. A card opens it with `openSheet`, and so does a row of the table: both carry the issue's FLIP key, which
  // the sheet grows out of and shrinks back into; so do a closed card and row. It shows the issue as the state has it now (an
  // issue that closes while it is open shows closed), or as it last was once it is gone.
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const openKey = sheet ? issueKey(sheet.issue) : null;
  const live = openKey ? findIssue(shown, openKey) : undefined;
  const shownSheet = useRef<ShownIssue>();
  if (live) shownSheet.current = live;
  const openSheet = (issue: ShownIssue, from: HTMLElement) =>
    setSheet({ issue: { repo: issue.repo, number: issue.number }, flip: from.dataset["flip"] ?? issueFlipKey(issue), from: from.getBoundingClientRect(), closing: false });
  // A node of the Dependency graph opens its issue: in the sheet, which switches to it where it is, when the open repo's
  // issues have it (it shrinks back into that issue's card or row); else on GitHub in a new tab.
  const openNode = (node: GraphIssue) => {
    const found = nodeInSnapshot(node, shown);
    if (!found) return void window.open(node.url, "_blank", "noopener");
    setSheet((current) => (current && !current.closing ? { ...current, issue: { repo: found.repo, number: found.number }, flip: issueFlipKey(found) } : current));
  };
  const closeSheet = () => setSheet((current) => (current && !current.closing ? { ...current, closing: true } : current));
  // Another repo's tab takes the sheet with it.
  useEffect(() => setSheet(null), [open]);

  useShortcuts(
    sheet
      ? [
          { matches: ESCAPE, run: closeSheet },
          { matches: F, run: () => !sheet.closing && setExpanded((current) => !current) },
          { matches: (event) => SLASH(event) || T(event) || I(event) || R(event), run: () => {} },
        ]
      : [
          { matches: SLASH, run: () => filterInput.current?.focus() },
          { matches: ESCAPE, run: () => onFilter({ ...filter, query: "" }) },
        ],
    { first: true },
  );
  const hue = open ? repoHue(hues, open) : 0;
  const note = shownOfTotal(shown);

  // An issue completed between two poll answers for the open repo bursts confetti from its card once it has landed in
  // "Затворени"; not for the saved issues, not on opening a tab (`watchCompleted`). `confetti` holds back under reduced motion
  // and on a hidden page.
  const watch = useRef(NO_WATCH);
  useEffect(() => {
    const step = watchCompleted(watch.current, shown);
    watch.current = step.watch;
    const { completed } = step;
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
                shown={keptIssues.length}
                total={shown?.issues.length ?? 0}
                inputRef={filterInput}
              />
            </>,
            topSlot,
          )
        : null}
      {view === "table" && (
        <IssueTable
          issues={keptIssues}
          closed={keptClosed}
          stages={shown?.stages ?? []}
          hue={hue}
          viewer={viewer}
          // Until the open repo's issues come there is nothing to say "none" about: the table says nothing, as the board.
          message={boardMessage(open, fetched, shown) ?? (shown ? null : "")}
          query={filter.query}
          sort={sort}
          onSort={(next) => onKept((current) => ({ ...current, sort: next }))}
          groupBy={groupBy}
          onGroupBy={(by) => onKept((current) => ({ ...current, groupBy: by }))}
          collapsed={collapsed}
          onToggle={(id) => onKept((current) => ({ ...current, collapsed: toggleCollapsed(current.collapsed, id) }))}
          onOpen={openSheet}
          openFlip={sheet?.flip ?? null}
          booted={booted}
        />
      )}
      {view === "board" && (
        <Board columns={columns} booted={booted} message={boardMessage(open, fetched, shown)}>
          {(column) =>
            column.closed
              ? column.items.map((issue, index) => (
                  <ClosedIssueCard
                    key={`${issue.repo}#${issue.number}`}
                    issue={issue}
                    hue={hue}
                    index={index}
                    onOpen={openSheet}
                    ghost={sheet?.flip === issueFlipKey(issue)}
                  />
                ))
              : column.items.map((issue, index) => (
                  <IssueCard
                    key={`${issue.repo}#${issue.number}`}
                    issue={issue}
                    hue={hue}
                    index={index}
                    mine={assignedToMe(issue, viewer)}
                    onOpen={openSheet}
                    ghost={sheet?.flip === issueFlipKey(issue)}
                  />
                ))
          }
        </Board>
      )}
      {sheet && shownSheet.current ? (
        <Sheet
          showing={openKey!}
          label={shownSheet.current.title}
          from={sheet.from}
          closing={sheet.closing}
          expanded={expanded}
          onToggleSize={() => setExpanded((current) => !current)}
          target={() => (live ? (source(sheet)?.getBoundingClientRect() ?? null) : null)}
          onClose={closeSheet}
          onClosed={() => {
            setSheet(null);
            refocus(sheet);
          }}
        >
          <IssueDetail key={openKey} issue={shownSheet.current} hue={hue} mine={assignedToMe(shownSheet.current, viewer)} gone={!live} board={shown} onOpenNode={openNode} />
        </Sheet>
      ) : null}
    </>
  );
}
