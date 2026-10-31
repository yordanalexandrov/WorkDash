import { useMemo, useRef, useState } from "preact/hooks";
import { boardColumns } from "./board.js";
import { Banners } from "./components/Banners.js";
import { Board } from "./components/Board.js";
import { ClosedCard } from "./components/ClosedCard.js";
import { PrCard } from "./components/PrCard.js";
import { CLOSED_GROUP, PrTable } from "./components/PrTable.js";
import { Toolbar } from "./components/Toolbar.js";
import { TopBar } from "./components/TopBar.js";
import { ViewToggle } from "./components/ViewToggle.js";
import { NO_FILTER, repoChips } from "./filter.js";
import { configErrorText, errorText, shortRepo, statusText } from "./format.js";
import { useBooted } from "./motion.js";
import { repoHue, repoHues } from "./palette.js";
import { filterDashboard } from "./prFilter.js";
import { DEFAULT_SORT, prItems } from "./prTable.js";
import { type GroupBy, toggleCollapsed } from "./table.js";
import { useDashboard } from "./useDashboard.js";
import { useNotifications } from "./useNotifications.js";
import { ESCAPE, SLASH, T, useShortcuts } from "./useShortcuts.js";
import { readView, type View, writeView } from "./view.js";

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
  const switchView = (next: View) => {
    history.replaceState(history.state, "", writeView(location.href, next));
    setView(next);
  };
  useShortcuts([
    { matches: SLASH, run: () => filterInput.current?.focus() },
    { matches: ESCAPE, run: () => setFilter((current) => ({ ...current, query: "" })) },
    { matches: T, run: () => switchView(view === "board" ? "table" : "board") },
  ]);

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
                    {...(column.id === "waiting_on_me" ? { onSeen: seen } : {})}
                  />
                ))
          }
        </Board>
      )}
    </>
  );
}
