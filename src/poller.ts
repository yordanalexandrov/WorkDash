import type { SnapshotStore, StoredSnapshot } from "./db.js";
import { updateRecentlyClosed, vanishedPullRequests } from "./domain/closed.js";
import { classifyPollError, nextPollDelay, type PollHealth } from "./domain/poll-error.js";
import type { Snapshot } from "./domain/types.js";
import { fetchClosedPullRequests, fetchSnapshot } from "./github/client.js";

export type PollerSettings = {
  repos: string[];
  token: string;
  intervalMs: number;
  /** How long a merged or closed PR stays in the recently closed list. */
  recentlyClosedWindowMs: number;
};

export type Poller = {
  health(): PollHealth;
  /** Switches to new settings and polls with them as soon as any poll under way has finished. */
  reconfigure(settings: PollerSettings): void;
  stop(): void;
};

/**
 * Polls GitHub right away and then every `intervalMs` (longer while a rate limit lasts),
 * saving each snapshot to the store. A failed poll leaves the last good snapshot in place.
 * `onPoll` runs after every poll, failed or not, e.g. to push the new state to browsers.
 *
 * A PR that left the open list since the last poll is looked up once by number; if it was merged
 * or closed, it is kept apart from the open PRs for `recentlyClosedWindowMs`. When that lookup
 * fails outright, the whole poll fails and nothing is saved, so the next poll looks again.
 */
export function startPoller(
  options: PollerSettings & {
    store: SnapshotStore;
    log: { info(msg: string): void; error(msg: string): void };
    onPoll?: () => void;
    /** Runs after a successful poll saved its snapshot, with the snapshot saved before it (null on the first poll ever). */
    onSnapshot?: (previous: StoredSnapshot | null, current: Snapshot) => void;
    fetch?: typeof globalThis.fetch;
  },
): Poller {
  const { store, log, onPoll = () => {}, onSnapshot = () => {}, fetch } = options;
  let { repos, token, intervalMs, recentlyClosedWindowMs } = options;
  let health: PollHealth = { error: null, problems: [] };
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let polling = false;
  let pollAgain = false;

  async function poll() {
    polling = true;
    try {
      const before = store.loadSnapshot();
      const previous = before?.pullRequests ?? [];
      // Taken before the request, so a comment posted while it is under way stays unread.
      const startedAt = new Date();
      const snapshot = await fetchSnapshot({ repos, token, fetch, previous });
      const vanished = vanishedPullRequests(previous, snapshot.pullRequests, snapshot.unreadRepos);
      const lookup = await fetchClosedPullRequests({ pullRequests: vanished, token, fetch });
      const now = new Date();
      // Only comments after a PR first showed up count as unread; marked before saving, so no
      // reader sees a new PR without its mark.
      store.markFirstSeen(snapshot.pullRequests, startedAt);
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
      try {
        onSnapshot(before, snapshot);
      } catch (error) {
        log.error(`after snapshot: ${(error as Error).message}`);
      }
      const problems = [...snapshot.problems, ...lookup.problems];
      health = { error: null, problems };
      log.info(`poll: ${snapshot.pullRequests.length} open PRs across ${repos.length} repos`);
      if (problems.length) log.error(`poll problems: ${problems.join("; ")}`);
    } catch (error) {
      health = { error: classifyPollError(error, new Date()), problems: [] };
      log.error(`poll failed (${health.error!.kind}): ${health.error!.message}`);
    }
    polling = false;
    if (stopped) return;
    try {
      onPoll();
    } catch (error) {
      log.error(`after poll: ${(error as Error).message}`);
    }
    timer = setTimeout(poll, pollAgain ? 0 : nextPollDelay(health.error, intervalMs, new Date()));
    pollAgain = false;
  }

  void poll();

  return {
    health: () => health,
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
