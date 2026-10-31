import type { SnapshotStore } from "./db.js";
import { answerIssueDemand, type IssueDemand } from "./domain/issue-poll.js";
import { classifyPollError, type PollError } from "./domain/poll-error.js";
import type { DemandAnswer } from "./domain/poll-mode.js";
import { fetchIssues } from "./github/issues.js";

/** Polls the issues of one repo at a time, on demand of the pages that show it; apart from the PR poller and its health. */
export type IssuePoller = {
  /** Asks for a poll of `repo`; says whether one starts, the one under way answers it, or none is due. */
  demand(repo: string, demand: IssueDemand): DemandAnswer;
  /** Whether a poll of `repo` is under way. */
  polling(repo: string): boolean;
  /** Why the last poll of `repo` failed; null when it succeeded or none has run since the server started. */
  error(repo: string): PollError | null;
};

type RepoPoll = {
  polling: boolean;
  /** When the repo was last polled, whether that poll succeeded or not. */
  lastPolledAt: string | null;
  error: PollError | null;
};

/**
 * Creates the issue poller. It polls nothing on its own: a repo is polled when a page opens it or presses "Обнови", at most
 * once a minute for opening (`answerIssueDemand`), and a demand while its poll is under way joins that poll, so two pages on
 * one repo make one request. Each poll saves the repo's snapshot; a failed one keeps the last and is told by `error(repo)`.
 * A rate limit on any repo holds every repo back, as they share the token. `onChange` runs when a poll starts and ends.
 */
export function createIssuePoller(options: {
  store: SnapshotStore;
  token: () => string | null;
  log: { info(msg: string): void; error(msg: string): void };
  onChange: (repo: string) => void;
  fetch?: typeof globalThis.fetch;
}): IssuePoller {
  const { store, token, log, onChange, fetch } = options;
  const repos = new Map<string, RepoPoll>();
  /** The last rate limit GitHub answered with; it holds every repo back until it lifts. */
  let rateLimit: PollError | null = null;

  // GitHub ignores the case of a repo's name, and so do the pages' demands.
  const stateOf = (repo: string): RepoPoll => {
    const key = repo.toLowerCase();
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
    changed(repo);
    try {
      const snapshot = await fetchIssues({ repo, token: withToken, fetch });
      store.saveIssues(snapshot, new Date());
      state.error = null;
      rateLimit = null;
      log.info(`issues: ${snapshot.issues.length} of ${snapshot.totalCount} open in ${repo}`);
    } catch (error) {
      state.error = classifyPollError(error, new Date());
      if (state.error.kind === "rate_limit") rateLimit = state.error;
      log.error(`issues of ${repo} failed (${state.error.kind}): ${state.error.message}`);
    }
    state.lastPolledAt = new Date().toISOString();
    state.polling = false;
    changed(repo);
  }

  return {
    demand(repo, demand) {
      const withToken = token();
      if (withToken === null) return "skip";
      const state = stateOf(repo);
      const answer = answerIssueDemand({ demand, polling: state.polling, lastPolledAt: state.lastPolledAt, error: rateLimit, now: new Date() });
      if (answer === "poll") void poll(repo, state, withToken);
      return answer;
    },
    polling: (repo) => repos.get(repo.toLowerCase())?.polling ?? false,
    error: (repo) => repos.get(repo.toLowerCase())?.error ?? null,
  };
}
