import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { boardColumns } from "./board.js";
import { Banners } from "./components/Banners.js";
import { Board } from "./components/Board.js";
import { PrDetail } from "./components/PrDetail.js";
import { Sheet } from "./components/Sheet.js";
import { ClosedCard } from "./components/ClosedCard.js";
import { PrCard } from "./components/PrCard.js";
import { CLOSED_GROUP, PrTable } from "./components/PrTable.js";
import { Toolbar } from "./components/Toolbar.js";
import { TopBar } from "./components/TopBar.js";
import { ViewToggle } from "./components/ViewToggle.js";
import { NO_FILTER, repoChips } from "./filter.js";
import type { DashboardPullRequest, Section } from "./api.js";
import { findOpen, prKey } from "./detail.js";
import { configErrorText, errorText, shortRepo, statusText } from "./format.js";
import { type Flyer, finishLanding, land, liftFlyers, prFlipKey, useBooted } from "./motion.js";
import { repoHue, repoHues } from "./palette.js";
import { filterDashboard } from "./prFilter.js";
import { DEFAULT_SORT, prItems } from "./prTable.js";
import { type GroupBy, toggleCollapsed } from "./table.js";
import { useDashboard } from "./useDashboard.js";
import { useNotifications } from "./useNotifications.js";
import { ESCAPE, SLASH, T, useShortcuts } from "./useShortcuts.js";
import { readView, type View, writeView } from "./view.js";

/** The PR whose detail sheet is open, the rect it grew out of, and whether it is shrinking back. */
type OpenSheet = { pr: { repo: string; number: number }; from: DOMRectReadOnly; closing: boolean };

