import type { WorkEvent, WorkLogPr, WorkRole } from "./api.js";
import { count } from "./badges.js";

/** How far back the Свършено panel looks: today, yesterday, or the last 7 or 14 days, today among them. */
export type WorkWindow = "today" | "yesterday" | "7" | "14";
export const WORK_WINDOWS: [WorkWindow, string][] = [
  ["today", "днес"],
  ["yesterday", "вчера"],
  ["7", "7 дни"],
  ["14", "14 дни"],
];

export type WorkGroupBy = "day" | "repo" | "ticket";
export const WORK_GROUPINGS: [WorkGroupBy, string][] = [
  ["day", "ден"],
  ["repo", "repo"],
  ["ticket", "тикет"],
];

/** Which PRs the list shows: all, mine, or the others' I reviewed. */
export type WorkShown = "all" | WorkRole;

/** A local day as YYYY-MM-DD. */
export type Day = string;

const WEEKDAYS = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

const pad = (n: number) => String(n).padStart(2, "0");

/** The local day of an instant. */
export const dayOf = (at: string | Date): Day => {
  const date = typeof at === "string" ? new Date(at) : at;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const noon = (day: Day) => new Date(`${day}T12:00:00`);

export const isWeekend = (day: Day) => [0, 6].includes(noon(day).getDay());

/** "пн 09.11". */
export const dayLabel = (day: Day) => `${WEEKDAYS[noon(day).getDay()]} ${day.slice(8)}.${day.slice(5, 7)}`;

/** The weekday alone: "пн". */
export const weekday = (day: Day) => WEEKDAYS[noon(day).getDay()]!;

/** "днес" or "вчера" for those two days, "" for any other. */
export function relativeDay(day: Day, today: Day): string {
  if (day === today) return "днес";
  return day === shift(today, -1) ? "вчера" : "";
}

function shift(day: Day, days: number): Day {
  const date = noon(day);
  date.setDate(date.getDate() + days);
  return dayOf(date);
}

/** The days of the window, the oldest first. */
export function windowDays(window: WorkWindow, today: Day): Day[] {
  if (window === "today") return [today];
  if (window === "yesterday") return [shift(today, -1)];
  const n = Number(window);
  return Array.from({ length: n }, (_, i) => shift(today, i - n + 1));
}

/** One PR on one day: what I did on it that day, oldest first. */
export type WorkEntry = { pr: WorkLogPr; day: Day; events: WorkEvent[] };

/** Every PR on every day of `days` that I did something on it, by day, then in the order of the PRs. */
export function workEntries(pullRequests: WorkLogPr[], days: Day[]): WorkEntry[] {
  const wanted = new Set(days);
  const entries: WorkEntry[] = [];
  for (const day of days) {
    for (const pr of pullRequests) {
      const events = pr.events.filter((event) => dayOf(event.at) === day);
      if (events.length && wanted.has(day)) entries.push({ pr, day, events });
    }
  }
  return entries;
}

/** What I did on a PR on a day, in a few words: "отворен", "4 commit-а", "review ✓", "merged", "3 коментара". */
export function workActions(events: WorkEvent[]): { kind: string; text: string }[] {
  const times = (kind: WorkEvent["kind"]) => events.filter((event) => event.kind === kind).length;
  const actions: { kind: string; text: string }[] = [];
  if (times("opened")) actions.push({ kind: "opened", text: "отворен" });
  const commits = times("commit");
  if (commits) actions.push({ kind: "commit", text: count(commits, "commit", "commit-а") });
  const verdicts = events.flatMap((event) => (event.kind === "review" ? [event.verdict] : []));
  // One review mark a day, by its strongest verdict: an approval after changes asked for is what the day ended with.
  const verdict = verdicts.findLast((v) => v !== "commented") ?? verdicts.at(-1);
  if (verdict === "approved") actions.push({ kind: "approved", text: "review ✓" });
  if (verdict === "changes") actions.push({ kind: "changes", text: "review ✗ промени" });
  if (verdict === "commented") actions.push({ kind: "commented", text: "review" });
  const comments = times("comment");
  if (comments) actions.push({ kind: "comment", text: count(comments, "коментар", "коментара") });
  if (times("merged")) actions.push({ kind: "merged", text: "merged" });
  if (times("closed")) actions.push({ kind: "closed", text: "затворен" });
  return actions;
}

/** A PR in a group, with each of its days in the group and what I did on it then. */
export type WorkRow = { key: string; pr: WorkLogPr; days: { day: Day; events: WorkEvent[] }[] };

/** A group of the list: a day (an empty working day has no rows), a repo or a Jira ticket. */
export type WorkGroup = { id: string; title: string; day?: Day; rows: WorkRow[] };

const prKey = (pr: WorkLogPr) => `${pr.repo}#${pr.number}`;

function rowsOf(entries: WorkEntry[]): WorkRow[] {
  const rows = new Map<string, WorkRow>();
  for (const { pr, day, events } of entries) {
    const key = prKey(pr);
    const row = rows.get(key) ?? { key, pr, days: [] };
    row.days.push({ day, events });
    rows.set(key, row);
  }
  return [...rows.values()];
}

/** The title of a ticket: the title of the first PR that names it, as Jira itself is not read. */
export function ticketTitle(entries: WorkEntry[], key: string): string {
  return entries.find(({ pr }) => pr.jira.some((link) => link.key === key))?.pr.title ?? "";
}

/**
 * The list's groups. By day, the newest first, every working day of `days` (an empty one with no rows) and a weekend
 * only with something in it; by repo in name order; by ticket in key order, a PR under each ticket it names, then
 * "Без тикет". Within a day a PR is one row; by repo or ticket a row holds each of its days, the newest first.
 */
export function workGroups(entries: WorkEntry[], days: Day[], by: WorkGroupBy, today: Day): WorkGroup[] {
  if (by === "day") {
    return [...days].reverse().flatMap((day) => {
      const rows = rowsOf(entries.filter((entry) => entry.day === day));
      if (rows.length === 0 && isWeekend(day)) return [];
      const relative = relativeDay(day, today);
      return [{ id: day, day, title: relative ? `${dayLabel(day)} · ${relative}` : dayLabel(day), rows }];
    });
  }
  const newestFirst = [...entries].sort((a, b) => b.day.localeCompare(a.day));
  if (by === "repo") {
    const repos = [...new Set(entries.map(({ pr }) => pr.repo))].sort((a, b) => a.localeCompare(b));
    return repos.map((repo) => ({ id: repo, title: repo, rows: rowsOf(newestFirst.filter(({ pr }) => pr.repo === repo)) }));
  }
  const keys = [...new Set(entries.flatMap(({ pr }) => pr.jira.map((link) => link.key)))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const groups: WorkGroup[] = keys.map((key) => ({
    id: `ticket:${key}`,
    title: `${key} ${ticketTitle(entries, key)}`,
    rows: rowsOf(newestFirst.filter(({ pr }) => pr.jira.some((link) => link.key === key))),
  }));
  const none = newestFirst.filter(({ pr }) => pr.jira.length === 0);
  if (none.length) groups.push({ id: "ticket:none", title: "Без тикет", rows: rowsOf(none) });
  return groups;
}

/** A cell of the day strip: how many of my PRs and of the others' I did something on that day. */
export type DayCell = { day: Day; author: number; review: number; hole: boolean; weekend: boolean };

/** The day strip, the oldest day first; a working day with nothing is a hole in the log. */
export function dayCells(entries: WorkEntry[], days: Day[]): DayCell[] {
  return days.map((day) => {
    const ofDay = entries.filter((entry) => entry.day === day);
    const author = ofDay.filter(({ pr }) => pr.role === "author").length;
    const review = ofDay.length - author;
    return { day, author, review, hole: ofDay.length === 0 && !isWeekend(day), weekend: isWeekend(day) };
  });
}

/**
 * What "Копирай" puts in the clipboard, whatever the list shows: the days of the window, the oldest first (a weekend
 * only with something in it, an empty working day as "—"), and in each the tickets with the PRs under them, then
 * "Без тикет".
 */
export function workMarkdown(entries: WorkEntry[], days: Day[]): string {
  const out: string[] = [];
  const line = ({ pr, events }: WorkEntry) =>
    `  - ${pr.repo}#${pr.number} (${pr.role === "author" ? "автор" : "review"}): ${workActions(events)
      .map((action) => action.text)
      .join(", ")}`;
  for (const day of days) {
    const ofDay = entries.filter((entry) => entry.day === day);
    if (ofDay.length === 0 && isWeekend(day)) continue;
    out.push(`## ${dayLabel(day)}`);
    if (ofDay.length === 0) {
      out.push("—");
      continue;
    }
    const keys = [...new Set(ofDay.flatMap(({ pr }) => pr.jira.map((link) => link.key)))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    for (const key of keys) {
      out.push(`${key} ${ticketTitle(entries, key)}`);
      for (const entry of ofDay) if (entry.pr.jira.some((link) => link.key === key)) out.push(line(entry));
    }
    const none = ofDay.filter(({ pr }) => pr.jira.length === 0);
    if (none.length) {
      out.push("Без тикет");
      for (const entry of none) out.push(line(entry));
    }
  }
  return out.join("\n");
}
