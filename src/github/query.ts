/**
 * Builds one GraphQL query that fetches the viewer and the open PRs of every repo,
 * one `rN: repository(...)` alias per repo, so a poll costs a single request.
 */
export const PAGE_SIZE = 100;
const REVIEWERS_PAGE_SIZE = 20;
const CHECKS_PAGE_SIZE = 50;

export function buildSnapshotQuery(repos: string[]): { query: string; variables: Record<string, string> } {
  const variables: Record<string, string> = {};
  const params: string[] = [];
  const fields: string[] = [];

  repos.forEach((repo, i) => {
    const [owner, name] = repo.split("/") as [string, string];
    variables[`owner${i}`] = owner;
    variables[`name${i}`] = name;
    params.push(`$owner${i}: String!`, `$name${i}: String!`);
    fields.push(`  r${i}: repository(owner: $owner${i}, name: $name${i}) { ...openPullRequests }`);
  });

  const query = `query Snapshot(${params.join(", ")}) {
  viewer { login }
${fields.join("\n")}
}

fragment openPullRequests on Repository {
  nameWithOwner
  pullRequests(states: OPEN, first: ${PAGE_SIZE}, orderBy: { field: UPDATED_AT, direction: DESC }) {
    nodes {
      number
      title
      headRefName
      body
      url
      isDraft
      createdAt
      updatedAt
      mergeable
      mergeStateStatus
      reviewDecision
      author { login }
      reviewRequests(first: ${REVIEWERS_PAGE_SIZE}) { nodes { requestedReviewer { ... on User { login } } } }
      latestReviews(first: ${REVIEWERS_PAGE_SIZE}) { nodes { author { login } state submittedAt } }
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: ${CHECKS_PAGE_SIZE}) {
                nodes {
                  __typename
                  ... on CheckRun { name status conclusion checkSuite { app { slug } } }
                  ... on StatusContext { context state }
                }
              }
            }
          }
        }
      }
    }
    pageInfo { hasNextPage }
  }
}`;

  return { query, variables };
}

/**
 * Builds one GraphQL query that looks up PRs by number, one `rN: repository(...)` alias per repo
 * and one `pM: pullRequest(number: ...)` alias per PR, to learn whether each was merged or closed.
 * Returns the repos and numbers in alias order, so the answer can be mapped back.
 */
export function buildClosedQuery(pullRequests: { repo: string; number: number }[]): {
  query: string;
  variables: Record<string, string>;
  aliases: { repo: string; numbers: number[] }[];
} {
  const aliases: { repo: string; numbers: number[] }[] = [];
  for (const { repo, number } of pullRequests) {
    const entry = aliases.find((candidate) => candidate.repo === repo);
    if (entry) entry.numbers.push(number);
    else aliases.push({ repo, numbers: [number] });
  }

  const variables: Record<string, string> = {};
  const params: string[] = [];
  const fields: string[] = [];
  aliases.forEach(({ repo, numbers }, i) => {
    const [owner, name] = repo.split("/") as [string, string];
    variables[`owner${i}`] = owner;
    variables[`name${i}`] = name;
    params.push(`$owner${i}: String!`, `$name${i}: String!`);
    const lookups = numbers.map((number, j) => `    p${j}: pullRequest(number: ${number}) { ...closedPullRequest }`);
    fields.push(`  r${i}: repository(owner: $owner${i}, name: $name${i}) {\n${lookups.join("\n")}\n  }`);
  });

  const query = `query ClosedPullRequests(${params.join(", ")}) {
${fields.join("\n")}
}

fragment closedPullRequest on PullRequest {
  number
  title
  url
  author { login }
  state
  closedAt
}`;

  return { query, variables, aliases };
}
