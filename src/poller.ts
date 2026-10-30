import type { SnapshotStore } from "./db.js";
import { classifyPollError, nextPollDelay, type PollHealth } from "./domain/poll-error.js";
import { fetchSnapshot } from "./github/client.js";

export type Poller = {
  health(): PollHealth;
  stop(): void;
};

/**
 * Polls GitHub right away and then every `intervalMs` (longer while a rate limit lasts),
 * saving each snapshot to the store. A failed poll leaves the last good snapshot in place.
 * `onPoll` runs after every poll, failed or not, e.g. to push the new state to browsers.
 */
export function startPoller(options: {
  repos: string[];
  token: string;
  intervalMs: number;
  store: SnapshotStore;
  log: { info(msg: string): void; error(msg: string): void };
  onPoll?: () => void;
  fetch?: typeof globalThis.fetch;
}): Poller {
  const { repos, token, intervalMs, store, log, onPoll = () => {}, fetch } = options;
  let health: PollHealth = { error: null, problems: [] };
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  async function poll() {
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
    if (stopped) return;
    try {
      onPoll();
    } catch (error) {
      log.error(`after poll: ${(error as Error).message}`);
    }
    timer = setTimeout(poll, nextPollDelay(health.error, intervalMs, new Date()));
  }

  void poll();

  return {
    health: () => health,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
