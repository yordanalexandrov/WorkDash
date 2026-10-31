import { useMemo } from "preact/hooks";
import { boardColumns } from "./board.js";
import { Banners } from "./components/Banners.js";
import { Board } from "./components/Board.js";
import { ClosedCard } from "./components/ClosedCard.js";
import { PrCard } from "./components/PrCard.js";
import { TopBar } from "./components/TopBar.js";
import { configErrorText, errorText, statusText } from "./format.js";
import { repoHue, repoHues } from "./palette.js";
import { useDashboard } from "./useDashboard.js";
import { useNotifications } from "./useNotifications.js";

export function App() {
  const { state, stream, seen } = useDashboard();
  const notifications = useNotifications();
  const columns = useMemo(() => (state ? boardColumns(state) : []), [state]);
  const hues = useMemo(() => repoHues(columns.flatMap((column) => column.items.map((pr) => pr.repo))), [columns]);
  const nothingOpen = columns.every((column) => column.id === "closed" || column.count === 0);

  return (
    <>
      <div class="bg" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <TopBar status={statusText(state)} stream={stream} notifications={notifications} />
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
              ? column.items.map((pr) => <ClosedCard key={`${pr.repo}#${pr.number}`} pr={pr} hue={repoHue(hues, pr.repo)} />)
              : column.items.map((pr) => (
                  <PrCard
                    key={`${pr.repo}#${pr.number}`}
                    pr={pr}
                    hue={repoHue(hues, pr.repo)}
                    {...(column.id === "waiting_on_me" ? { onSeen: seen } : {})}
                  />
                ))
          }
        </Board>
      )}
    </>
  );
}
