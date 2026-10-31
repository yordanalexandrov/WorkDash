import css from "../../public/style.css";
import { RecentlyClosedView } from "../../src/components/RecentlyClosedView.js";
import { RepoCardView } from "../../src/components/RepoCardView.js";
import { statusText } from "../../src/format.js";
import { groupByRepo } from "../../src/group.js";
import type { VariantProps } from "../types.js";

export const name = "Сегашен";

/** The dashboard as main renders it today, for comparison. */
export function View({ state, onSeen }: VariantProps) {
  const cards = groupByRepo(state.sections);
  return (
    <>
      <style>{css}</style>
      <header>
        <h1>WorkDash</h1>
        <p id="status">{statusText(state)}</p>
      </header>
      <main>
        <div id="repos">
          {cards.map((card) => (
            <RepoCardView key={card.repo} card={card} onSeen={onSeen} />
          ))}
        </div>
        {state.recentlyClosed.length ? <RecentlyClosedView pullRequests={state.recentlyClosed} /> : null}
      </main>
    </>
  );
}