/** The card or row of a PR in the view shown, if it is there. */
function source(pr: OpenSheet["pr"]): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-flip="${CSS.escape(prFlipKey(pr))}"]`);
}

/** Gives the focus back to the card or row of a PR, once the render that shows it again has run. */
function refocus(pr: OpenSheet["pr"]): void {
  requestAnimationFrame(() => {
    const el = source(pr);
    const target = el && el.tabIndex >= 0 ? el : el?.querySelector<HTMLElement>("[tabindex='0']");
    target?.focus({ preventScroll: true });
  });
}

export function App() {
  const { state, stream, seen } = useDashboard();
  const notifications = useNotifications();
  const booted = useBooted();
  // The filter is not kept between visits, so the board never opens hiding something that waits on me.
  const [filter, setFilter] = useState(NO_FILTER);
  const [view, setView] = useState<View>(() => readView(location.search));
  // The table's sort, grouping and folded groups live here, so they outlast a trip to the board; they are not kept between visits.
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set([CLOSED_GROUP]));
  const filterInput = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  // What the sheet shows: the PR as the state has it now, or, once it has left the open ones, as it last was.
  const live = sheet ? findOpen(state, prKey(sheet.pr)) : undefined;
  const shown = useRef<{ pr: DashboardPullRequest; section: Section }>();
  if (live) shown.current = live;
  const openSheet = (pr: DashboardPullRequest, from: HTMLElement) =>
    setSheet({ pr: { repo: pr.repo, number: pr.number }, from: from.getBoundingClientRect(), closing: false });
  const closeSheet = () => setSheet((current) => (current && !current.closing ? { ...current, closing: true } : current));
  const viewRoot = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  // The cards or rows lifted off the view being left, to land once the next one is in.
  const lifted = useRef<Flyer[] | null>(null);
  // A switch while the last one still flies ends it at once and lifts from the real cards or rows.
  const switchView = (next: View) => {
    if (next === view) return;
    finishLanding();
    lifted.current?.forEach((flyer) => flyer.el.remove());
    lifted.current = viewRoot.current && fx.current ? liftFlyers(viewRoot.current, fx.current) : null;
    history.replaceState(history.state, "", writeView(location.href, next));
    setView(next);
  };
  useLayoutEffect(() => {
    const flyers = lifted.current;
    lifted.current = null;
    if (flyers && viewRoot.current) void land(viewRoot.current, flyers);
  }, [view]);
  // While the sheet is open, Esc closes it and `/` and `t` do nothing.
  useShortcuts(
    sheet
      ? [
          { matches: ESCAPE, run: closeSheet },
          { matches: (event) => SLASH(event) || T(event), run: () => {} },
        ]
      : [
          { matches: SLASH, run: () => filterInput.current?.focus() },
          { matches: ESCAPE, run: () => setFilter((current) => ({ ...current, query: "" })) },
          { matches: T, run: () => switchView(view === "board" ? "table" : "board") },
        ],
  );
  const openKey = sheet ? prKey(sheet.pr) : null;

  // The repo of every open PR, one entry per PR, before any filter.
  const openPrRepos = useMemo(() => (state ? state.sections.flatMap((s) => s.pullRequests.map((pr) => pr.repo)) : []), [state]);
  const chips = useMemo(() => repoChips(openPrRepos, state ? state.recentlyClosed.map((pr) => pr.repo) : []), [openPrRepos, state]);
  // From every repo, not only those the filter keeps, so a repo keeps its colour while filtering.
  const hues = useMemo(() => repoHues(chips.map((chip) => chip.repo)), [chips]);
  const filtered = useMemo(() => (state ? filterDashboard(state, filter) : null), [state, filter]);
  const columns = useMemo(() => (filtered ? boardColumns(filtered) : []), [filtered]);
  const items = useMemo(() => (filtered ? prItems(filtered.sections) : []), [filtered]);
  const nothingOpen = openPrRepos.length === 0;

  return (
    <>
      <div class="bg" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <TopBar status={statusText(state)} stream={stream} notifications={notifications} toggle={<ViewToggle view={view} onChange={switchView} />}>
        {state && (
          <Toolbar
            repos={chips.map(({ repo, count }) => ({ repo, name: shortRepo(repo), hue: repoHue(hues, repo), count }))}
            filter={filter}
            onChange={setFilter}
            canFilterMine={state.viewer !== null}
            shown={items.length}
            total={openPrRepos.length}
            inputRef={filterInput}
          />
        )}
      </TopBar>
      <Banners
        error={errorText(state, stream)}
        configError={configErrorText(state)}
        missed={notifications.missed}
        onDismissMissed={notifications.dismissMissed}
      />
      <div class="view" ref={viewRoot}>
        {state && filtered && view === "table" && (
          <PrTable
            items={items}
            closed={filtered.recentlyClosed}
            hue={(repo) => repoHue(hues, repo)}
            query={filter.query}
            sort={sort}
            onSort={setSort}
            groupBy={groupBy}
            onGroupBy={setGroupBy}
            collapsed={collapsed}
            onToggle={(id) => setCollapsed((current) => toggleCollapsed(current, id))}
            onSeen={seen}
            onOpen={openSheet}
            openKey={openKey}
            booted={booted}
          />
        )}
        {state && view === "board" && (
          <Board columns={columns} booted={booted} message={nothingOpen && state.fetchedAt ? "Няма PR-и, които да те засягат." : null}>
            {(column) =>
              column.id === "closed"
                ? column.items.map((pr, index) => <ClosedCard key={`${pr.repo}#${pr.number}`} pr={pr} hue={repoHue(hues, pr.repo)} index={index} />)
                : column.items.map((pr, index) => (
                    <PrCard
                      key={`${pr.repo}#${pr.number}`}
                      pr={pr}
                      hue={repoHue(hues, pr.repo)}
                      index={index}
                      onOpen={openSheet}
                      ghost={openKey === prKey(pr)}
                      {...(column.id === "waiting_on_me" ? { onSeen: seen } : {})}
                    />
                  ))
            }
          </Board>
        )}
      </div>
      <div class="fx" ref={fx} aria-hidden="true" />
      {sheet && shown.current ? (
        <Sheet
          key={openKey}
          label={shown.current.pr.title}
          from={sheet.from}
          closing={sheet.closing}
          target={() => (live ? (source(sheet.pr)?.getBoundingClientRect() ?? null) : null)}
          onClose={closeSheet}
          onClosed={() => {
            setSheet(null);
            refocus(sheet.pr);
          }}
        >
          <PrDetail
            pr={shown.current.pr}
            section={shown.current.section}
            hue={repoHue(hues, shown.current.pr.repo)}
            gone={!live}
            {...(live?.section === "waiting_on_me"
              ? {
                  onSeen: () => {
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
