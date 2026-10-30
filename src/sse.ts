/** Where the hub writes: an HTTP response, or any stream in tests. */
export type EventSink = {
  write(chunk: string): unknown;
  end(): unknown;
  once(event: "close", listener: () => void): unknown;
};

export type ServerEvent = { type: string; data: unknown };

/**
 * The server's one Server-Sent Events channel. Every connected browser gets every
 * broadcast; the `type` becomes the SSE event name the browser subscribes to.
 */
export type EventHub = {
  /** Adds a client and sends it `initial` right away, so it does not wait for the next broadcast. */
  connect(sink: EventSink, initial?: ServerEvent[]): void;
  broadcast(type: string, data: unknown): void;
  clientCount(): number;
  /** Ends every connection; the server cannot close while one is open. */
  close(): void;
};

/** How long the browser waits before reconnecting a dropped stream. */
const RETRY_MS = 3_000;
/** Proxies drop connections that stay silent; a comment line every so often keeps them open. */
const KEEP_ALIVE_MS = 25_000;

export function formatEvent(type: string, data: unknown): string {
  // JSON.stringify escapes newlines, so the data always fits on one `data:` line.
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createEventHub(options: { keepAliveMs?: number } = {}): EventHub {
  const clients = new Set<EventSink>();
  const keepAlive = setInterval(() => {
    for (const client of clients) client.write(": keep-alive\n\n");
  }, options.keepAliveMs ?? KEEP_ALIVE_MS);
  keepAlive.unref();

  return {
    connect(sink, initial = []) {
      clients.add(sink);
      sink.once("close", () => clients.delete(sink));
      sink.write(`retry: ${RETRY_MS}\n\n`);
      for (const event of initial) sink.write(formatEvent(event.type, event.data));
    },
    broadcast(type, data) {
      const message = formatEvent(type, data);
      for (const client of clients) client.write(message);
    },
    clientCount: () => clients.size,
    close() {
      clearInterval(keepAlive);
      for (const client of clients) client.end();
      clients.clear();
    },
  };
}
