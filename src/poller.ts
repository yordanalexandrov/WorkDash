import type { SnapshotStore } from "./db.js";
import { fetchSnapshot } from "./github/client.js";

export type Poller = {
  lastError(): string | null;
  stop(): void;
};

/** Polls GitHub right away and then every `intervalMs`, saving each snapshot to the store. */
export function startPoller(options: {
  repos: string[];
  token: string;
  intervalMs: number;
  store: SnapshotStore;
  log: { info(msg: string): void; error(msg: string): void };
}): Poller {
  const { repos, token, intervalMs, store, log } = options;
  let lastError: string | null = null;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  async function poll() {
    try {
      const snapshot = await fetchSnapshot({ repos, token });
      store.saveSnapshot(snapshot, new Date());
      lastError = snapshot.problems.length ? snapshot.problems.join("; ") : null;
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
