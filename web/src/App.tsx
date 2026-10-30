import { RecentlyClosedView } from "./components/RecentlyClosedView.js";
import { RepoCardView } from "./components/RepoCardView.js";
import { configErrorText, errorText, statusText } from "./format.js";
import { groupByRepo } from "./group.js";
import { useDashboard } from "./useDashboard.js";

export function App() {
  const { state, connectionError } = useDashboard();
  const cards = state ? groupByRepo(state.sections) : [];
  const error = errorText(state, connectionError);
  const configError = configErrorText(state);

  return (
    <>
      <header>
        <h1>WorkDash</h1>
        <p id="status">{statusText(state)}</p>
      </header>
      {error && <p id="error">{error}</p>}
      {configError && <p id="config-error">{configError}</p>}
      <main>
        <div id="repos">
          {cards.map((card) => (
            <RepoCardView key={card.repo} card={card} />
          ))}
        </div>
        {cards.length === 0 && state?.fetchedAt && <p id="empty">Няма PR-и, които да те засягат.</p>}
        {state?.recentlyClosed.length ? <RecentlyClosedView pullRequests={state.recentlyClosed} /> : null}
      </main>
    </>
  );
}
