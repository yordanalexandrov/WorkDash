import type { SnapshotStore, StoredSnapshot } from "./db.js";
import { updateRecentlyClosed, vanishedPullRequests } from "./domain/closed.js";
import { classifyPollError, nextPollDelay, type PollHealth } from "./domain/poll-error.js";
import { answerDemand, delayAfterSwitch, type Demand, type DemandAnswer, type PollMode } from "./domain/poll-mode.js";
import type { Snapshot } from "./domain/types.js";
import { fetchClosedPullRequests, fetchSnapshot } from "./github/client.js";

export type PollerSettings = {
  /** None yet: the poller waits for repos and a token before it polls. */
  repos: string[];
  token: string | null;
  intervalMs: number;
  /** How long a merged or closed PR stays in the recently closed list. */
  recentlyClosedWindowMs: number;
};

export type Poller = {
  health(): PollHealth;
  /** Whether a poll is under way. */
  polling(): boolean;
  /** The poll mode in effect. */
  mode(): PollMode;
  /** Switches the poll mode and saves it: Periodic picks the interval up from the last poll, On-demand stops polling on its own. */
  setMode(mode: PollMode): void;
  /** Asks for a poll, in either mode; says whether one starts, the one under way answers it, or none is due. */
  demand(demand: Demand): DemandAnswer;
  /** Switches to new settings and polls with them as soon as any poll under way has finished. */
  reconfigure(settings: PollerSettings): void;
  stop(): void;
};

/**
 * Polls GitHub, saving each snapshot. In the poll mode the store holds: Periodic polls right away and then every
 * `intervalMs` (longer while a rate limit lasts); On-demand polls only on a demand or a reconfigure. Without a token or
 * repos it does not poll; once GitHub refuses the token, it stops until a reconfigure brings another one.
 * A failed poll, a failed closed-PR lookup included, saves nothing, so the next poll looks again.
 */
export function startPoller(
  options: PollerSettings & {
    store: SnapshotStore;
    log: { info(msg: string): void; error(msg: string): void };
    /** Runs when a poll starts. */
    onPollStart?: () => void;
    /** Runs when a poll has ended, whether it succeeded or not. */
    onPoll?: () => void;
    /** Runs after a successful poll saved its snapshot, with the snapshot saved before it (null on the first poll ever). */
    onSnapshot?: (previous: StoredSnapshot | null, current: Snapshot) => void;
    fetch?: typeof globalThis.fetch;
  },
): Poller {
  const { store, log, onPollStart = () => {}, onPoll = () => {}, onSnapshot = () => {}, fetch } = options;
  let { repos, token, intervalMs, recentlyClosedWindowMs } = options;
  let health: PollHealth = { error: null, problems: [] };
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let polling = false;
  let pollAgain = false;
  let mode = store.loadPollMode();
  /** When the last successful poll fetched its snapshot. */
  let lastSuccessAt = store.loadSnapshot()?.fetchedAt ?? null;
  /** Whether there is anything to poll and a token to poll with. */
  const ready = () => token !== null && repos.length > 0;
  /** Whether to go on polling every interval: not while GitHub refuses the token, which only a new token mends. */
  const keepsPolling = () => mode === "periodic" && health.error?.kind !== "auth";

  async function poll() {
    polling = true;
    try {
      onPollStart();
    } catch (error) {
      log.error(`poll start: ${(error as Error).message}`);
    }
    try {
      const before = store.loadSnapshot();
      // A repo dropped from the config takes its PRs along; they did not close.
      const followed = new Set(repos.map((repo) => repo.toLowerCase()));
      const previous = (before?.pullRequests ?? []).filter((pr) => followed.has(pr.repo.toLowerCase()));
      // Taken before the request, so a comment posted while it is under way stays unread.
      const startedAt = new Date();
      const snapshot = await fetchSnapshot({ repos, token: token!, fetch, previous, observedAt: startedAt });
      const vanished = vanishedPullRequests(previous, snapshot.pullRequests, snapshot.unreadRepos);
      const lookup = await fetchClosedPullRequests({ pullRequests: vanished, token: token!, fetch });
      const now = new Date();
      // Marked before saving, so no reader sees a new PR without its mark.
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
      lastSuccessAt = now.toISOString();
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
    if (pollAgain && ready()) timer = setTimeout(poll, 0);
    else if (keepsPolling()) timer = setTimeout(poll, nextPollDelay(health.error, intervalMs, new Date()));
    pollAgain = false;
  }

  if (mode === "periodic" && ready()) void poll();

  return {
    health: () => health,
    polling: () => polling,
    mode: () => mode,
    setMode(next) {
      mode = next;
      store.savePollMode(next);
      // A poll under way schedules the next one by the new mode when it ends.
      if (stopped || polling || !ready()) return;
      clearTimeout(timer);
      if (keepsPolling()) timer = setTimeout(poll, delayAfterSwitch({ lastSuccessAt, intervalMs, error: health.error, now: new Date() }));
    },
    demand(demand) {
      // A refused token is not tried again until a new one comes.
      const answer = stopped || !ready() || health.error?.kind === "auth" ? "skip" : answerDemand({ demand, polling, lastSuccessAt, error: health.error, now: new Date() });
      if (answer === "poll") {
        clearTimeout(timer);
        void poll();
      }
      return answer;
    },
    reconfigure(settings) {
      const sameToken = settings.token === token;
      ({ repos, token, intervalMs, recentlyClosedWindowMs } = settings);
      // New settings with the token GitHub refused would only be refused again.
      if (stopped || (sameToken && health.error?.kind === "auth")) return;
      if (polling) {
        pollAgain = true;
      } else if (!ready()) {
        clearTimeout(timer);
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
