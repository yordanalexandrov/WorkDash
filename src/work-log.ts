import type { SnapshotStore } from "./db.js";
import { classifyGitHubError, type GitHubFailure } from "./domain/github-error.js";
import type { JiraConfig } from "./domain/jira.js";
import { sameRepo } from "./domain/repos.js";
import { servedItems, workItem, type WorkLogState } from "./domain/work-log.js";
import { fetchWorkLog } from "./github/work-log.js";

/** How long a search, once done, is shown again instead of asking GitHub: the panel opened again, or "Обнови" pressed. */
const SEARCH_GAP_MS = 60_000;
/** How far back a search looks: the longest window the panel offers (14 days), and a day more for any time zone. */
const SEARCH_DAYS = 15;
const DAY_MS = 86_400_000;

/**
 * The Свършено panel's work log: searched for when the panel asks, at most once a minute, and saved. Apart from the
 * pollers: a failure here is told only to the panel, never to the PR poll's health or the banner.
 */
export type WorkLogs = {
  state: () => WorkLogState;
  /** Searches GitHub again unless the last search is under a minute old, then answers with the state after it. */
  refresh: () => Promise<WorkLogState>;
};

export function createWorkLogs(options: {
  store: SnapshotStore;
  repos: () => string[];
  token: () => string | null;
  jira: () => JiraConfig;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
}): WorkLogs {
  const { store, repos, token, jira, fetch, now = () => new Date() } = options;
  let running: Promise<void> | null = null;
  let error: GitHubFailure | null = null;

  const state = (): WorkLogState => {
    const saved = store.loadWorkLog();
    const followed = (saved?.items ?? []).filter((item) => repos().some((repo) => sameRepo(repo, item.repo)));
    return {
      viewer: saved?.viewer ?? null,
      fetchedAt: saved?.fetchedAt ?? null,
      pullRequests: servedItems(followed, jira()),
      fetching: running !== null,
      error,
    };
  };

  const search = async () => {
    const saved = token();
    if (saved === null) throw new Error("no GitHub token saved");
    const at = now();
    const since = new Date(at.getTime() - SEARCH_DAYS * DAY_MS);
    const found = await fetchWorkLog({ repos: repos(), since, token: saved, fetch });
    const items = found.pullRequests.flatMap((pr) => workItem(pr, found.viewer, since) ?? []);
    store.saveWorkLog({ viewer: found.viewer, items }, at);
  };

  return {
    state,
    async refresh() {
      const fetchedAt = store.loadWorkLog()?.fetchedAt;
      const fresh = fetchedAt !== undefined && now().getTime() - Date.parse(fetchedAt) < SEARCH_GAP_MS && error === null;
      if (!fresh && running === null) {
        running = search().then(
          () => void (error = null),
          (failure: unknown) => void (error = classifyGitHubError(failure, now())),
        );
        void running.finally(() => (running = null));
      }
      await running;
      return state();
    },
  };
}
