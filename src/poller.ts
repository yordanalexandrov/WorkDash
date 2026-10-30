import type { SnapshotStore } from "./db.js";
import { updateRecentlyClosed, vanishedPullRequests } from "./domain/closed.js";
import { fetchClosedPullRequests, fetchSnapshot } from "./github/client.js";

export type Poller = {
  lastError(): string | null;
  stop(): void;
};

/**
 * Polls GitHub right away and then every `intervalMs`, saving each snapshot to the store.
 * A PR that left the open list since the last poll is looked up once by number; if it was merged
 * or closed, it is kept apart from the open PRs for `recentlyClosedWindowMs`.
 */
export function startPoller(options: {
  repos: string[];
  token: string;
  intervalMs: number;
  recentlyClosedWindowMs: number;
  store: SnapshotStore;
  log: { info(msg: string): void; error(msg: string): void };
  fetch?: typeof globalThis.fetch;
}): Poller {
  const { repos, token, intervalMs, recentlyClosedWindowMs, store, log, fetch } = options;
  let lastError: string | null = null;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  async function poll() {
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
    if (!stopped) timer = setTimeout(poll, intervalMs);
  }

  void poll();

  return {
    lastError: () => lastError,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
