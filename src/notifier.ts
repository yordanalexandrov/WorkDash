import type { SnapshotStore, StoredSnapshot } from "./db.js";
import type { ClassifyRules } from "./domain/classify.js";
import { diffSnapshots } from "./domain/events.js";
import { isQuietAt, type NotificationRules, summarizeMissed } from "./domain/notify.js";
import type { Snapshot } from "./domain/types.js";
import type { EventHub, ServerEvent } from "./sse.js";

/** The SSE event name a PR event is pushed under. */
export const NOTIFICATION = "notification";
/** The SSE event name the summary of the missed events is pushed under. */
export const MISSED = "missed";

/** How many missed events the summary lists at most; it counts all of them. */
const MISSED_LIMIT = 50;

export type Notifier = {
  /**
   * After a poll saved `current`: finds the events since `previous` and records them. Outside quiet hours,
   * with a browser open, each new event is pushed as a notification and the ones missed before as one summary.
   */
  afterSnapshot(previous: StoredSnapshot | null, current: Snapshot): void;
  /** For a browser that just connected: the summary of the missed events, now marked delivered; nothing in quiet hours. */
  takePending(): ServerEvent[];
  /** Pushes the summary of the missed events to the open browsers, e.g. once quiet hours are over. */
  flushMissed(): void;
};

/**
 * Turns the difference between two polls into notifications, by the rules in `notifications`
 * (read on every call, so a reloaded config takes effect right away). Every event is recorded.
 * One whose type is turned off is marked delivered at once and never shown. One that comes while no
 * browser is open or in quiet hours is missed: it waits, and is handed over in a summary later.
 * Quiet hours are read on the clock of `timeZone` (the process's own zone by default).
 */
export function createNotifier(options: {
  store: SnapshotStore;
  events: EventHub;
  rules: () => ClassifyRules;
  notifications: () => NotificationRules;
  timeZone?: string;
  now?: () => Date;
}): Notifier {
  const { store, events, rules, notifications, timeZone, now = () => new Date() } = options;

  /** The summary of the missed events, now marked delivered; null when there is none or it is quiet hours. */
  function takeMissed(): ServerEvent | null {
    const current = notifications();
    if (isQuietAt(current.quietHours, now(), timeZone)) return null;
    const undelivered = store.undeliveredEvents();
    const missed = summarizeMissed(undelivered, current, MISSED_LIMIT);
    // Exactly what was read: the turned-off types too, so turning one back on does not bring them up.
    store.markDelivered(undelivered.map((event) => event.id));
    return missed && { type: MISSED, data: missed };
  }

  function flushMissed() {
    if (events.clientCount() === 0) return;
    const missed = takeMissed();
    if (missed) events.broadcast(missed.type, missed.data);
  }

  return {
    afterSnapshot(previous, current) {
      const at = now();
      const { enabled, quietHours } = notifications();
      const fresh = store.recordEvents(diffSnapshots(previous, current, rules(), store.loadSeen()), at);
      store.markDelivered(fresh.filter((event) => !enabled[event.type]).map((event) => event.id));
      if (events.clientCount() === 0 || isQuietAt(quietHours, at, timeZone)) return;
      const shown = fresh.filter((event) => enabled[event.type]);
      store.markDelivered(shown.map((event) => event.id));
      for (const event of shown) events.broadcast(NOTIFICATION, event);
      flushMissed();
    },
    takePending: () => {
      const missed = takeMissed();
      return missed ? [missed] : [];
    },
    flushMissed,
  };
}
