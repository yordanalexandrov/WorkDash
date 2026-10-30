import type { SnapshotStore, StoredSnapshot } from "./db.js";
import type { ClassifyRules } from "./domain/classify.js";
import { diffSnapshots } from "./domain/events.js";
import { isQuietAt, type NotificationRules, summarizeMissed } from "./domain/notify.js";
import type { Snapshot } from "./domain/types.js";
import type { EventHub, ServerEvent } from "./sse.js";

/** How many missed events the summary lists at most; it counts all of them. */
const MISSED_LIMIT = 50;
/** How long a pushed event waits for a browser to acknowledge it before it counts as missed. */
const ACK_WAIT_MS = 30_000;

export type Notifier = {
  /** After a poll saved `current`: records the events since `previous` and pushes the ones that notify. */
  afterSnapshot(previous: StoredSnapshot | null, current: Snapshot): void;
  /** For a browser that just connected: the summary of the missed events, now marked delivered. */
  takePending(): ServerEvent[];
  /** Pushes the summary of the missed events to the open browsers, e.g. once quiet hours are over. */
  flushMissed(): void;
  /** Marks the events a browser showed delivered. */
  acknowledge(ids: string[]): void;
};

/** Turns the difference between two polls into notifications; an event stays undelivered until a browser shows it. */
export function createNotifier(options: {
  store: SnapshotStore;
  events: EventHub;
  rules: () => ClassifyRules;
  notifications: () => NotificationRules;
  timeZone?: string;
  now?: () => Date;
}): Notifier {
  const { store, events, rules, notifications, timeZone, now = () => new Date() } = options;
  /** Events pushed but not acknowledged yet, with when they were pushed. */
  const awaitingAck = new Map<string, number>();

  /** The summary of the missed events, now marked delivered; null when there is none. */
  function takeMissed(): ServerEvent | null {
    const current = notifications();
    const at = now();
    const ackDue = at.getTime() - ACK_WAIT_MS;
    const undelivered = store.undeliveredEvents().filter((event) => (awaitingAck.get(event.id) ?? 0) <= ackDue);
    const missed = summarizeMissed(undelivered, current, MISSED_LIMIT);
    // Exactly what was read: the turned-off types too, so turning one back on does not bring them up.
    const ids = undelivered.map((event) => event.id);
    store.markDelivered(ids);
    for (const id of ids) awaitingAck.delete(id);
    return missed && { type: "missed" as const, data: { ...missed, quiet: isQuietAt(current.quietHours, at, timeZone) } };
  }

  function flushMissed() {
    if (events.clientCount() === 0 || isQuietAt(notifications().quietHours, now(), timeZone)) return;
    const missed = takeMissed();
    if (missed) events.broadcast(missed.type, missed.data);
  }

  return {
    afterSnapshot(previous, current) {
      const at = now();
      const { enabled, quietHours } = notifications();
      const found = diffSnapshots(previous, current, rules(), store.loadSeen());
      // Before recording, so the summary holds only what was missed before this poll.
      flushMissed();
      const fresh = store.recordEvents(found, at);
      store.markDelivered(fresh.filter((event) => !enabled[event.type]).map((event) => event.id));
      if (events.clientCount() === 0 || isQuietAt(quietHours, at, timeZone)) return;
      for (const event of fresh.filter((event) => enabled[event.type])) {
        awaitingAck.set(event.id, at.getTime());
        events.broadcast("notification", event);
      }
    },
    takePending: () => {
      const missed = takeMissed();
      return missed ? [missed] : [];
    },
    flushMissed,
    acknowledge(ids) {
      store.markDelivered(ids);
      for (const id of ids) awaitingAck.delete(id);
    },
  };
}
