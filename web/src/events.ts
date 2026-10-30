import type { DashboardState } from "./api.js";
import type { MissedNotice, PrEvent } from "./notifications.js";

/**
 * Every event the server pushes over /api/events, by SSE event name, with the data it carries.
 * A new kind of server event gets its entry here, and then `subscribe`/`useServerEvent` take it.
 */
export type ServerEvents = {
  /** The whole dashboard, on connect and after every poll. */
  dashboard: DashboardState;
  /** Something that happened on a PR since the previous poll, to show as a desktop notification. */
  notification: PrEvent;
  /** The events no browser showed, summed up once; `quiet` lists them without a desktop notification. */
  missed: MissedNotice;
};

export type StreamStatus = "connecting" | "open" | "reconnecting";

export type EventStream = {
  subscribe<K extends keyof ServerEvents>(type: K, handler: (data: ServerEvents[K]) => void): () => void;
  status(): StreamStatus;
  onStatus(listener: (status: StreamStatus) => void): () => void;
  close(): void;
};

/** The part of the browser's EventSource this module uses. */
export type EventSourceLike = {
  readonly readyState: number;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener(type: string, listener: (event: { data: string }) => void): void;
  close(): void;
};

const CLOSED = 2;

/**
 * Opens one SSE connection that any number of subscribers share. The browser retries a dropped
 * connection by itself; when it gives up (an HTTP error, a restarting server) this opens a new one.
 */
export function openEventStream(options: {
  url: string;
  EventSource?: new (url: string) => EventSourceLike;
  retryMs?: number;
}): EventStream {
  const { url, EventSource = globalThis.EventSource as new (url: string) => EventSourceLike, retryMs = 3_000 } = options;
  const handlers = new Map<string, Set<(data: never) => void>>();
  const statusListeners = new Set<(status: StreamStatus) => void>();
  let status: StreamStatus = "connecting";
  let source: EventSourceLike;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  function setStatus(next: StreamStatus) {
    if (next === status) return;
    status = next;
    for (const listener of statusListeners) listener(status);
  }

  function listen(type: string) {
    source.addEventListener(type, (event) => {
      const data = JSON.parse(event.data) as never;
      for (const handler of handlers.get(type) ?? []) handler(data);
    });
  }

  function connect() {
    source = new EventSource(url);
    source.onopen = () => setStatus("open");
    source.onerror = () => {
      setStatus("reconnecting");
      if (source.readyState !== CLOSED || closed) return;
      source.close();
      retryTimer = setTimeout(connect, retryMs);
    };
    for (const type of handlers.keys()) listen(type);
  }

  connect();

  return {
    subscribe(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        handlers.set(type, (set = new Set()));
        listen(type);
      }
      set.add(handler as (data: never) => void);
      return () => set.delete(handler as (data: never) => void);
    },
    status: () => status,
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      source.close();
    },
  };
}
