import { RepoCardView } from "./components/RepoCardView.js";
import { errorText, statusText } from "./format.js";
import { groupByRepo } from "./group.js";
import { useDashboard } from "./useDashboard.js";

export function App() {
  const { state, connectionError, seen } = useDashboard();
  const cards = state ? groupByRepo(state.sections) : [];
  const error = errorText(state, connectionError);

  return (
    <>
      <header>
        <h1>WorkDash</h1>
        <p id="status">{statusText(state)}</p>
      </header>
      {error && <p id="error">{error}</p>}
      <main>
        <div id="repos">
          {cards.map((card) => (
            <RepoCardView key={card.repo} card={card} onSeen={seen} />
          ))}
        </div>
        {cards.length === 0 && state?.fetchedAt && <p id="empty">Няма PR-и, които да те засягат.</p>}
      </main>
    </>
  );
}
