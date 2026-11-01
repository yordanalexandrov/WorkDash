// A followed repo by name: GitHub ignores the case of a repo's name, so "My-Org/Repo" and "my-org/repo" are one repo.

/** The name a repo is keyed by wherever its case must not matter (a map, a set, a store's key). */
export const repoKey = (repo: string) => repo.toLowerCase();

/** Whether two names are of one repo. */
export const sameRepo = (a: string, b: string) => repoKey(a) === repoKey(b);

/** An issue by its repo and number, wherever only which issue it is matters. */
export type IssueRef = { repo: string; number: number };

/** The key an issue is found by wherever the case of its repo's name must not matter: `<repo>#<number>`, the repo by `repoKey`. */
export const issueKey = (issue: IssueRef) => `${repoKey(issue.repo)}#${issue.number}`;

/** Whether two refs are of one issue. */
export const sameIssue = (a: IssueRef, b: IssueRef) => a.number === b.number && sameRepo(a.repo, b.repo);

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
