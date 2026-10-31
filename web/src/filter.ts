// The filter of the shared toolbar: repos, "only mine" and a text query. It knows nothing of PRs, so the table and
// an issues board use it as it is; each says through `fields` what repo, author and texts an item has.

import { sameLogin } from "../../src/domain/activity.js";

/** No repo picked means every repo; `mine` keeps what the viewer wrote. */
export type Filter = { repos: string[]; mine: boolean; query: string };

/** What the filter looks at in one item; `texts` are what the query searches. */
export type FilterFields = { repo: string; author: string; texts: string[] };

export const NO_FILTER: Filter = { repos: [], mine: false, query: "" };

/** Whether any of the texts holds the query, whatever the case; an empty query lets everything through. */
export function matchesQuery(texts: string[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || texts.some((text) => text.toLowerCase().includes(needle));
}

/** The items the filter keeps, in their order; with `mine` and no viewer yet, none. */
export function filterItems<T>(items: T[], filter: Filter, fields: (item: T) => FilterFields, viewer: string | null): T[] {
  return items.filter((item) => {
    const { repo, author, texts } = fields(item);
    return (
      (filter.repos.length === 0 || filter.repos.includes(repo)) &&
      (!filter.mine || (viewer !== null && sameLogin(author, viewer))) &&
      matchesQuery(texts, filter.query)
    );
  });
}

/** Picks the repo, or takes it out if it was picked; none left picked means every repo. */
export function toggleRepo(filter: Filter, repo: string): Filter {
  const repos = filter.repos.includes(repo) ? filter.repos.filter((r) => r !== repo) : [...filter.repos, repo];
  return { ...filter, repos };
}

export type RepoChip = { repo: string; count: number };

/** One chip per repo of the open and closed items, in name order, with how many open items it has before any filter. */
export function repoChips(openRepos: string[], closedRepos: string[]): RepoChip[] {
  const counts = new Map<string, number>();
  for (const repo of closedRepos) counts.set(repo, 0);
  for (const repo of openRepos) counts.set(repo, (counts.get(repo) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([repo, count]) => ({ repo, count }));
}
