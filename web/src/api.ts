import type { ClassifiedPullRequest, Section } from "../../src/domain/classify.js";
import type { JiraLink } from "../../src/domain/jira.js";
import type { PollError } from "../../src/domain/poll-error.js";
import type { Demand, DemandAnswer, PollMode } from "../../src/domain/poll-mode.js";
import type { FieldIssue, SettingsForm } from "../../src/domain/settings.js";
import type { ClosedPullRequest } from "../../src/domain/types.js";
import type { NameCheck, TokenCheck, UserCheck } from "../../src/github/rest.js";

export type { ClassifiedPullRequest, ClosedPullRequest, Demand, FieldIssue, JiraLink, NameCheck, PollError, PollMode, Section, SettingsForm, TokenCheck, UserCheck };

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
  missing: ("token" | "repos")[];
  pollMode: PollMode;
  /** Whether a poll is under way. */
  polling: boolean;
  sections: SectionOfPullRequests[];
  /** Merged or closed PRs within the configured window, most recently closed first; never part of `sections`. */
  recentlyClosed: ClosedPullRequest[];
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

/** Switches the poll mode of the server, and so of every open dashboard. */
export async function setPollMode(mode: PollMode): Promise<void> {
  const response = await fetch("/api/poll-mode", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/** Whether a token is saved, and how the screen shows it; the token itself never comes back. */
export type TokenStatus = { set: boolean; masked: string | null };

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

export type SaveSettingsResult = { ok: true; hash: string } | { ok: false; reason: "conflict" } | { ok: false; reason: "invalid"; issues: FieldIssue[] };

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
export async function saveSettings(settings: SettingsForm, hash: string): Promise<SaveSettingsResult> {
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
export async function checkNames(names: { repos: string[]; team: string[] }): Promise<{ repos: Record<string, NameCheck>; team: Record<string, UserCheck> }> {
  return json(await send("POST", "/api/config/check", names));
}

/** The repos the saved token can see, as hints for adding one. */
export async function repoSuggestions(): Promise<string[]> {
  return (await json<{ repos: string[] }>(await fetch("/api/config/suggestions"))).repos;
}
