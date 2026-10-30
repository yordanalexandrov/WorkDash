import type { SnapshotStore } from "./db.js";
import { classifyPollError, nextPollDelay, type PollHealth } from "./domain/poll-error.js";
import { fetchSnapshot } from "./github/client.js";

export type PollerSettings = { repos: string[]; token: string; intervalMs: number };

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
 */
export function startPoller(
  options: PollerSettings & {
    store: SnapshotStore;
    log: { info(msg: string): void; error(msg: string): void };
    onPoll?: () => void;
    fetch?: typeof globalThis.fetch;
  },
): Poller {
  const { store, log, onPoll = () => {}, fetch } = options;
  let { repos, token, intervalMs } = options;
  let health: PollHealth = { error: null, problems: [] };
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let polling = false;
  let pollAgain = false;

  async function poll() {
    polling = true;
    try {
      const snapshot = await fetchSnapshot({ repos, token, fetch });
      store.saveSnapshot(snapshot, new Date());
      health = { error: null, problems: snapshot.problems };
      log.info(`poll: ${snapshot.pullRequests.length} open PRs across ${repos.length} repos`);
      if (snapshot.problems.length) log.error(`poll problems: ${snapshot.problems.join("; ")}`);
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
      ({ repos, token, intervalMs } = settings);
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
