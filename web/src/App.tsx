import { useMemo, useRef, useState } from "preact/hooks";
import { boardColumns } from "./board.js";
import { Banners } from "./components/Banners.js";
import { Board } from "./components/Board.js";
import { ClosedCard } from "./components/ClosedCard.js";
import { PrCard } from "./components/PrCard.js";
import { Toolbar } from "./components/Toolbar.js";
import { TopBar } from "./components/TopBar.js";
import { NO_FILTER, repoChips } from "./filter.js";
import { configErrorText, errorText, shortRepo, statusText } from "./format.js";
import { repoHue, repoHues } from "./palette.js";
import { filterDashboard } from "./prFilter.js";
import { useDashboard } from "./useDashboard.js";
import { useNotifications } from "./useNotifications.js";
import { SLASH, useShortcuts } from "./useShortcuts.js";

export function App() {
  const { state, stream, seen } = useDashboard();
  const notifications = useNotifications();
  // The filter is not kept between visits, so the board never opens hiding something that waits on me.
  const [filter, setFilter] = useState(NO_FILTER);
  const filterInput = useRef<HTMLInputElement>(null);
  useShortcuts([{ matches: SLASH, run: () => filterInput.current?.focus() }]);

  const openRepos = useMemo(() => (state ? state.sections.flatMap((s) => s.pullRequests.map((pr) => pr.repo)) : []), [state]);
  const chips = useMemo(() => repoChips(openRepos, state ? state.recentlyClosed.map((pr) => pr.repo) : []), [openRepos, state]);
  // From every repo, not only those the filter keeps, so a repo keeps its colour while filtering.
  const hues = useMemo(() => repoHues(chips.map((chip) => chip.repo)), [chips]);
  const columns = useMemo(() => (state ? boardColumns(filterDashboard(state, filter)) : []), [state, filter]);
  const shown = columns.reduce((sum, column) => sum + (column.id === "closed" ? 0 : column.count), 0);
  const nothingOpen = openRepos.length === 0;

  return (
    <>
      <div class="bg" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <TopBar status={statusText(state)} stream={stream} notifications={notifications}>
        {state && (
          <Toolbar
            repos={chips.map(({ repo, count }) => ({ repo, name: shortRepo(repo), hue: repoHue(hues, repo), count }))}
            filter={filter}
            onChange={setFilter}
            canFilterMine={state.viewer !== null}
            shown={shown}
            total={openRepos.length}
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
      {state && (
        <Board columns={columns} message={nothingOpen && state.fetchedAt ? "Няма PR-и, които да те засягат." : null}>
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
