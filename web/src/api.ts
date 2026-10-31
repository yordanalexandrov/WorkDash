import type { ClassifiedPullRequest, Section } from "../../src/domain/classify.js";
import type { IssueFamily } from "../../src/domain/issue-graph.js";
import type { IssueDemand, IssuePollAnswer } from "../../src/domain/issue-poll.js";
import type { ClosedIssue, IssueBoardState, IssueLabel, StagedIssue } from "../../src/domain/issues.js";
import type { JiraLink } from "../../src/domain/jira.js";
import type { PollError } from "../../src/domain/poll-error.js";
import type { Demand, DemandAnswer, PollMode } from "../../src/domain/poll-mode.js";
import type { FieldIssue, Missing, SaveResult, SettingsForm, TokenStatus } from "../../src/domain/settings.js";
import type { ClosedPullRequest } from "../../src/domain/types.js";
import type { NamesCheck, TokenCheck } from "../../src/github/rest.js";

export type { ClassifiedPullRequest, ClosedIssue, ClosedPullRequest, Demand, FieldIssue, IssueBoardState, IssueFamily, IssueLabel, JiraLink, StagedIssue, NamesCheck, PollError, PollMode, Section, SettingsForm, TokenCheck, TokenStatus };

/** A PR as /api/prs serves it: classified, with links to the Jira tickets it names. */
export type DashboardPullRequest = ClassifiedPullRequest & { jira: JiraLink[] };

export type SectionOfPullRequests = { section: Section; pullRequests: DashboardPullRequest[] };

/** The body of GET /api/prs and of the `dashboard` server event. */
export type DashboardState = {
  viewer: string | null;
  /** When the last successful poll fetched the snapshot. */
  fetchedAt: string | null;
  pollIntervalMs: number;
  /** Why the last poll failed; the sections still hold the last good snapshot. */
  error: PollError | null;
  /** What the last successful poll could not fetch whole. */
  problems: string[];
  /** Why the config.yaml on disk is not in effect; the last valid config still is. */
  configError: string | null;
  /** What has to be set up in Settings before the dashboard can poll. */
  missing: Missing[];
  pollMode: PollMode;
  /** Whether a poll is under way. */
  polling: boolean;
  sections: SectionOfPullRequests[];
  /** Merged or closed PRs within the configured window, most recently closed first; never part of `sections`. */
  recentlyClosed: ClosedPullRequest[];
  /** The followed repos whose issues are on in GitHub, as the last poll read them: the Issue dashboard's tabs. */
  issueRepos: string[];
};

/** Marks a PR seen as of `fetchedAt`, the snapshot the page showed when I clicked "видях". */
export async function markSeen(pr: { repo: string; number: number }, fetchedAt: string | null): Promise<void> {
  const response = await fetch("/api/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: pr.repo, number: pr.number, ...(fetchedAt ? { at: fetchedAt } : {}) }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/** Tells the server which notifications this page showed; the rest stay missed. */
export async function acknowledgeNotifications(ids: string[]): Promise<void> {
  const response = await fetch("/api/notifications/ack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/** Asks the server for a poll; the poll's start and end come back over the event stream. */
export async function requestPoll(demand: Demand): Promise<DemandAnswer> {
  const response = await fetch("/api/poll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ demand }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return ((await response.json()) as { answer: DemandAnswer }).answer;
}

/** A repo's issues as last saved, each in its stage, and how its poll goes. */
export async function loadIssues(repo: string): Promise<IssueBoardState> {
  const response = await fetch(`/api/issues?repo=${encodeURIComponent(repo)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as IssueBoardState;
}

/**
 * The family of an issue, for its Dependency graph: what the server fetched within the last minute, unless `refresh` (a poll
 * brought a change in the family drawn).
 */
export async function loadIssueGraph(issue: { repo: string; number: number }, refresh: boolean): Promise<IssueFamily> {
  const query = new URLSearchParams({ repo: issue.repo, number: String(issue.number), ...(refresh ? { refresh: "true" } : {}) });
  const response = await fetch(`/api/issues/graph?${query}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as IssueFamily;
}

/** Asks the server for a poll of a repo's issues; its start and end come back over the event stream as `issues` events. */
export async function requestIssuePoll(repo: string, demand: IssueDemand): Promise<IssuePollAnswer> {
  const response = await fetch("/api/issues/poll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, reason: demand }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as IssuePollAnswer;
}

/** Switches the poll mode of the server, and so of every open dashboard. */
export async function setPollMode(mode: PollMode): Promise<void> {
  const response = await fetch("/api/poll-mode", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/** Each repo's labels on GitHub, as hints for its stage labels; null for a repo GitHub did not answer about. */
export async function repoLabels(repos: string[]): Promise<Record<string, IssueLabel[] | null>> {
  return json(await send("POST", "/api/config/labels", { repos }));
}

/** The body of GET /api/config. */
export type SettingsRead = {
  settings: SettingsForm;
  /** The hash of the file the settings were read from; a save sends it back. */
  hash: string;
  /** Why the file on disk is not valid, when the settings shown are the ones in effect; null when it is. */
  invalid: string | null;
  token: TokenStatus;
  /** The zone quiet hours are read in. */
  timeZone: string;
};

async function send(method: "PUT" | "POST", url: string, body: unknown): Promise<Response> {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function loadSettings(): Promise<SettingsRead> {
  return json(await fetch("/api/config"));
}

/** Saves the settings over the file read with `hash`: refused when it changed on disk since, or when a field is wrong. */
export async function saveSettings(settings: SettingsForm, hash: string): Promise<SaveResult> {
  const response = await send("PUT", "/api/config", { settings, hash });
  if (response.status === 409) return { ok: false, reason: "conflict" };
  if (response.status === 422) return { ok: false, reason: "invalid", issues: ((await response.json()) as { issues: FieldIssue[] }).issues };
  return { ok: true, ...(await json<{ hash: string }>(response)) };
}

/** Saves a token once GitHub takes it; says why when it does not. */
export async function saveToken(token: string): Promise<{ check: TokenCheck; token: TokenStatus | null }> {
  const response = await send("PUT", "/api/token", { token });
  if (response.status === 422) return { check: { ok: false, message: ((await response.json()) as { message: string }).message }, token: null };
  return json(response);
}

export async function checkToken(): Promise<TokenCheck> {
  return json(await send("POST", "/api/token/check", {}));
}

/** Which of the repos and logins GitHub knows, by the saved token. */
export async function checkNames(names: { repos: string[]; team: string[] }): Promise<NamesCheck> {
  return json(await send("POST", "/api/config/check", names));
}

/** The repos the saved token can see, as hints for adding one. */
export async function repoSuggestions(): Promise<string[]> {
  return (await json<{ repos: string[] }>(await fetch("/api/config/suggestions"))).repos;
}
