import type { SnapshotStore, StoredSnapshot } from "./db.js";
import type { ClassifyRules } from "./domain/classify.js";
import { diffSnapshots, type PrEvent } from "./domain/events.js";
import type { Snapshot } from "./domain/types.js";
import type { EventHub, ServerEvent } from "./sse.js";

/** The SSE event name a PR event is pushed under. */
export const NOTIFICATION = "notification";

/** How many undelivered events a browser gets at most when it connects. */
const PENDING_LIMIT = 20;

export type Notifier = {
  /** After a poll saved `current`: finds the events since `previous`, records them and pushes them to open browsers. */
  afterSnapshot(previous: StoredSnapshot | null, current: Snapshot): void;
  /** The undelivered events for a browser that just connected, now marked delivered. */
  takePending(): ServerEvent[];
};

/**
 * Turns the difference between two polls into notifications. Every event is recorded; one that
 * `shouldNotify` holds back stays undelivered and is offered again on the next poll or connect.
 * `shouldNotify` is where notification rules plug in; by default every event notifies.
 */
export function createNotifier(options: {
  store: SnapshotStore;
  events: EventHub;
  rules: () => ClassifyRules;
  shouldNotify?: (event: PrEvent) => boolean;
}): Notifier {
  const { store, events, rules, shouldNotify = () => true } = options;

  function take(): PrEvent[] {
    const pending = store.undeliveredEvents(PENDING_LIMIT).filter(shouldNotify);
    store.markDelivered(pending.map((event) => event.id));
    return pending;
  }

  return {
    afterSnapshot(previous, current) {
      store.recordEvents(diffSnapshots(previous, current, rules(), store.loadSeen()), new Date());
      if (events.clientCount() === 0) return;
      for (const event of take()) events.broadcast(NOTIFICATION, event);
    },
    takePending: () => take().map((event) => ({ type: NOTIFICATION, data: event })),
  };
}
