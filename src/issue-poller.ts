import type { SnapshotStore } from "./db.js";
import { answerIssueDemand, type IssueDemand, type IssuePollAnswer, nextIntervalPollAt } from "./domain/issue-poll.js";
import { classifyPollError, type PollError } from "./domain/poll-error.js";
import { fetchIssues } from "./github/issues.js";
import { repoKey } from "./domain/repos.js";

/** Polls the issues of one repo at a time, on demand of the pages that show it; apart from the PR poller and its health. */
export type IssuePoller = {
  /** Asks for a poll of `repo`; says whether one starts, the one under way answers it, or none is due, and when the interval is next due. */
  demand(repo: string, demand: IssueDemand): IssuePollAnswer;
  /** Whether a poll of `repo` is under way. */
  polling(repo: string): boolean;
  /** Why the last poll of `repo` failed; null when it succeeded or none has run since the server started. */
  error(repo: string): PollError | null;
};

type RepoPoll = {
  polling: boolean;
  /** When the last poll of the repo started, whether it succeeded or not; when its saved issues were fetched, after a restart. */
  lastPolledAt: string | null;
  error: PollError | null;
};

/**
 * Creates the issue poller. It polls nothing on its own: a repo is polled when a page opens it, comes back to it, asks on
 * the interval or presses "Обнови" (`answerIssueDemand`: at most once a minute but for "Обнови"), and a demand while its poll
 * is under way joins that poll, so two pages on one repo make one request. The page keeps the interval, as only it knows
 * whether the Issue dashboard shows; the answer tells it when to ask next. Each poll saves the repo's snapshot; a failed one keeps the last and is told by `error(repo)`.
 * A poll also fetches the repo's issues closed within `recentlyClosedWindowMs`.
 * A rate limit on any repo holds every repo back, as they share the token. `onChange` runs when a poll starts and ends.
 */
export function createIssuePoller(options: {
  store: SnapshotStore;
  token: () => string | null;
  /** The poll interval of config.yaml. */
  intervalMs: () => number;
  log: { info(msg: string): void; error(msg: string): void };
  onChange: (repo: string) => void;
  /** How far back closed issues count as recently closed (`recently_closed_window`); read on every poll. */
  recentlyClosedWindowMs: () => number;
  fetch?: typeof globalThis.fetch;
}): IssuePoller {
  const { store, token, intervalMs, log, onChange, recentlyClosedWindowMs, fetch } = options;
  const repos = new Map<string, RepoPoll>();
  /** The last rate limit GitHub answered with; it holds every repo back until it lifts. */
  let rateLimit: PollError | null = null;

  // GitHub ignores the case of a repo's name, and so do the pages' demands.
  const stateOf = (repo: string): RepoPoll => {
    const key = repoKey(repo);
    let state = repos.get(key);
    if (!state) {
      state = { polling: false, lastPolledAt: store.loadIssues(repo)?.fetchedAt ?? null, error: null };
      repos.set(key, state);
    }
    return state;
  };

  const changed = (repo: string) => {
    try {
      onChange(repo);
    } catch (error) {
      log.error(`issues of ${repo}: ${(error as Error).message}`);
    }
  };

  async function poll(repo: string, state: RepoPoll, withToken: string) {
    state.polling = true;
    state.lastPolledAt = new Date().toISOString();
    changed(repo);
    try {
      const closedSince = new Date(Date.now() - recentlyClosedWindowMs());
      // The saved issues lend their comments to the unchanged ones, so only the changed ones' are fetched.
      const snapshot = await fetchIssues({ repo, token: withToken, closedSince, fetch, previous: store.loadIssues(repo)?.issues });
      store.saveIssues(snapshot, new Date());
      state.error = null;
      rateLimit = null;
      log.info(`issues: ${snapshot.issues.length} of ${snapshot.totalCount} open in ${repo}`);
    } catch (error) {
      state.error = classifyPollError(error, new Date());
      if (state.error.kind === "rate_limit") rateLimit = state.error;
      log.error(`issues of ${repo} failed (${state.error.kind}): ${state.error.message}`);
    }
    state.polling = false;
    changed(repo);
  }

  return {
    demand(repo, demand) {
      const withToken = token();
      const state = stateOf(repo);
      const interval = intervalMs();
      const answer =
        withToken === null
          ? "skip"
          : answerIssueDemand({ demand, polling: state.polling, lastPolledAt: state.lastPolledAt, error: rateLimit, intervalMs: interval, now: new Date() });
      if (answer === "poll" && withToken !== null) void poll(repo, state, withToken);
      return { answer, dueAt: nextIntervalPollAt({ lastPolledAt: state.lastPolledAt, error: rateLimit, intervalMs: interval, now: new Date() }) };
    },
    polling: (repo) => repos.get(repoKey(repo))?.polling ?? false,
    error: (repo) => repos.get(repoKey(repo))?.error ?? null,
  };
}
