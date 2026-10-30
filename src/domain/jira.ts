import type { PullRequest } from "./types.js";

export type JiraConfig = {
  baseUrl: string | null; // keys link to baseUrl + key; null leaves Jira out of the dashboard
  projectKeys: string[]; // empty keeps a key of any project
};

/** A Jira ticket a PR touches, linked straight to the ticket. */
export type JiraLink = { key: string; url: string };

const JIRA_KEY = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

/** Jira keys named in the PR's branch, title or description, each once, in the order they first appear. */
export function extractJiraKeys(pr: PullRequest, jira: JiraConfig): string[] {
  const keys = [pr.headRefName, pr.title, pr.body].flatMap((text) => [...text.matchAll(JIRA_KEY)].map((match) => match[1]!));
  const wanted = (key: string) =>
    jira.projectKeys.length === 0 || jira.projectKeys.includes(key.slice(0, key.lastIndexOf("-")));
  return [...new Set(keys)].filter(wanted);
}

/** One link per Jira key of the PR; none when no base URL is configured. */
export function jiraLinks(pr: PullRequest, jira: JiraConfig): JiraLink[] {
  const { baseUrl } = jira;
  if (!baseUrl) return [];
  return extractJiraKeys(pr, jira).map((key) => ({ key, url: baseUrl + key }));
}
