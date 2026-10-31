import type { RefObject } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { boardColumns } from "../board.js";
import type { ClosedPullRequest, DashboardPullRequest, DashboardState, Section } from "../api.js";
import { findOpen, prKey } from "../detail.js";
import { confetti, middleOf, newlyMerged, sparks } from "../effects.js";
import { NO_FILTER, repoChips } from "../filter.js";
import { shortRepo } from "../format.js";
import { BOUNCE, type Pos, flash, prFlipKey, visibleIn } from "../motion.js";
import { PALETTE, repoHue } from "../palette.js";
import { filterDashboard } from "../prFilter.js";
import { DEFAULT_SORT, prItems } from "../prTable.js";
import { type Happening, happenings, WINDOW } from "../replay.js";
import { type GroupBy, toggleCollapsed } from "../table.js";
import { useDrag } from "../useDrag.js";
import type { ReplayRun } from "../useReplay.js";
import { ESCAPE, F, I, R, SLASH, T, useShortcuts } from "../useShortcuts.js";
import type { View } from "../view.js";
import { Board } from "./Board.js";
import { ClosedCard } from "./ClosedCard.js";
import { DropZone } from "./DropZone.js";
import { PrCard } from "./PrCard.js";
import { PrDetail } from "./PrDetail.js";
import { CLOSED_GROUP, PrTable } from "./PrTable.js";
import { Replay } from "./Replay.js";
import { Sheet } from "./Sheet.js";
import { Toolbar } from "./Toolbar.js";

/** The PR whose detail sheet is open, the rect it grew out of, and whether it is shrinking back. */
type OpenSheet = { pr: { repo: string; number: number }; from: DOMRectReadOnly; closing: boolean };

/** The card or row of a PR in the view shown, if it is there. */
function source(pr: OpenSheet["pr"]): HTMLElement | null {
  return byFlipKey(prFlipKey(pr));
}

