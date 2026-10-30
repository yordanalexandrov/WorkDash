import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EventSourceLike, openEventStream, type StreamStatus } from "../src/events.js";

/** Plays the browser's EventSource: tests push events, errors and opens through it. */
class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((event: { data: string }) => void)[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) });
  }

  /** A dropped connection; the browser retries by itself unless `fatal`, e.g. after an HTTP error. */
  fail(fatal = false) {
    this.readyState = fatal ? 2 : 0;
    this.onerror?.();
  }
}

const latest = () => FakeEventSource.instances.at(-1)!;

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

function open() {
  return openEventStream({ url: "/api/events", EventSource: FakeEventSource, retryMs: 1_000 });
}

describe("openEventStream", () => {
  it("hands each subscriber the parsed data of its event type", () => {
    const stream = open();
    const dashboards: unknown[] = [];
    const others: unknown[] = [];
    stream.subscribe("dashboard", (data) => dashboards.push(data));
    stream.subscribe("event" as "dashboard", (data) => others.push(data));

    latest().emit("dashboard", { viewer: "me" });

    expect(latest().url).toBe("/api/events");
    expect(dashboards).toEqual([{ viewer: "me" }]);
    expect(others).toEqual([]);
  });

  it("stops calling a handler once it unsubscribes", () => {
    const stream = open();
    const seen: unknown[] = [];
    const unsubscribe = stream.subscribe("dashboard", (data) => seen.push(data));

    unsubscribe();
    latest().emit("dashboard", 1);

    expect(seen).toEqual([]);
  });

  it("reports connecting, open, and reconnecting while the browser retries a dropped connection", () => {
    const stream = open();
    const statuses: StreamStatus[] = [stream.status()];
    stream.onStatus((status) => statuses.push(status));

    latest().open();
    latest().fail();
    latest().open();

    expect(statuses).toEqual(["connecting", "open", "reconnecting", "open"]);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("opens a new connection after the browser gives up, keeping the subscriptions", () => {
    const stream = open();
    const seen: unknown[] = [];
    stream.subscribe("dashboard", (data) => seen.push(data));
    const first = latest();

    first.fail(true);
    expect(stream.status()).toBe("reconnecting");
    vi.advanceTimersByTime(1_000);
    latest().emit("dashboard", 2);

    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(seen).toEqual([2]);
  });

  it("closes the connection and stops reconnecting once closed", () => {
    const stream = open();
    latest().fail(true);

    stream.close();
    vi.advanceTimersByTime(10_000);

    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
