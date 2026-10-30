import { EVENT_TYPES, type EventType, type PrEvent } from "./events.js";

/** Which events notify and when: `notifications.<type>` and `notifications.quiet_hours` in config.yaml. */
export type NotificationRules = {
  enabled: Record<EventType, boolean>;
  quietHours: QuietHours | null;
};

/** Every event type notifies, at any time. */
export const ALL_ENABLED: NotificationRules = {
  enabled: Object.fromEntries(EVENT_TYPES.map((type) => [type, true])) as Record<EventType, boolean>,
  quietHours: null,
};

/**
 * The events that were recorded but never shown: no browser was open, or it was quiet hours.
 * They are handed over at once, as one summary, rather than as a burst of notifications.
 */
export type Missed = {
  /** How many were missed, the ones left out of `events` too. */
  total: number;
  byType: Partial<Record<EventType, number>>;
  /** The newest ones, newest first. */
  events: PrEvent[];
};

/** The summary of the undelivered events (oldest first), types turned off left out; null when nothing that notifies was missed. */
export function summarizeMissed(undelivered: PrEvent[], rules: NotificationRules, limit: number): Missed | null {
  const missed = undelivered.filter((event) => rules.enabled[event.type]);
  if (missed.length === 0) return null;
  const byType: Partial<Record<EventType, number>> = {};
  for (const event of missed) byType[event.type] = (byType[event.type] ?? 0) + 1;
  return { total: missed.length, byType, events: missed.reverse().slice(0, limit) };
}

/** A daily time range with no notifications, in minutes since midnight; `end` before `start` crosses midnight. */
export type QuietHours = { start: number; end: number };

const QUIET_HOURS = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

/** Reads "HH:MM-HH:MM" (such as "19:00-09:00"); null when it is not a valid, non-empty range. */
export function parseQuietHours(text: string): QuietHours | null {
  const match = QUIET_HOURS.exec(text);
  if (!match) return null;
  const [h1, m1, h2, m2] = match.slice(1).map(Number) as [number, number, number, number];
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;
  const start = h1 * 60 + m1;
  const end = h2 * 60 + m2;
  return start === end ? null : { start, end };
}

/** Minutes since midnight on the wall clock of `timeZone` (the process's own zone when undefined). */
function minuteOfDay(now: Date, timeZone: string | undefined): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => Number(parts.find((candidate) => candidate.type === type)?.value);
  return part("hour") * 60 + part("minute");
}

/** Whether `now` falls within the quiet hours, read on the clock of `timeZone`. The start counts as quiet, the end does not. */
export function isQuietAt(quiet: QuietHours | null, now: Date, timeZone: string | undefined): boolean {
  if (!quiet) return false;
  const minute = minuteOfDay(now, timeZone);
  return quiet.start < quiet.end
    ? minute >= quiet.start && minute < quiet.end
    : minute >= quiet.start || minute < quiet.end;
}
