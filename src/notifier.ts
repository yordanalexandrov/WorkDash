import type { SnapshotStore, StoredSnapshot } from "./db.js";
import type { ClassifyRules } from "./domain/classify.js";
import { diffSnapshots } from "./domain/events.js";
import { isQuietAt, type NotificationRules, summarizeMissed } from "./domain/notify.js";
import type { PollMode } from "./domain/poll-mode.js";
import type { Snapshot } from "./domain/types.js";
import type { EventHub, ServerEvent } from "./sse.js";

/** How many missed events the summary lists at most; it counts all of them. */
const MISSED_LIMIT = 50;
/** How long a pushed event waits for a browser to acknowledge it before it counts as missed. */
const ACK_WAIT_MS = 30_000;
/** In On-demand, how many events one poll notifies one by one; more come as one summary. */
const BURST_LIMIT = 3;

export type Notifier = {
  /** After a poll saved `current`: records the events since `previous` and pushes the ones that notify. */
  afterSnapshot(previous: StoredSnapshot | null, current: Snapshot): void;
  /** For a browser that just connected: the summary of the missed events, now marked delivered. */
  takePending(): ServerEvent[];
  /** Pushes the summary of the missed events to the open browsers, e.g. once quiet hours are over. */
  flushMissed(): void;
  /** Marks the events a browser showed delivered. */
  acknowledge(ids: string[]): void;
  /** Whether the notification pause is on. */
  paused(): boolean;
  /** Turns the notification pause on or off: while on, nothing is pushed, as in quiet hours. */
  setPaused(paused: boolean): void;
};

/** Turns the difference between two polls into notifications; an event stays undelivered until a browser shows it. */
export function createNotifier(options: {
  store: SnapshotStore;
  events: EventHub;
  rules: () => ClassifyRules;
  notifications: () => NotificationRules;
  /** Periodic when left out. */
  pollMode?: () => PollMode;
  timeZone?: string;
  now?: () => Date;
}): Notifier {
  const { store, events, rules, notifications, pollMode = () => "periodic", timeZone, now = () => new Date() } = options;
  /** Events pushed but not acknowledged yet, with when they were pushed. */
  const awaitingAck = new Map<string, number>();
  /** The notification pause: on until switched off, and off again after a restart. */
  let paused = false;
  /** Whether notifications are held back at `at`: in quiet hours or while paused. */
  const silentAt = (at: Date) => paused || isQuietAt(notifications().quietHours, at, timeZone);

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
    return missed && { type: "missed" as const, data: { ...missed, quiet: silentAt(at) } };
  }

  function flushMissed() {
    if (events.clientCount() === 0 || silentAt(now())) return;
    const missed = takeMissed();
    if (missed) events.broadcast(missed.type, missed.data);
  }

  return {
    afterSnapshot(previous, current) {
      const at = now();
      const { enabled } = notifications();
      const found = diffSnapshots(previous, current, rules(), store.loadSeen());
      // Before recording, so the summary holds only what was missed before this poll.
      flushMissed();
      const fresh = store.recordEvents(found, at);
      store.markDelivered(fresh.filter((event) => !enabled[event.type]).map((event) => event.id));
      if (events.clientCount() === 0 || silentAt(at)) return;
      const notify = fresh.filter((event) => enabled[event.type]);
      // A poll in On-demand can bring in all that happened since I last looked: a burst that reads better summed up.
      if (pollMode() === "on_demand" && notify.length > BURST_LIMIT) {
        const summary = summarizeMissed(notify, notifications(), MISSED_LIMIT)!;
        store.markDelivered(notify.map((event) => event.id));
        events.broadcast("missed", { ...summary, quiet: false });
        return;
      }
      for (const event of notify) {
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
    paused: () => paused,
    setPaused(next) {
      paused = next;
      // What was held back comes as one summary right away, not at the next poll.
      flushMissed();
    },
  };
}
