// A followed repo by name: GitHub ignores the case of a repo's name, so "My-Org/Repo" and "my-org/repo" are one repo.

/** The name a repo is keyed by wherever its case must not matter (a map, a set, a store's key). */
export const repoKey = (repo: string) => repo.toLowerCase();

/** Whether two names are of one repo. */
export const sameRepo = (a: string, b: string) => repoKey(a) === repoKey(b);

/**
 * The repos whose issues are on after a PR poll, in the order of `repos`: those the poll read with their issues on, and of
 * those it could not read (`unread`), the ones that had them on before, so a repo GitHub did not answer for keeps its tab.
 */
export function issueReposAfterPoll(options: { repos: string[]; read: string[]; unread: string[]; previous: string[] }): string[] {
  const { repos, read, unread, previous } = options;
  return repos.flatMap((repo) => {
    const known = unread.some((name) => sameRepo(name, repo)) ? previous : read;
    return known.filter((name) => sameRepo(name, repo)).slice(0, 1);
  });
}
