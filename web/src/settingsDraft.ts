// What the Settings screen edits, apart from how it shows it: the draft, its fields' issues, the quiet hours, the stages.

import type { FieldIssue, IssueLabel, SettingsForm } from "./api.js";

/** Whether the draft differs from the settings it was opened with. */
export function changed(draft: SettingsForm, saved: SettingsForm): boolean {
  return JSON.stringify(draft) !== JSON.stringify(saved);
}

/** The message for the field at `path` ("repos[1]"), if the server refused it. */
export function issueAt(issues: FieldIssue[], path: string): string | undefined {
  return issues.find((issue) => issue.path === path)?.message;
}

/** The issues no field on the screen shows, so the screen lists them on top. */
export function strayIssues(issues: FieldIssue[], shown: (path: string) => boolean): FieldIssue[] {
  return issues.filter((issue) => !shown(issue.path));
}

/** A list with `item` added at the end, trimmed and once only; the same list when it is empty or there already. */
export function withItem(list: string[], item: string): string[] {
  const value = item.trim();
  return !value || list.some((existing) => existing.toLowerCase() === value.toLowerCase()) ? list : [...list, value];
}

/** The list with the item at `from` moved to `to`; the same list when either is past its ends. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** The repos that take the common list of stages: those without a list of their own. */
export function onCommonList(issues: SettingsForm["issues"], repos: string[]): string[] {
  const own = new Set(Object.keys(issues.repos).map((repo) => repo.toLowerCase()));
  return repos.filter((repo) => !own.has(repo.toLowerCase()));
}

/** Each repo's labels on GitHub, or null for a repo GitHub did not answer about. */
export type RepoLabels = Record<string, IssueLabel[] | null>;

/** The labels of `repos` to offer for a list of stages, once each and without those in `list` already. */
export function labelHints(labels: RepoLabels, repos: string[], list: string[]): string[] {
  const seen = new Set(list.map((label) => label.toLowerCase()));
  const hints: string[] = [];
  for (const repo of repos) {
    for (const { name } of labels[repo] ?? []) {
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      hints.push(name);
    }
  }
  return hints;
}

/** The repos of `repos` whose labels on GitHub do not have `label`; a repo GitHub did not answer about is not doubted. */
export function missingFrom(label: string, labels: RepoLabels, repos: string[]): string[] {
  const wanted = label.toLowerCase();
  return repos.filter((repo) => {
    const known = labels[repo];
    return known != null && !known.some(({ name }) => name.toLowerCase() === wanted);
  });
}

export type QuietRange = { on: boolean; from: string; to: string };

const DEFAULT_QUIET = { from: "19:00", to: "09:00" };

/** "19:00-09:00" as two times; off, with the usual evening to morning ready, when there are none. */
export function readQuiet(value: string | null): QuietRange {
  const [from, to] = value?.split("-") ?? [];
  return from && to ? { on: true, from, to } : { on: false, ...DEFAULT_QUIET };
}

export function writeQuiet({ on, from, to }: QuietRange): string | null {
  return on ? `${from}-${to}` : null;
}
