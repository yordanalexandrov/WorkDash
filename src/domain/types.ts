export type PullRequest = {
  repo: string; // owner/name
  number: number;
  title: string;
  url: string;
  author: string;
  updatedAt: string;
};

/** What one poll learns from GitHub. */
export type Snapshot = {
  viewer: string;
  pullRequests: PullRequest[];
};