/** The element with the FLIP key `key`, if it is there. */
function byFlipKey(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-flip="${CSS.escape(key)}"]`);
}

/** The element with the FLIP key `key`, if it shows in the viewport. */
function shownByFlipKey(key: string): HTMLElement | null {
  const el = byFlipKey(key);
  return el && visibleIn(el.getBoundingClientRect(), innerWidth, innerHeight) ? el : null;
}

/** Confetti from a merge: this many pieces from the PR's card or row, and from the head of the closed ones at first sight. */
const MERGE_BURST = 30;
const REVEAL_BURST = 46;

/** Confetti in `layer` from the middle of `el`. */
function burst(layer: HTMLElement | null, el: Element, count: number): void {
  if (!layer) return;
  const { x, y } = middleOf(el.getBoundingClientRect());
  confetti(layer, x, y, count, PALETTE);
}

/**
 * A replayed happening flashes the card or row of its PR (`key` is its prKey), if it shows in the view; else only the feed has it.
 * A merge also bursts confetti, from its card or row, or else from the head of the closed ones on the board or in the table.
 */
function fire(happening: Happening, layer: HTMLElement | null): void {
  const el = byFlipKey(`pr:${happening.key}`);
  const shows = el !== null && el.getClientRects().length > 0;
  if (shows) flash(el, happening.color, el.classList.contains("trow") ? "row" : "card");
  if (happening.kind !== "merged") return;
  // Never from a folded column or group: its head shows, but what merged is out of sight.
  const column = byFlipKey("col:closed");
  const group = byFlipKey(`g:${CLOSED_GROUP}`);
  const from =
    (shows ? el : null) ??
    (column && !column.classList.contains("strip") ? column.querySelector(".col-head") : null) ??
    (group && !group.classList.contains("shut") ? group : null);
  if (from && from.getClientRects().length > 0) burst(layer, from, MERGE_BURST);
}

/** Where a sheet opened from the feed grows from when its PR does not show: a card's size in the middle of the window. */
function middleRect(): DOMRect {
  return new DOMRect(innerWidth / 2 - 140, innerHeight / 2 - 60, 280, 120);
}

/** Gives the focus back to the card or row of a PR, once the render that shows it again has run. */
function refocus(pr: OpenSheet["pr"]): void {
  requestAnimationFrame(() => {
    const el = source(pr);
    const target = el && el.tabIndex >= 0 ? el : el?.querySelector<HTMLElement>("[tabindex='0']");
    target?.focus({ preventScroll: true });
  });
}

type PrDashboardProps = {
  state: DashboardState;
  seen(pr: { repo: string; number: number }): Promise<void>;
  /** Whether it shows: it stays mounted behind Settings and the Issue dashboard, so its table, counts and confetti outlast them. */
  shown: boolean;
  view: View;
  /** The project colours, shared with the Issue dashboard so a repo has one colour on both. */
  hues: Map<string, number>;
  /** Where in the top bar the toolbar and "Пусни деня" go, below the toggles. */
  topSlot: HTMLElement | null;
  /** The effects layer, shared with the view switch's flyers. */
  fx: RefObject<HTMLDivElement>;
  booted: boolean;
};

/**
 * The PR dashboard: the toolbar, the board or the table of the PRs, the detail sheet, the "видях" drop zone and "Пусни деня".
 * Its own keys (`/`, Esc, and `f` while the sheet is open) come before the app's; while the sheet is open it takes `t`, `i` and `r` too.
 */
export function PrDashboard({ state, seen, shown, view, hues, topSlot, fx, booted }: PrDashboardProps) {
  // The filter is not kept between visits, so the board never opens hiding something that waits on me.
  const [filter, setFilter] = useState(NO_FILTER);
  // The table's sort, grouping and folded groups live here, so they outlast a trip to the board; they are not kept between visits.
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set([CLOSED_GROUP]));
  const filterInput = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  // The sheet's last size: the next one opens in it. Not kept between visits, so a reload opens it normal.
  const [expanded, setExpanded] = useState(false);
  const toggleSize = () => setExpanded((current) => !current);
  // What the sheet shows: the PR as the state has it now, or, once it has left the open ones, as it last was.
  const live = sheet ? findOpen(state, prKey(sheet.pr)) : undefined;
  const shownSheet = useRef<{ pr: DashboardPullRequest; section: Section }>();
  if (live) shownSheet.current = live;
  const openSheet = (pr: DashboardPullRequest, from: HTMLElement) =>
    setSheet({ pr: { repo: pr.repo, number: pr.number }, from: from.getBoundingClientRect(), closing: false });
  // A toast in the replay's feed opens the sheet of its PR while it is open, from its card or row if that shows.
  const openFromFeed = (key: string) => {
    const found = findOpen(state, key);
    if (!found) return;
    const pr = { repo: found.pr.repo, number: found.pr.number };
    setSheet({ pr, from: source(pr)?.getBoundingClientRect() ?? middleRect(), closing: false });
  };
  const closeSheet = () => setSheet((current) => (current && !current.closing ? { ...current, closing: true } : current));
  const dropZone = useRef<HTMLDivElement>(null);
  const drag = useDrag(fx, dropZone);
  const spark = (at: Pos) => fx.current && sparks(fx.current, at.x, at.y, "✓ видях");
  // While the sheet is open, Esc closes it, `f` expands or shrinks it and `/`, `t`, `i` and `r` do nothing. While a card is
  // dragged, Esc puts it back (`useDrag`). Hidden, it has no keys.
  useShortcuts(
    !shown
      ? []
      : sheet
        ? [
            { matches: ESCAPE, run: closeSheet },
            { matches: F, run: () => !sheet.closing && toggleSize() },
            { matches: (event) => SLASH(event) || T(event) || I(event) || R(event), run: () => {} },
          ]
        : [
            { matches: SLASH, run: () => filterInput.current?.focus() },
            { matches: ESCAPE, run: () => setFilter((current) => ({ ...current, query: "" })) },
          ],
    { first: true },
  );
  const openKey = sheet ? prKey(sheet.pr) : null;

  // The repo of every open PR, one entry per PR, before any filter.
  const openPrRepos = useMemo(() => state.sections.flatMap((s) => s.pullRequests.map((pr) => pr.repo)), [state]);
  const chips = useMemo(() => repoChips(openPrRepos, state.recentlyClosed.map((pr) => pr.repo)), [openPrRepos, state]);
  const filtered = useMemo(() => filterDashboard(state, filter), [state, filter]);
  const columns = useMemo(() => boardColumns(filtered), [filtered]);
  const items = useMemo(() => prItems(filtered.sections), [filtered]);
  const nothingOpen = openPrRepos.length === 0;

  // Confetti for the merged ones, once the closed column first shows unfolded with one in it. Kept here, not in the board, so
  // a trip to the table or folding the column does not play it again; a column that never showed has not played it.
  const revealed = useRef(false);
  const reveal =
    !revealed.current && filtered.recentlyClosed.some((pr) => pr.state === "MERGED")
      ? {
          id: "closed",
          run: function run(head: HTMLElement) {
            if (revealed.current) return;
            // A tab opened in the background plays it once it is looked at, if the column still shows unfolded then.
            if (document.hidden) {
              document.addEventListener("visibilitychange", () => head.isConnected && !head.closest(".strip") && run(head), { once: true });
              return;
            }
            revealed.current = true;
            burst(fx.current, head, REVEAL_BURST);
          },
        }
      : null;
  // A PR merged while the dashboard is open bursts from its card or row once it has landed among the closed ones.
  const lastClosed = useRef<ClosedPullRequest[] | null>(null);
  useEffect(() => {
    const merged = newlyMerged(lastClosed.current, state.recentlyClosed);
    lastClosed.current = state.recentlyClosed;
    if (!merged.length) return;
    setTimeout(() => {
      for (const key of merged) {
        const el = shownByFlipKey(`pr:${key}`);
        if (el) burst(fx.current, el, MERGE_BURST);
      }
    }, BOUNCE.duration);
  }, [state]);

  // "Пусни деня": the happenings of the PRs the toolbar keeps and the snapshot's time, frozen as it starts.
  const [replay, setReplay] = useState<ReplayRun | null>(null);
  const toggleReplay = () => {
    if (replay || !state.fetchedAt) {
      setReplay(null);
      return;
    }
    const end = Date.parse(state.fetchedAt);
    const start = end - WINDOW;
    setReplay({ events: happenings(filtered.sections.flatMap((s) => s.pullRequests), filtered.recentlyClosed, start, end), start, end });
  };

  // Settings or the Issue dashboard takes its place, however it was opened: the sheet and "Пусни деня" go with it.
  useEffect(() => {
    if (shown) return;
    setSheet(null);
    setReplay(null);
  }, [shown]);

  if (!shown) return null;
  const hue = (repo: string) => repoHue(hues, repo);
  return (
    <>
      {topSlot &&
        createPortal(
          <>
            <Toolbar
              repos={chips.map(({ repo, count }) => ({ repo, name: shortRepo(repo), hue: hue(repo), count }))}
              placeholder="Филтър: PR, автор, branch, Jira…"
              filter={filter}
              onChange={setFilter}
              canFilterMine={state.viewer !== null}
              shown={items.length}
              total={openPrRepos.length}
              inputRef={filterInput}
              replay={{ on: replay !== null, disabled: !state.fetchedAt, onToggle: toggleReplay }}
            />
            {replay ? (
              <Replay
                run={replay}
                onFire={(happening) => fire(happening, fx.current)}
                held={sheet !== null}
                hue={hue}
                canOpen={(key) => findOpen(state, key) !== undefined}
                onOpen={openFromFeed}
                onClose={() => setReplay(null)}
              />
            ) : null}
          </>,
          topSlot,
        )}
      {view === "table" && (
        <PrTable
          items={items}
          closed={filtered.recentlyClosed}
          hue={hue}
          query={filter.query}
          sort={sort}
          onSort={setSort}
          groupBy={groupBy}
          onGroupBy={setGroupBy}
          collapsed={collapsed}
          onToggle={(id) => setCollapsed((current) => toggleCollapsed(current, id))}
          onSeen={seen}
          onSpark={spark}
          onOpen={openSheet}
          openKey={openKey}
          booted={booted}
        />
      )}
      {view === "board" && (
        <Board columns={columns} booted={booted} reveal={reveal} message={nothingOpen && state.fetchedAt ? "Няма PR-и, които да те засягат." : null}>
          {(column) =>
            column.id === "closed"
              ? column.items.map((pr, index) => <ClosedCard key={`${pr.repo}#${pr.number}`} pr={pr} hue={hue(pr.repo)} index={index} />)
              : column.items.map((pr, index) => (
                  <PrCard
                    key={`${pr.repo}#${pr.number}`}
                    pr={pr}
                    hue={hue(pr.repo)}
                    index={index}
                    onOpen={openSheet}
                    ghost={openKey === prKey(pr) || drag.held.has(prFlipKey(pr))}
                    {...(column.id === "waiting_on_me"
                      ? {
                          onSeen: seen,
                          onSpark: spark,
                          ...(sheet
                            ? {}
                            : {
                                onGrab: (event: PointerEvent, slot: HTMLElement) =>
                                  drag.grab(event, slot, (zone) => {
                                    spark(middleOf(zone));
                                    return seen(pr);
                                  }),
                              }),
                        }
                      : {})}
                  />
                ))
          }
        </Board>
      )}
      {drag.zone === "off" ? null : (
        <DropZone
          zoneRef={dropZone}
          over={drag.zone === "over"}
          label="↓ Хвърли тук · видях"
          overLabel="Пусни! ✓"
          hint="пусни другаде, за да върнеш картата"
        />
      )}
      {sheet && shownSheet.current ? (
        <Sheet
          key={openKey}
          showing={openKey!}
          label={shownSheet.current.pr.title}
          from={sheet.from}
          closing={sheet.closing}
          expanded={expanded}
          onToggleSize={toggleSize}
          target={() => (live ? (source(sheet.pr)?.getBoundingClientRect() ?? null) : null)}
          onClose={closeSheet}
          onClosed={() => {
            setSheet(null);
            refocus(sheet.pr);
          }}
        >
          <PrDetail
            pr={shownSheet.current.pr}
            section={shownSheet.current.section}
            hue={hue(shownSheet.current.pr.repo)}
            gone={!live}
            {...(live?.section === "waiting_on_me"
              ? {
                  onSeen: (from: HTMLElement) => {
                    spark(middleOf(from.getBoundingClientRect()));
                    setSheet(null);
                    seen(live.pr).catch(() => {});
                  },
                }
              : {})}
          />
        </Sheet>
      ) : null}
    </>
  );
}
