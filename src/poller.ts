import type { SnapshotStore } from "./db.js";
import { updateRecentlyClosed, vanishedPullRequests } from "./domain/closed.js";
import { fetchClosedPullRequests, fetchSnapshot } from "./github/client.js";

export type PollerSettings = {
  repos: string[];
  token: string;
  intervalMs: number;
  /** How long a merged or closed PR stays in the recently closed list. */
  recentlyClosedWindowMs: number;
};

export type Poller = {
  lastError(): string | null;
  /** Switches to new settings and polls with them as soon as any poll under way has finished. */
  reconfigure(settings: PollerSettings): void;
  stop(): void;
};

/**
 * Polls GitHub right away and then every `intervalMs`, saving each snapshot to the store.
 * A PR that left the open list since the last poll is looked up once by number; if it was merged
 * or closed, it is kept apart from the open PRs for `recentlyClosedWindowMs`.
 */
export function startPoller(
  options: PollerSettings & {
    store: SnapshotStore;
    log: { info(msg: string): void; error(msg: string): void };
    fetch?: typeof globalThis.fetch;
  },
): Poller {
  const { store, log, fetch } = options;
  let { repos, token, intervalMs, recentlyClosedWindowMs } = options;
  let lastError: string | null = null;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let polling = false;
  let pollAgain = false;

  async function poll() {
    polling = true;
    try {
      const previous = store.loadSnapshot()?.pullRequests ?? [];
      const snapshot = await fetchSnapshot({ repos, token, fetch });
      const vanished = vanishedPullRequests(previous, snapshot.pullRequests, snapshot.unreadRepos);
      const lookup = await fetchClosedPullRequests({ pullRequests: vanished, token, fetch }).catch((error: Error) => ({
        closed: [],
        problems: [`looking up closed PRs failed: ${error.message}`],
      }));
      const now = new Date();
      store.saveSnapshot(snapshot, now);
      store.saveRecentlyClosed(
        updateRecentlyClosed({
          known: store.loadRecentlyClosed(),
          newlyClosed: lookup.closed,
          open: snapshot.pullRequests,
          now,
          windowMs: recentlyClosedWindowMs,
        }),
      );
      const problems = [...snapshot.problems, ...lookup.problems];
      lastError = problems.length ? problems.join("; ") : null;
      log.info(`poll: ${snapshot.pullRequests.length} open PRs across ${repos.length} repos`);
      if (lastError) log.error(`poll problems: ${lastError}`);
    } catch (error) {
      lastError = (error as Error).message;
      log.error(`poll failed: ${lastError}`);
    }
    polling = false;
    if (!stopped) timer = setTimeout(poll, pollAgain ? 0 : intervalMs);
    pollAgain = false;
  }

  void poll();

  return {
    lastError: () => lastError,
    reconfigure(settings) {
      ({ repos, token, intervalMs, recentlyClosedWindowMs } = settings);
      if (stopped) return;
      if (polling) {
        pollAgain = true;
      } else {
        clearTimeout(timer);
        void poll();
      }
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
