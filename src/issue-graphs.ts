import type { IssueFamily } from "./domain/issue-graph.js";
import { repoKey } from "./domain/repos.js";
import { fetchIssueFamily } from "./github/issue-graph.js";

/** How long an issue's family, once fetched, is served again instead of asking GitHub: its sheet opened again soon after. */
const GRAPH_GAP_MS = 60_000;

/**
 * The Dependency graph's families, fetched when an issue's detail sheet opens and kept a minute per issue. Apart from the
 * issue poller: a failure here is thrown to whoever asked and is neither kept nor counted against the poll.
 */
export type IssueGraphs = {
  /** The family of `repo#number`: what was fetched within the last minute, unless `refresh` (the family changed since). */
  family: (repo: string, number: number, options?: { refresh?: boolean }) => Promise<IssueFamily>;
};

export function createIssueGraphs(options: { token: () => string | null; fetch?: typeof globalThis.fetch; now?: () => Date }): IssueGraphs {
  const { token, fetch, now = () => new Date() } = options;
  const kept = new Map<string, { at: number; family: Promise<IssueFamily> }>();
  return {
    family(repo, number, { refresh = false } = {}) {
      const key = `${repoKey(repo)}#${number}`;
      const at = now().getTime();
      for (const [old, entry] of kept) if (at - entry.at >= GRAPH_GAP_MS) kept.delete(old);
      const hit = kept.get(key);
      if (hit && !refresh && at - hit.at < GRAPH_GAP_MS) return hit.family;
      const saved = token();
      if (saved === null) return Promise.reject(new Error("no GitHub token saved"));
      const family = fetchIssueFamily({ repo, number, token: saved, fetch });
      kept.set(key, { at, family });
      // A failure is not kept: the next open asks again.
      family.catch(() => kept.get(key)?.family === family && kept.delete(key));
      return family;
    },
  };
}
