import { createPortal } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { IssueBoardState, StagedIssue } from "../api.js";
import { issueTabs, pickRepo } from "../dashboard.js";
import { prKey } from "../detail.js";
import type { Filter } from "../filter.js";
import { shortRepo } from "../format.js";
import { issueColumns } from "../issueBoard.js";
import { filterIssueColumns, filterIssues } from "../issueFilter.js";
import { findIssue } from "../issueDetail.js";
import { assignedToMe } from "../issueMarks.js";
import { repoHue } from "../palette.js";
import { ESCAPE, F, I, R, SLASH, T, useShortcuts } from "../useShortcuts.js";
import { Board } from "./Board.js";
import { IssueCard, issueFlipKey } from "./IssueCard.js";
import { IssueDetail } from "./IssueDetail.js";
import { IssueTabs } from "./IssueTabs.js";
import { Sheet } from "./Sheet.js";
import { Toolbar } from "./Toolbar.js";

/** The issue whose detail sheet is open, the rect it grew out of, and whether it is shrinking back. */
type OpenSheet = { issue: { repo: string; number: number }; from: DOMRectReadOnly; closing: boolean };

/** The card (or, in the table, the row) of an issue, if it shows: they share the FLIP key. */
function source(issue: OpenSheet["issue"]): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-flip="${CSS.escape(issueFlipKey(issue))}"]`);
}

/** Gives the focus back to the card or row of an issue, once the render that shows it again has run. */
function refocus(issue: OpenSheet["issue"]): void {
  requestAnimationFrame(() => {
    const el = source(issue);
    const target = el && el.tabIndex >= 0 ? el : el?.querySelector<HTMLElement>("[tabindex='0']");
    target?.focus({ preventScroll: true });
  });
}

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
  booted: boolean;
};

/** "100 от 240" on the open tab when the repo has more open issues than one poll fetches; nothing otherwise. */
function shownOfTotal(issues: IssueBoardState | null): string | null {
  return issues && issues.totalCount > issues.issues.length ? `${issues.issues.length} от ${issues.totalCount}` : null;
}

/** What the board says in its middle: why there is nothing to show yet, or nothing at all when there is. */
function boardMessage(open: string | null, fetched: boolean, issues: IssueBoardState | null): string | null {
  if (!open) return fetched ? "Нито едно repo няма включени issues." : null;
  if (!issues) return null;
  if (issues.fetchedAt === null) return issues.error ? `Issues на ${shortRepo(open)} не се взеха: ${issues.error.message}` : `Взимам issues на ${shortRepo(open)}…`;
  return issues.issues.length === 0 ? `${shortRepo(open)} няма отворени issues.` : null;
}

/**
 * The Issue dashboard: a tab per repo and the toolbar in the top bar, the open repo's issues on a board by stage, and the
 * detail sheet of one issue. Its own keys (`/` and Esc for the filter; Esc and `f` while the sheet is open, which also takes
 * `/`, `t`, `i` and `r`) come before the app's.
 */
export function IssueDashboard({ issueRepos, fetched, issues, hues, repo, onRepo, filter, onFilter, viewer, topSlot, booted }: IssueDashboardProps) {
  const tabs = useMemo(() => issueTabs(issueRepos), [issueRepos]);
  const open = pickRepo(tabs, repo);
  // Only the open repo's issues: the state of the repo left behind shows until the new one comes.
  const shown = issues && open && issues.repo.toLowerCase() === open.toLowerCase() ? issues : null;
  // Every column the board has goes through the filter; the toolbar's "N от M" counts the open issues.
  const columns = useMemo(() => (shown ? filterIssueColumns(issueColumns(shown), filter, viewer) : []), [shown, filter, viewer]);
  const kept = useMemo(() => (shown ? filterIssues(shown.issues, filter, viewer).length : 0), [shown, filter, viewer]);
  const filterInput = useRef<HTMLInputElement>(null);

  // The detail sheet. A card opens it with `openSheet`, and so does a row of the table: both carry the issue's FLIP key, which
  // the sheet grows out of and shrinks back into. It shows the issue as the state has it now, or as it last was once it is gone.
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  // The sheet's last size: the next one opens in it, while the dashboard shows.
  const [expanded, setExpanded] = useState(false);
  const openKey = sheet ? prKey(sheet.issue) : null;
  const live = openKey ? findIssue(shown, openKey) : undefined;
  const shownSheet = useRef<StagedIssue>();
  if (live) shownSheet.current = live;
  const openSheet = (issue: StagedIssue, from: HTMLElement) => setSheet({ issue: { repo: issue.repo, number: issue.number }, from: from.getBoundingClientRect(), closing: false });
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
          column.items.map((issue, index) => (
            <IssueCard
              key={`${issue.repo}#${issue.number}`}
              issue={issue}
              hue={hue}
              index={index}
              mine={assignedToMe(issue, viewer)}
              onOpen={openSheet}
              ghost={openKey === prKey(issue)}
            />
          ))
        }
      </Board>
      {sheet && shownSheet.current ? (
        <Sheet
          key={openKey}
          label={shownSheet.current.title}
          from={sheet.from}
          closing={sheet.closing}
          expanded={expanded}
          onToggleSize={() => setExpanded((current) => !current)}
          target={() => (live ? (source(sheet.issue)?.getBoundingClientRect() ?? null) : null)}
          onClose={closeSheet}
          onClosed={() => {
            setSheet(null);
            refocus(sheet.issue);
          }}
        >
          <IssueDetail issue={shownSheet.current} hue={hue} mine={assignedToMe(shownSheet.current, viewer)} gone={!live} />
        </Sheet>
      ) : null}
    </>
  );
}
