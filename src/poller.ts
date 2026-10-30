import type { SnapshotStore } from "./db.js";
import { fetchSnapshot } from "./github/client.js";

export type PollerSettings = { repos: string[]; token: string; intervalMs: number };

export type Poller = {
  lastError(): string | null;
  /** Switches to new settings and polls with them as soon as any poll under way has finished. */
  reconfigure(settings: PollerSettings): void;
  stop(): void;
};

/** Polls GitHub right away and then every `intervalMs`, saving each snapshot to the store. */
export function startPoller(
  options: PollerSettings & {
    store: SnapshotStore;
    log: { info(msg: string): void; error(msg: string): void };
    fetch?: typeof globalThis.fetch;
  },
): Poller {
  const { store, log, fetch } = options;
  let { repos, token, intervalMs } = options;
  let lastError: string | null = null;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let polling = false;
  let pollAgain = false;

  async function poll() {
    polling = true;
    try {
      const snapshot = await fetchSnapshot({ repos, token, fetch });
      store.saveSnapshot(snapshot, new Date());
      lastError = snapshot.problems.length ? snapshot.problems.join("; ") : null;
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
